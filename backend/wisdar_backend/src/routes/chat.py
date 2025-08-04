import os
import logging
from flask import Blueprint, jsonify, request, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
import re

# Database and models
from src.database import db
from src.models.user import User
from src.models.chat import Conversation, Message, Attachment, MessageStatus
from src.models.provider import ProviderService , Provider

# Celery tasks (now including the video task)
from ..tasks import orchestrate_transcription, generate_text_response, generate_image_task, orchestrate_video_processing, generate_tts_from_message ,orchestrate_long_video_generation,generate_tts_task,apply_contextual_edit_task,orchestrate_video_understanding,process_youtube_summary_task

# Utilities
from ..utils.audio_utils import allowed_file, save_file_locally, convert_audio_to_wav

chat_bp = Blueprint('chat', __name__)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)



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
    conversations = Conversation.query.filter_by(user_id=current_user_id, is_deleted=False).order_by(Conversation.is_pinned.desc(), Conversation.created_at.desc()).all()
    return jsonify([conv.to_dict() for conv in conversations])


@chat_bp.route('/conversations/<int:conversation_id>/messages', methods=['GET'])
@jwt_required()
def get_messages_for_conversation(conversation_id):
    """Get messages for a specific conversation"""
    current_user_id = get_jwt_identity()
    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id).first_or_404()
    # Assuming you have a relationship setup for messages in your Conversation model
    messages = conversation.messages.order_by(Message.created_at.asc()).all()
    return jsonify([message.to_dict(request.host_url) for message in messages])


