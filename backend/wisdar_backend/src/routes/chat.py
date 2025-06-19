# In backend/wisdar_backend/src/routes/chat.py

from flask import Blueprint, jsonify, request, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

# Database and models
from src.database import db
from src.models.chat import Conversation, Message, Attachment, MessageStatus

# Celery tasks
from ..tasks import orchestrate_transcription, generate_text_response

# We are assuming you have moved the audio helpers to a new utils file as recommended
from ..utils.audio_utils import allowed_file, save_file_locally, convert_audio_to_wav

chat_bp = Blueprint('chat', __name__)

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
    """Get all conversations for the current user"""
    current_user_id = get_jwt_identity()
    conversations = Conversation.query.filter_by(user_id=current_user_id).order_by(Conversation.created_at.desc()).all()
    return jsonify([conv.to_dict() for conv in conversations])

@chat_bp.route('/conversations/<int:conversation_id>/messages', methods=['GET'])
@jwt_required()
def get_messages_for_conversation(conversation_id):
    """Get messages for a specific conversation"""
    current_user_id = get_jwt_identity()
    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id).first_or_404()
    messages = conversation.messages.order_by(Message.created_at.asc()).all()
    return jsonify([message.to_dict(request.host_url) for message in messages])

@chat_bp.route('/conversations/initiate', methods=['POST'])
@jwt_required()
def initiate_conversation():
    """Create a new conversation and its first message."""
    current_user_id = get_jwt_identity()
    data = request.form
    content = data.get('content', '')
    ai_model_id = data.get('ai_model_id')
    attachment_file = request.files.get('attachment')

    if not ai_model_id:
        return jsonify({"message": "AI Model ID is required"}), 400
    if not content and not attachment_file:
        return jsonify({"message": "Content or attachment required"}), 400

    try:
        title = (content[:30] + '...') if len(content) > 30 else (content or "New Conversation")
        new_conversation = Conversation(title=title, user_id=current_user_id, ai_model_id=ai_model_id)
        db.session.add(new_conversation)
        db.session.flush()

        user_message = Message(content=content, role='user', conversation_id=new_conversation.id)
        db.session.add(user_message)
        
        if attachment_file:
            if not allowed_file(attachment_file.filename):
                db.session.rollback()
                return jsonify({"message": "Invalid file type"}), 400
            
            user_message.status = MessageStatus.TRANSCRIBING
            if not user_message.content:
                 user_message.content = "Voice message"
            
            file_path, _ = save_file_locally(attachment_file)
            wav_file_path = convert_audio_to_wav(file_path, attachment_file.filename)
            
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type="audio/wav",
                storage_url=wav_file_path,
                transcription="Pending..."
            )
            user_message.attachment = new_attachment
        else:
            user_message.status = MessageStatus.COMPLETE

        db.session.commit()

        if attachment_file:
            orchestrate_transcription.delay(user_message.id)
        else:
            # --- FIX ---
            # The second argument, request.url_root, is now correctly passed.
            generate_text_response.delay(new_conversation.id, request.url_root)
            # --- END FIX ---

        return jsonify({
            "new_conversation": new_conversation.to_dict(),
            "user_message": user_message.to_dict(request.host_url)
        }), 201

    except Exception as e:
        current_app.logger.error(f"Initiate conversation failed: {e}", exc_info=True)
        db.session.rollback()
        return jsonify({"message": "Error creating conversation"}), 500

@chat_bp.route('/conversations/<int:conversation_id>/messages', methods=['POST'])
@jwt_required()
def post_message(conversation_id):
    """Add a message to an existing conversation."""
    current_user_id = get_jwt_identity()
    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id).first_or_404()
    data = request.form
    content = data.get('content', '')
    attachment_file = request.files.get('attachment')

    if not content and not attachment_file:
        return jsonify({"message": "Content or attachment required"}), 400

    try:
        user_message = Message(content=content, role='user', conversation_id=conversation.id)
        db.session.add(user_message)

        if attachment_file:
            if not allowed_file(attachment_file.filename):
                db.session.rollback()
                return jsonify({"message": "Invalid file type"}), 400
            
            user_message.status = MessageStatus.TRANSCRIBING
            if not user_message.content:
                user_message.content = "Voice message"

            file_path, _ = save_file_locally(attachment_file)
            wav_file_path = convert_audio_to_wav(file_path, attachment_file.filename)
            
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type="audio/wav",
                storage_url=wav_file_path,
                transcription="Pending..."
            )
            user_message.attachment = new_attachment
        else:
            user_message.status = MessageStatus.COMPLETE

        db.session.commit()

        if attachment_file:
            orchestrate_transcription.delay(user_message.id)
        else:
            # --- FIX ---
            # The second argument, request.url_root, is now correctly passed.
            generate_text_response.delay(conversation.id, request.url_root)
            # --- END FIX ---
        
        return jsonify({"user_message": user_message.to_dict(request.host_url)}), 201

    except Exception as e:
        current_app.logger.error(f"Post message failed: {e}", exc_info=True)
        db.session.rollback()
        return jsonify({"message": "Error posting message"}), 500

# The webhook endpoint is no longer needed and has been removed.