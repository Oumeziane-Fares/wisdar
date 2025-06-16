# backend/wisdar_backend/src/routes/chat.py

import os
import uuid
import requests
import json
from datetime import datetime
from flask import Blueprint, jsonify, request, current_app, send_from_directory, url_for
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
import librosa
import soundfile as sf

# Database and models
from src.database import db
from src.models.ai_model import AIModel
from src.models.chat import Conversation, Message, Attachment
from src.models.user import User

# Celery tasks
from ..tasks import process_speechmatics_transcription, generate_text_response

chat_bp = Blueprint('chat', __name__)

# ==============================================================================
#  FILE HANDLING UTILITIES
# ==============================================================================

def allowed_file(filename: str) -> bool:
    """Check if filename has an allowed audio extension"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in {'wav', 'mp3', 'flac', 'ogg', 'aac', 'm4a'}

def save_file_locally(file) -> tuple:
    """Save uploaded file with a unique filename"""
    filename = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4()}-{filename}"
    save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
    file.save(save_path)
    return save_path, unique_filename

def convert_audio_to_wav(file_path: str, original_filename: str) -> str:
    """Convert audio to 16kHz mono WAV format optimized for ASR"""
    try:
        current_app.logger.info(f"Converting audio: {original_filename}")
        
        # Load and convert audio
        y, sr = librosa.load(file_path, sr=16000, mono=True)
        output_path = os.path.splitext(file_path)[0] + ".wav"
        sf.write(output_path, y, sr)
        
        # Clean up original file if different format
        if file_path != output_path:
            os.remove(file_path)
            
        current_app.logger.info(f"Converted to: {os.path.basename(output_path)}")
        return output_path
    except Exception as e:
        current_app.logger.error(f"Audio conversion failed: {e}", exc_info=True)
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

def start_speechmatics_job(file_path: str, api_key: str) -> str:
    """Start transcription job with Speechmatics API"""
    # Get base URL from environment
    base_url = current_app.config.get('PUBLIC_SERVER_URL')
    if not base_url:
        current_app.logger.error("PUBLIC_SERVER_URL not configured")
        raise ValueError("Server URL not configured")
    
    # Build webhook URL
    webhook_url = f"{base_url}/api/webhooks/speechmatics"
    url = "https://asr.api.speechmatics.com/v2/jobs"
    headers = {"Authorization": f"Bearer {api_key}"}
    
    # Configure job parameters
    config = {
        "type": "transcription",
        "transcription_config": {
            "language": "auto",
            "enable_entities": True,
            "diarization": "speaker"
        },
        "notification_config": [{"url": webhook_url}]
    }
    
    # Prepare request data
    data = {'config': json.dumps(config)}
    files = {'data_file': open(file_path, 'rb')}
    
    current_app.logger.info(
        f"Starting Speechmatics job for: {os.path.basename(file_path)}"
    )
    
    try:
        response = requests.post(
            url, 
            headers=headers, 
            data=data, 
            files=files, 
            timeout=30
        )
        response.raise_for_status()
        
        job_id = response.json().get('id')
        current_app.logger.info(f"Started job ID: {job_id}")
        return job_id
    except requests.exceptions.RequestException as e:
        error_details = e.response.json() if e.response else str(e)
        current_app.logger.error(
            f"Speechmatics API error: {e}\nDetails: {error_details}", 
            exc_info=True
        )
        raise
    finally:
        files['data_file'].close()

# ==============================================================================
#  API ENDPOINTS
# ==============================================================================

@chat_bp.route('/uploads/<path:filename>')
def get_uploaded_file(filename):
    """Serve uploaded files"""
    return send_from_directory(current_app.config['UPLOAD_FOLDER'], filename)

@chat_bp.route('/conversations', methods=['GET'])
@jwt_required()
def get_conversations():
    """Get all conversations for current user"""
    current_user_id = get_jwt_identity()
    conversations = Conversation.query.filter_by(
        user_id=current_user_id
    ).order_by(Conversation.created_at.desc()).all()
    
    return jsonify([conv.to_dict() for conv in conversations])

@chat_bp.route('/conversations/<int:conversation_id>/messages', methods=['GET'])
@jwt_required()
def get_messages_for_conversation(conversation_id):
    """Get messages for a specific conversation"""
    current_user_id = get_jwt_identity()
    conversation = Conversation.query.filter_by(
        id=conversation_id, 
        user_id=current_user_id
    ).first_or_404()
    
    messages = conversation.messages.order_by(Message.created_at.asc()).all()
    host_url = request.host_url
    
    return jsonify([message.to_dict(host_url) for message in messages])

@chat_bp.route('/conversations/initiate', methods=['POST'])
@jwt_required()
def initiate_conversation():
    """Create a new conversation"""
    current_user_id = get_jwt_identity()
    data = request.form
    content = data.get('content', '')
    ai_model_id = data.get('ai_model_id')
    attachment_file = request.files.get('attachment')

    # Validate input
    if not ai_model_id:
        return jsonify({"message": "AI Model ID is required"}), 400
    if not content and not attachment_file:
        return jsonify({"message": "Content or attachment required"}), 400

    # Create new conversation
    title = (content[:30] + '...') if len(content) > 30 else (content or "New Conversation")
    new_conversation = Conversation(
        title=title, 
        user_id=current_user_id, 
        ai_model_id=ai_model_id
    )
    db.session.add(new_conversation)
    db.session.flush()  # Get ID without committing

    # Create user message
    user_message = Message(
        content=content, 
        role='user', 
        conversation_id=new_conversation.id
    )
    db.session.add(user_message)

    # Handle attachment if present
    if attachment_file:
        try:
            # Validate and process file
            if not allowed_file(attachment_file.filename):
                return jsonify({"message": "Invalid file type"}), 400
                
            file_path, _ = save_file_locally(attachment_file)
            wav_file_path = convert_audio_to_wav(file_path, attachment_file.filename)
            
            # Generate storage URL
            unique_filename = os.path.basename(wav_file_path)
            storage_url = url_for('chat.get_uploaded_file', filename=unique_filename, _external=False)
            
            # Start transcription
            api_key = current_app.config.get('SPEECHMATICS_API_KEY')
            if not api_key:
                return jsonify({"message": "Speechmatics not configured"}), 500
                
            job_id = start_speechmatics_job(wav_file_path, api_key)
            
            # Create attachment
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type="audio/wav",
                storage_url=storage_url,
                transcription="Transcribing...",
                speechmatics_job_id=job_id
            )
            user_message.attachment = new_attachment
            
            # Set content placeholder
            if not user_message.content:
                user_message.content = "Voice message"
                
        except Exception as e:
            current_app.logger.error(f"Attachment processing failed: {e}", exc_info=True)
            db.session.rollback()
            return jsonify({"message": "Error processing attachment"}), 500
            
        db.session.commit()
        return jsonify({
            "new_conversation": new_conversation.to_dict(),
            "user_message": user_message.to_dict(request.host_url)
        }), 201
    
    # For text-only conversations
    db.session.commit()
    
    # Trigger AI response in background
    generate_text_response.delay(new_conversation.id, request.url_root)
    
    return jsonify({
        "new_conversation": new_conversation.to_dict(),
        "user_message": user_message.to_dict(request.host_url)
    }), 201

@chat_bp.route('/messages', methods=['POST'])
@jwt_required()
def post_message():
    """Add a message to an existing conversation"""
    current_user_id = get_jwt_identity()
    data = request.form
    conversation_id = data.get('conversation_id')
    content = data.get('content', '')
    attachment_file = request.files.get('attachment')

    # Validate input
    if not conversation_id:
        return jsonify({"message": "Conversation ID required"}), 400
        
    conversation = Conversation.query.filter_by(
        id=conversation_id, 
        user_id=current_user_id
    ).first_or_404()

    # Create user message
    user_message = Message(
        content=content, 
        role='user', 
        conversation_id=conversation.id
    )
    db.session.add(user_message)

    # Handle attachment if present
    if attachment_file:
        try:
            # Validate and process file
            if not allowed_file(attachment_file.filename):
                return jsonify({"message": "Invalid file type"}), 400
                
            file_path, _ = save_file_locally(attachment_file)
            wav_file_path = convert_audio_to_wav(file_path, attachment_file.filename)
            
            # Generate storage URL
            unique_filename = os.path.basename(wav_file_path)
            storage_url = url_for('chat.get_uploaded_file', filename=unique_filename, _external=False)
            
            # Start transcription
            api_key = current_app.config.get('SPEECHMATICS_API_KEY')
            if not api_key:
                return jsonify({"message": "Speechmatics not configured"}), 500
                
            job_id = start_speechmatics_job(wav_file_path, api_key)
            
            # Create attachment
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type="audio/wav",
                storage_url=storage_url,
                transcription="Transcribing...",
                speechmatics_job_id=job_id
            )
            user_message.attachment = new_attachment
            
            # Set content placeholder
            if not user_message.content:
                user_message.content = "Voice message"
                
        except Exception as e:
            current_app.logger.error(f"Attachment processing failed: {e}", exc_info=True)
            db.session.rollback()
            return jsonify({"message": "Error processing attachment"}), 500
            
        db.session.commit()
        return jsonify({
            "user_message": user_message.to_dict(request.host_url)
        }), 200
    
    # For text-only messages
    db.session.commit()
    
    # Trigger AI response in background
    generate_text_response.delay(conversation.id, request.url_root)
    
    return jsonify({
        "user_message": user_message.to_dict(request.host_url)
    }), 200

# ==============================================================================
#  WEBHOOK ENDPOINT
# ==============================================================================

@chat_bp.route('/webhooks/speechmatics', methods=['POST'])
def speechmatics_webhook():
    """Handle Speechmatics webhook notifications"""
    data = request.json
    current_app.logger.info(f"Speechmatics webhook received: {json.dumps(data, indent=2)}")
    
    # Validate payload
    if not data or not data.get('results'):
        current_app.logger.warning("Invalid webhook payload")
        return jsonify({"status": "ignored", "reason": "invalid_payload"}), 200
    
    # Extract job details
    job_id = data.get('job', {}).get('id', 'unknown')
    
    try:
        # Queue processing task
        process_speechmatics_transcription.delay(data, request.url_root)
        current_app.logger.info(f"Queued processing for job: {job_id}")
        return jsonify({"status": "queued"}), 202
        
    except Exception as e:
        current_app.logger.error(f"Failed to queue job {job_id}: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500