@chat_bp.route('/conversations/initiate', methods=['POST'])
@jwt_required()
def initiate_conversation():
    """
    Create a new conversation and its first message.
    Routes to the correct backend task based on the selected service.
    """
    current_user_id = get_jwt_identity()
    data = request.form
    content = data.get('content', '')
    attachment_file = request.files.get('attachment')
    language = data.get('language')
    provider_service_id = data.get('provider_service_id')
    aspect_ratio = data.get('aspect_ratio', '16:9 - Landscape')
    image_context_url = data.get('image_context_url') # Corrected to get from 'data'

    if not provider_service_id:
        return jsonify({"message": "Provider Service ID is required"}), 400
    if not content and not attachment_file:
        return jsonify({"message": "Content or attachment required"}), 400

    try:
        provider_service = ProviderService.query.get_or_404(provider_service_id)
        service_id = provider_service.service_id
        
        # Your permission check logic is preserved
        user = User.query.get(current_user_id)
        if user.parent_id and provider_service not in user.allowed_services:
            return jsonify({"message": "Access denied. You do not have permission to use this AI service."}), 403

        # Create all necessary database objects first
        title = (content[:30] + '...') if len(content) > 30 else (content or "New Conversation")
        new_conversation = Conversation(
            title=title, user_id=current_user_id,
            ai_model_id=provider_service.model_api_id,
            provider_id=provider_service.provider_id,
            service_id=service_id,
            provider_service_id=provider_service.id
        )
        db.session.add(new_conversation)
        
        user_message = Message(content=content, role='user', conversation=new_conversation)
        db.session.add(user_message)
        
        assistant_message = Message(conversation=new_conversation, role='assistant', content='', status=MessageStatus.PROCESSING)
        db.session.add(assistant_message)

        unique_filename = None
        new_attachment = None
        if attachment_file:
            if not allowed_file(attachment_file.filename):
                return jsonify({"message": "Invalid file type"}), 400
            file_path, unique_filename = save_file_locally(attachment_file)
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type=attachment_file.content_type,
                storage_url=unique_filename,
                original_size_mb=(os.path.getsize(file_path)) / (1024 * 1024)
            )
            user_message.attachment = new_attachment
        else:
            user_message.status = MessageStatus.COMPLETE

        db.session.commit()

        # --- CORRECTED AND FINALIZED SERVICE-BASED ROUTING LOGIC ---
        is_video = attachment_file and attachment_file.content_type.startswith('video/')
        is_audio = attachment_file and attachment_file.content_type.startswith('audio/')

        if service_id == 'video-understanding':
            google_provider = Provider.query.get('google')
            api_key = google_provider.get_api_key() if google_provider else None
            if not api_key: raise ValueError("Google API key not configured.")
            
            # This passes all data directly to the Celery task to avoid race conditions.
            orchestrate_video_understanding.delay(
                full_video_path=os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename),
                prompt=content,
                model_id=new_conversation.ai_model_id,
                api_key=api_key,
                assistant_message_id=assistant_message.id,
                conversation_id=new_conversation.id,
                user_id=current_user_id
            )
            if attachment_file:
                new_conversation.video_context_attachment_id = new_attachment.id
                db.session.commit()
        
        elif service_id == 'video':
            orchestrate_long_video_generation.delay(user_message.id, assistant_message.id, aspect_ratio)
        
        elif service_id == 'image':
            generate_image_task.delay(user_message.id, assistant_message.id, image_context_url=image_context_url)

        elif service_id == 'tts':
            generate_tts_task.delay(user_message.id, assistant_message.id)
            
        elif is_video: # Fallback for transcription
            orchestrate_video_processing.delay(user_message.id, language)
            
        elif is_audio:
            orchestrate_transcription.delay(user_message.id, language)

        else: # Default to chat
            generate_text_response.delay(new_conversation.id, request.url_root, service_id, assistant_message.id)
        
        return jsonify({
            "new_conversation": new_conversation.to_dict(),
            "user_message": user_message.to_dict(request.host_url),
            "assistant_message": assistant_message.to_dict(request.host_url)
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
    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id, is_deleted=False).first_or_404()
    data = request.form
    content = data.get('content', '')
    attachment_file = request.files.get('attachment')
    language = data.get('language')
    
    # Get the service ID from the conversation, not the form, for existing chats
    provider_service = ProviderService.query.get(conversation.provider_service_id)
    service_id = provider_service.service_id if provider_service else None
    
    aspect_ratio = data.get('aspect_ratio', '16:9 - Landscape')

    if not content and not attachment_file:
        return jsonify({"message": "Content or attachment required"}), 400

    try:
        # Your permission check logic is preserved
        user = User.query.get(current_user_id)
        if user.parent_id and provider_service and provider_service not in user.allowed_services:
            return jsonify({"message": "Access denied. You do not have permission to use this AI service."}), 403

        # Your message and attachment creation logic is preserved
        user_message = Message(content=content, role='user', conversation_id=conversation.id)
        db.session.add(user_message)
        assistant_message = Message(
            conversation_id=conversation.id, role='assistant', content='', status=MessageStatus.PROCESSING
        )
        db.session.add(assistant_message)

        new_attachment = None
        if attachment_file:
            if not allowed_file(attachment_file.filename):
                return jsonify({"message": "Invalid file type"}), 400
            
            file_path, unique_filename = save_file_locally(attachment_file)
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type=attachment_file.content_type,
                storage_url=unique_filename,
                original_size_mb=(os.path.getsize(file_path) / (1024 * 1024))
            )
            user_message.attachment = new_attachment
        else:
            user_message.status = MessageStatus.COMPLETE

        db.session.commit()

        # --- CORRECTED SERVICE-BASED ROUTING LOGIC ---
        # This is now a single, mutually exclusive if/elif/else chain.
        
        is_video_attachment = attachment_file and attachment_file.content_type.startswith('video/')
        is_audio_attachment = attachment_file and attachment_file.content_type.startswith('audio/')

        if conversation.agent:
            agent_name = conversation.agent.name
            if agent_name == 'YouTube Summary':
                
                # Define the regex to find YouTube URLs
                youtube_regex = r"(https?://)?(www\.)?(youtube|youtu|youtube-nocookie)\.(com|be)/(watch\?v=|embed/|v/|.+\?v=)?([^&=%\?]{11})"
                
                # Try to find a new YouTube URL in the user's message content
                match = re.search(youtube_regex, content)
                
                url_to_use = None
                
                if match:
                    # A new URL was found in the message
                    new_url = match.group(0)
                    url_to_use = new_url
                    # CRITICAL: Update the conversation's context with the new URL
                    conversation.video_context_url = new_url
                    current_app.logger.info(f"New YouTube URL found in message. Updating context for conversation {conversation.id}.")
                else:
                    # No new URL found, fall back to the already saved context URL
                    url_to_use = conversation.video_context_url

                if not url_to_use:
                    # This happens if no URL has ever been provided for this conversation
                    # We can't proceed, so we update the assistant message with an error
                    assistant_message.status = MessageStatus.FAILED
                    assistant_message.content = "Please provide a YouTube URL to get started."
                    db.session.add(assistant_message)
                    db.session.commit() # Commit the failed message status
                    return jsonify({ "message": "Missing YouTube URL" }), 400

                # Commit all changes (like the new user message and the updated context URL)
                db.session.commit()

                # Re-trigger the YouTube task with the correct URL
                process_youtube_summary_task.delay(
                    conversation_id=conversation.id,
                    assistant_message_id=assistant_message.id,
                    youtube_settings={ "url": url_to_use }, # Use the determined URL
                    prompt=content # Use the new prompt from the user
                )
            else:
                # Fallback for any other agent type
                db.session.commit() # Commit the new messages
                generate_text_response.delay(conversation.id, request.url_root, service_id, assistant_message.id)

        # 2. IF NOT AN AGENT, PROCEED WITH THE EXISTING SERVICE-BASED ROUTING
        elif service_id == 'video-understanding':
            # This block now finds the video context and passes all data directly to the task.
            video_to_use = None
            if is_video_attachment:
                video_to_use = new_attachment
            elif conversation.video_context_attachment_id:
                video_to_use = Attachment.query.get(conversation.video_context_attachment_id)
            
            if not video_to_use:
                raise ValueError("No video found for analysis in this conversation.")

            google_provider = Provider.query.get('google')
            api_key = google_provider.get_api_key() if google_provider else None
            if not api_key: raise ValueError("Google API key not configured.")

            orchestrate_video_understanding.delay(
                full_video_path=os.path.join(current_app.config['UPLOAD_FOLDER'], video_to_use.storage_url),
                prompt=content,
                model_id=conversation.ai_model_id,
                api_key=api_key,
                assistant_message_id=assistant_message.id,
                conversation_id=conversation.id,
                user_id=current_user_id
            )
            if is_video_attachment:
                conversation.video_context_attachment_id = new_attachment.id
                db.session.commit()

        elif service_id == 'video':
            # Your existing video editing/generation logic is preserved
            last_video_message = Message.query.join(Attachment).filter(
                Message.conversation_id == conversation_id,
                Attachment.file_type.startswith('video/'),
                Message.status == MessageStatus.COMPLETE,
                Message.id != assistant_message.id
            ).order_by(Message.created_at.desc()).first()
            if last_video_message:
                apply_contextual_edit_task.delay(
                    original_assistant_message_id=last_video_message.id,
                    user_edit_message_id=user_message.id,
                    aspect_ratio=aspect_ratio
                )
            else:
                orchestrate_long_video_generation.delay(user_message.id, assistant_message.id, aspect_ratio)

        elif service_id == 'tts':
            generate_tts_task.delay(user_message.id, assistant_message.id)
        
        elif service_id == 'image':
            # Your existing image context logic is preserved
            image_context_url, original_prompt = None, None
            last_image_message = Message.query.filter(
                Message.conversation_id == conversation_id, Message.image_url.isnot(None)
            ).order_by(Message.created_at.desc()).first()
            if last_image_message:
                image_context_url = last_image_message.image_url
                original_prompt = last_image_message.image_prompt
            generate_image_task.delay(user_message.id, assistant_message.id, image_context_url=image_context_url, original_prompt=original_prompt)
        
        elif is_video_attachment:
            orchestrate_video_processing.delay(user_message.id, language)
        
        elif is_audio_attachment:
            orchestrate_transcription.delay(user_message.id, language)
        
        else:
            # Default to text generation
            generate_text_response.delay(conversation.id, request.url_root, service_id, assistant_message.id)
        
        return jsonify({
            "user_message": user_message.to_dict(request.host_url),
            "assistant_message": assistant_message.to_dict(request.host_url)
        }), 201

    except Exception as e:
        current_app.logger.error(f"Post message failed: {e}", exc_info=True)
        db.session.rollback()
        return jsonify({"message": "Error posting message"}), 500

