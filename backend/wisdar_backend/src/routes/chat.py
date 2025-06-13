import os
import uuid
import requests
import json
from flask import Blueprint, jsonify, request, current_app, send_from_directory, url_for
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_sse import sse
from werkzeug.utils import secure_filename

# --- AI SDK Imports ---
import google.generativeai as genai
import openai
import anthropic

from src.database import db
from src.models.ai_model import AIModel
from src.models.chat import Conversation, Message, Attachment
from src.models.user import User
from datetime import datetime
import librosa
import soundfile as sf
from src.tasks import process_speechmatics_transcription

# Import the new Celery task and the moved AI helper function
from ..tasks import process_speechmatics_transcription
from ..utils.ai_integration import get_ai_response

chat_bp = Blueprint('chat', __name__)



#region --- File and Speech-to-Text Helpers ---
def allowed_file(filename):
    """Checks if the uploaded file has an allowed audio extension."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in {'wav', 'mp3',  'flac', 'ogg', 'aac'}

def save_file_locally(file):
    """Saves a file to the upload folder with a unique name."""
    filename = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4()}-{filename}"
    save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
    file.save(save_path)
    return save_path, unique_filename

def convert_audio_to_wav(file_path, original_filename):
    """
    Converts an audio file to a 16kHz mono WAV file, which is optimal for most ASR services.
    """
    try:
        current_app.logger.info(f"Attempting to convert audio file: {original_filename}")
        y, sr = librosa.load(file_path, sr=16000, mono=True)
        output_path = os.path.splitext(file_path)[0] + ".wav"
        sf.write(output_path, y, sr)
        
        if file_path != output_path:
            os.remove(file_path)
            
        current_app.logger.info(f"Successfully converted '{original_filename}' to '{os.path.basename(output_path)}'")
        return output_path
    except Exception as e:
        current_app.logger.error(f"FATAL: Failed to convert audio file '{original_filename}'. Error: {e}", exc_info=True)
        if os.path.exists(file_path):
            os.remove(file_path)
        return None

def start_speechmatics_job(file_path, api_key):
    """Starts a transcription job with the Speechmatics API with improved logging."""
    
    # --- FIX: Construct webhook URL directly from the environment variable ---
    base_url = os.getenv('PUBLIC_SERVER_URL')
    if not base_url:
        current_app.logger.error("CRITICAL: PUBLIC_SERVER_URL is not set in the .env file.")
        return None
    webhook_url = f"{base_url}/api/webhooks/speechmatics"
    # ----------------------------------------------------------------------

    url = "https://asr.api.speechmatics.com/v2/jobs"
    headers = { "Authorization": f"Bearer {api_key}" }
    config = {
        "type": "transcription",
        "transcription_config": { "language": "auto" },
        # Speechmatics needs to know how to call you back
        "notification_config": [{ "url": webhook_url }] 
    }
    data = { 'config': json.dumps(config) }
    files = { 'data_file': open(file_path, 'rb') }

    # --- ADDED: More detailed logging before the request ---
    current_app.logger.info("Preparing to start Speechmatics job...")
    current_app.logger.info(f"--> Uploading file: {os.path.basename(file_path)}")
    current_app.logger.info(f"--> Setting webhook callback to: {webhook_url}")
    # ----------------------------------------------------

    try:
        response = requests.post(url, headers=headers, data=data, files=files, timeout=30)
        # This line will raise an error if the status code is 4xx or 5xx
        response.raise_for_status() 
        job_id = response.json().get('id')
        current_app.logger.info(f"Successfully started Speechmatics job with ID: {job_id}")
        return job_id
    except requests.exceptions.RequestException as e:
        # This will now catch any request-related error (connection, timeout, bad status code)
        error_details = "No response body."
        if e.response is not None:
            try:
                error_details = e.response.json()
            except json.JSONDecodeError:
                error_details = e.response.text
        current_app.logger.error(f"FATAL: Error starting Speechmatics job: {e}. Details: {error_details}")
        return None
    finally:
        if 'data_file' in files and not files['data_file'].closed:
            files['data_file'].close()
#endregion

#region --- Main API Endpoints ---
@chat_bp.route('/uploads/<path:filename>')
def get_uploaded_file(filename):
    return send_from_directory(current_app.config['UPLOAD_FOLDER'], filename)

@chat_bp.route('/conversations', methods=['GET'])
@jwt_required()
def get_conversations():
    current_user_id = get_jwt_identity()
    user_conversations = Conversation.query.filter_by(user_id=current_user_id).order_by(Conversation.created_at.desc()).all()
    return jsonify([conv.to_dict() for conv in user_conversations])

@chat_bp.route('/conversations/<int:conversation_id>/messages', methods=['GET'])
@jwt_required()
def get_messages_for_conversation(conversation_id):
    current_user_id = get_jwt_identity()
    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id).first_or_404()
    messages = conversation.messages.order_by(Message.created_at.asc()).all()
    host_url = request.host_url
    return jsonify([message.to_dict(host_url) for message in messages])

@chat_bp.route('/conversations/initiate', methods=['POST'])
@jwt_required()
def initiate_conversation():
    current_user_id = get_jwt_identity()
    ai_model_id = request.form.get('ai_model_id')
    content = request.form.get('content', '')
    attachment_file = request.files.get('attachment')

    if not ai_model_id: return jsonify({"message": "AI Model ID is required."}), 400
    if not content and not attachment_file: return jsonify({"message": "Cannot start with no content."}), 400

    title_content = content if content else "Voice Note"
    title = (title_content[:30] + '...') if len(title_content) > 30 else title_content
    
    new_conversation = Conversation(title=title, user_id=current_user_id, ai_model_id=ai_model_id)
    db.session.add(new_conversation)
    db.session.flush() 

    user_message = Message(conversation_id=new_conversation.id, role='user', content=content)
    
    if attachment_file:
        try:
            # --- This logic is now only for transcription ---
            file_path, _ = save_file_locally(attachment_file)
            # --- FIX: Pass both arguments to the function ---
            wav_file_path = convert_audio_to_wav(file_path, attachment_file.filename)
            if not wav_file_path: return jsonify({"message": "Failed to convert audio file."}), 500

            unique_filename = os.path.basename(wav_file_path)
            storage_url = url_for('chat.get_uploaded_file', filename=unique_filename, _external=False)
            
            api_key = current_app.config.get('SPEECHMATICS_API_KEY')
            if not api_key: return jsonify({"message": "Speechmatics API key is not configured."}), 500
                
            job_id = start_speechmatics_job(wav_file_path, api_key)
            if not job_id: return jsonify({"message": "Failed to start transcription job."}), 500

            transcription_placeholder = "Transcription in progress..."
            if not user_message.content:
                user_message.content = transcription_placeholder
                
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type="audio/wav",
                storage_url=storage_url,
                transcription=transcription_placeholder,
                speechmatics_job_id=job_id
            )
            user_message.attachment = new_attachment
        except Exception as e:
            current_app.logger.error(f"Error processing file upload: {e}")
            return jsonify({"message": "Error processing file."}), 500
    
    db.session.add(user_message)
    
    # --- MODIFIED: Only call AI if there is NO attachment ---
    if not attachment_file:
        context_messages = [user_message]
        assistant_content = get_ai_response(new_conversation.ai_model_id, context_messages)
        assistant_message = Message(conversation_id=new_conversation.id, role='assistant', content=assistant_content)
        db.session.add(assistant_message)
    # --------------------------------------------------------

    db.session.commit()
    
    host_url = request.host_url
    # The response will now only contain the user's message if an attachment was sent.
    # The AI message will be created later by the webhook.
    response_data = {
        "new_conversation": new_conversation.to_dict(),
        "user_message": user_message.to_dict(host_url), 
    }
    if 'assistant_message' in locals():
        response_data['assistant_message'] = assistant_message.to_dict(host_url)

    return jsonify(response_data), 201


@chat_bp.route('/messages', methods=['POST'])
@jwt_required()
def post_message():
    current_user_id = get_jwt_identity()
    conversation_id = request.form.get('conversation_id')
    content = request.form.get('content', '')
    attachment_file = request.files.get('attachment')

    if not conversation_id: return jsonify({"message": "Conversation ID is required"}), 400
    
    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id).first_or_404()
    user_message = Message(conversation_id=conversation.id, role='user', content=content)
    
    if attachment_file:
        try:
            # --- This logic is now only for transcription ---
            file_path, _ = save_file_locally(attachment_file)
            # --- FIX: Pass both arguments to the function ---
            wav_file_path = convert_audio_to_wav(file_path, attachment_file.filename)
            if not wav_file_path: return jsonify({"message": "Failed to convert audio file."}), 500
            
            unique_filename = os.path.basename(wav_file_path)
            storage_url = url_for('chat.get_uploaded_file', filename=unique_filename, _external=False)
            
            api_key = current_app.config.get('SPEECHMATICS_API_KEY')
            if not api_key: return jsonify({"message": "Speechmatics API key is not configured."}), 500
                
            job_id = start_speechmatics_job(wav_file_path, api_key)
            if not job_id: return jsonify({"message": "Failed to start transcription job."}), 500

            transcription_placeholder = "Transcription in progress..."
            if not user_message.content:
                user_message.content = transcription_placeholder
                
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type="audio/wav",
                storage_url=storage_url,
                transcription=transcription_placeholder,
                speechmatics_job_id=job_id
            )
            user_message.attachment = new_attachment
        except Exception as e:
            current_app.logger.error(f"Error processing file upload: {e}")
            return jsonify({"message": "Error processing file."}), 500
    
    db.session.add(user_message)
    db.session.commit()
    
    # --- MODIFIED: Only call AI if there is NO attachment ---
    if not attachment_file:
        context_messages = conversation.messages.order_by(Message.created_at.asc()).all()
        assistant_content = get_ai_response(conversation.ai_model_id, context_messages)
        assistant_message = Message(conversation_id=conversation.id, role='assistant', content=assistant_content)
        db.session.add(assistant_message)
        db.session.commit()
    # --------------------------------------------------------

    host_url = request.host_url
    response_data = {
        "user_message": user_message.to_dict(host_url), 
    }
    if 'assistant_message' in locals():
        response_data['assistant_message'] = assistant_message.to_dict(host_url)

    return jsonify(response_data), 201

#endregion

#region --- Webhook Route ---
# --- Webhook Route ---
@chat_bp.route('/webhooks/speechmatics', methods=['POST'])
def speechmatics_webhook():
    data = request.json
    current_app.logger.info(f"--- Webhook Received --- PAYLOAD: {data}")

    # --- FINAL FIX: Check for the 'results' array instead of 'status' ---
    # A successful job is indicated by the presence of the 'results' key.
    if not (data and data.get('results')):
        current_app.logger.warning("IGNORING WEBHOOK: Payload did not contain a 'results' array.")
        return "Notification ignored", 200
    # -------------------------------------------------------------------

    current_app.logger.info("SUCCESS: Webhook has results. Starting Celery task.")
    
    # Offload the work to the Celery task
    # We pass the full payload and the root URL for link generation
    process_speechmatics_transcription.delay(data, request.url_root)
    
    job_id = data.get('job', {}).get('id', 'N/A')
    current_app.logger.info(f"Webhook for job {job_id} received and queued for processing.")
    
    return jsonify({"status": "received and queued"}), 202

