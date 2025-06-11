import os
import uuid
import requests
import json
from flask import Blueprint, jsonify, request, current_app, send_from_directory, url_for
from flask_jwt_extended import jwt_required, get_jwt_identity
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

chat_bp = Blueprint('chat', __name__)

#region --- AI Integration Helpers ---

def _get_gemini_response(api_key, model_id, messages):
    """Handles getting a response from the Google Gemini API."""
    try:
        genai.configure(api_key=api_key)
        model_name_map = {"gemini-2.5-pro": "gemini-1.5-pro-latest"}
        sdk_model_name = model_name_map.get(model_id, "gemini-pro")
        model = genai.GenerativeModel(sdk_model_name)
        history = [{'role': 'model' if msg.role == 'assistant' else 'user', 'parts': [msg.content]} for msg in messages]
        response = model.generate_content(history)
        return response.text
    except Exception as e:
        current_app.logger.error(f"Error calling Gemini API: {e}")
        return f"Error connecting to Gemini: {e}"

def _get_openai_response(api_key, model_id, messages):
    """Handles getting a response from the OpenAI API."""
    try:
        client = openai.OpenAI(api_key=api_key)
        history = [{"role": msg.role, "content": msg.content} for msg in messages]
        response = client.chat.completions.create(model=model_id, messages=history)
        return response.choices[0].message.content
    except Exception as e:
        current_app.logger.error(f"Error calling OpenAI API: {e}")
        return f"Error connecting to OpenAI: {e}"

def _get_anthropic_response(api_key, model_id, messages):
    """Handles getting a response from the Anthropic API."""
    try:
        client = anthropic.Anthropic(api_key=api_key)
        history = [{"role": msg.role, "content": msg.content} for msg in messages]
        response = client.messages.create(model=model_id, max_tokens=2048, messages=history)
        return response.content[0].text
    except Exception as e:
        current_app.logger.error(f"Error calling Anthropic API: {e}")
        return f"Error connecting to Anthropic: {e}"

def get_ai_response(model_id, messages):
    """Main dispatcher function to route the request to the correct AI model API."""
    ai_model = AIModel.query.get(model_id)
    if not ai_model:
        return "Error: AI model not found."

    api_key = ai_model.get_api_key()
    if not api_key or api_key == 'key_not_set':
        return f"Error: API key for {ai_model.display_name} is not configured."

    if "gemini" in model_id:
        return _get_gemini_response(api_key, model_id, messages)
    elif "gpt" in model_id:
        return _get_openai_response(api_key, model_id, messages)
    elif "claude" in model_id:
        return _get_anthropic_response(api_key, model_id, messages)
    else:
        return "Error: The specified model is not supported by the dispatcher."

#endregion

#region --- File and Speech-to-Text Helpers ---
def save_file_locally(file):
    filename = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4()}-{filename}"
    save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
    file.save(save_path)
    return save_path, unique_filename

def convert_audio_to_wav(file_path):
    try:
        y, sr = librosa.load(file_path, sr=16000)
        output_path = os.path.splitext(file_path)[0] + ".wav"
        sf.write(output_path, y, sr)
        os.remove(file_path)
        return output_path
    except Exception as e:
        current_app.logger.error(f"Failed to convert audio file {file_path}: {e}")
        if os.path.exists(file_path):
            os.remove(file_path)
        return None

def start_speechmatics_job(file_path, api_key):
    url = "https://asr.api.speechmatics.com/v2/jobs"
    headers = { "Authorization": f"Bearer {api_key}" }
    webhook_url = url_for('chat.speechmatics_webhook', _external=True, _scheme='https')
    config = {
        "type": "transcription",
        "transcription_config": { "language": "auto" },
        "language_identification_config": { "expected_languages": ["en", "fr", "ar"] },
        "notification_config": [{ "url": webhook_url, "auth_headers": [] }]
    }
    data = { 'config': json.dumps(config) }
    files = { 'data_file': open(file_path, 'rb') }
    try:
        response = requests.post(url, headers=headers, data=data, files=files, timeout=30)
        response.raise_for_status()
        return response.json().get('id')
    except requests.exceptions.RequestException as e:
        error_details = "No response body"
        if e.response is not None:
            try: error_details = e.response.json()
            except json.JSONDecodeError: error_details = e.response.text
        current_app.logger.error(f"Error starting Speechmatics job: {e}. Response body: {error_details}")
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
            wav_file_path = convert_audio_to_wav(file_path)
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
            wav_file_path = convert_audio_to_wav(file_path)
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

#region --- Webhook ---
@chat_bp.route('/webhooks/speechmatics', methods=['POST'])
def speechmatics_webhook():
    data = request.json
    if data and 'job' in data and data['job']['id']:
        job_id = data['job']['id']
        attachment = Attachment.query.filter_by(speechmatics_job_id=job_id).first()
        
        if not attachment:
            current_app.logger.warning(f"Webhook received for unknown job_id: {job_id}")
            return "Attachment not found", 404
        
        api_key = current_app.config.get('SPEECHMATICS_API_KEY')
        headers = {"Authorization": f"Bearer {api_key}"}
        transcript_url = f"https://asr.api.speechmatics.com/v2/jobs/{job_id}/transcript?format=txt"
        
        try:
            response = requests.get(transcript_url, headers=headers)
            response.raise_for_status()
            response.encoding = 'utf-8'
            transcription = response.text
            
            # Save the final transcription to the attachment object
            attachment.transcription = transcription

            # --- MODIFIED: Robustly update the message content ---
            if attachment.message:
                if attachment.message.content == "Transcription in progress...":
                    # If the message was just the placeholder, replace it.
                    attachment.message.content = transcription
                else:
                    # If the user typed text, append the transcription to it.
                    attachment.message.content = f"{attachment.message.content}\n\n--- Audio Transcription ---\n{transcription}"
            # --------------------------------------------------------

            db.session.commit()
            current_app.logger.info(f"Successfully processed transcript for job_id: {job_id}")

            # --- Trigger AI call after transcription is complete ---
            conversation = attachment.message.conversation
            if conversation:
                context_messages = conversation.messages.order_by(Message.created_at.asc()).all()
                assistant_content = get_ai_response(conversation.ai_model_id, context_messages)
                
                new_ai_message = Message(
                    conversation_id=conversation.id,
                    role='assistant',
                    content=assistant_content
                )
                db.session.add(new_ai_message)
                db.session.commit()
                current_app.logger.info(f"AI response generated and saved for conversation {conversation.id}")

        except Exception as e:
            current_app.logger.error(f"Error in webhook for job {job_id}: {e}")
            return "Error processing transcript or generating AI response", 500
            
    return "Notification received", 200
#endregion