# --- Conversation management routes (DELETE, RENAME, PIN) remain unchanged ---
@chat_bp.route('/conversations/<int:conversation_id>', methods=['DELETE'])
@jwt_required()
def soft_delete_conversation(conversation_id):
    current_user_id = get_jwt_identity()
    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id).first_or_404()
    try:
        conversation.is_deleted = True
        db.session.commit()
        return jsonify(message=f"Conversation {conversation_id} marked as deleted."), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Failed to delete conversation {conversation_id}: {e}")
        return jsonify(message="Error deleting conversation."), 500

@chat_bp.route('/conversations/<int:conversation_id>/rename', methods=['PUT'])
@jwt_required()
def rename_conversation(conversation_id):
    current_user_id = get_jwt_identity()
    data = request.get_json()
    new_title = data.get('new_title')
    if not new_title or not new_title.strip():
        return jsonify(message="New title cannot be empty."), 400
    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id).first_or_404()
    try:
        conversation.title = new_title.strip()
        db.session.commit()
        return jsonify(conversation.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Failed to rename conversation {conversation_id}: {e}")
        return jsonify(message="Error renaming conversation."), 500

@chat_bp.route('/conversations/<int:conversation_id>/pin', methods=['PUT'])
@jwt_required()
def pin_conversation(conversation_id):
    current_user_id = get_jwt_identity()
    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id).first_or_404()
    try:
        conversation.is_pinned = not conversation.is_pinned
        db.session.commit()
        return jsonify(conversation.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Failed to pin conversation {conversation_id}: {e}")
        return jsonify(message="Error pinning conversation."), 

@chat_bp.route('/messages/<int:message_id>/generate-audio', methods=['POST'])
@jwt_required()
def generate_audio_for_message(message_id):
    """
    Triggers a background task to generate TTS audio for an existing message.
    """
    current_user_id = get_jwt_identity()
    
    # Security Check: Verify the user has access to this message.
    # This query ensures the message exists and belongs to the logged-in user.
    message = Message.query.join(Conversation).filter(
        Message.id == message_id,
        Conversation.user_id == current_user_id
    ).first_or_404("Message not found or access denied.")

    # Validation: Ensure the message is from the assistant and has content.
    if message.role != 'assistant' or not message.content:
        return jsonify({"message": "Audio can only be generated for assistant messages with content."}), 400

    # Trigger the Celery task to perform the work in the background.
    generate_tts_from_message.delay(message.id)

    # Immediately return a 202 "Accepted" response to the frontend.
    return jsonify({"message": "TTS generation has started."}), 202