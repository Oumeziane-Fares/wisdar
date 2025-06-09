import os
import uuid
from flask import Blueprint, jsonify, request, current_app ,send_from_directory 
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from src.models.user import db
from src.models.chat import Conversation, Message, Attachment
from datetime import datetime

chat_bp = Blueprint('chat', __name__)

# --- Helper function to save files locally ---
def save_file_locally(file):
    """
    Saves a file to the local 'uploads' folder with a unique name.
    Returns the relative path for URL construction.
    """
    # Sanitize the filename for security
    filename = secure_filename(file.filename)
    # Create a unique filename to prevent files with the same name from overwriting each other
    unique_filename = f"{uuid.uuid4()}-{filename}"
    # Create the full, absolute path to save the file
    save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
    
    # Save the file to the specified path
    file.save(save_path)
    
    # Return the path relative to the 'static' folder, which is needed for the URL
    return unique_filename

# --- ADD THIS NEW ROUTE TO SERVE UPLOADED FILES ---
@chat_bp.route('/uploads/<path:filename>')
@jwt_required() # Optional: Protect files so only logged-in users can access them
def get_uploaded_file(filename):
    """Serves an uploaded file from the UPLOAD_FOLDER."""
    # Using send_from_directory is a secure way to send files
    return send_from_directory(current_app.config['UPLOAD_FOLDER'], filename)
# ---------------------------------------------------

# --- Conversation Routes ---

@chat_bp.route('/conversations', methods=['POST'])
@jwt_required() 
def create_conversation():
    """Creates a new conversation for the authenticated user."""
    current_user_id = get_jwt_identity()
    data = request.json
    title = data.get('title')
    ai_model_id = data.get('ai_model_id')

    if not title or not ai_model_id:
        return jsonify({"message": "Title and model ID are required"}), 400

    new_conversation = Conversation(
        title=title,
        user_id=current_user_id,
        ai_model_id=ai_model_id
    )
    db.session.add(new_conversation)
    db.session.commit()

    return jsonify(new_conversation.to_dict()), 201


@chat_bp.route('/conversations', methods=['GET'])
@jwt_required()
def get_conversations():
    """Fetches a list of all conversations for the authenticated user."""
    current_user_id = get_jwt_identity()
    user_conversations = Conversation.query.filter_by(user_id=current_user_id).order_by(Conversation.created_at.desc()).all()
    return jsonify([conversation.to_dict() for conversation in user_conversations])


@chat_bp.route('/conversations/<int:conversation_id>/messages', methods=['GET'])
@jwt_required()
def get_messages_for_conversation(conversation_id):
    """Fetches all messages for a specific conversation."""
    current_user_id = get_jwt_identity()
    # Security Check: Ensures a user can only access their own conversations
    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id).first_or_404()
    messages = Message.query.filter_by(conversation_id=conversation.id).order_by(Message.created_at.asc()).all()
    return jsonify([message.to_dict() for message in messages])


# --- Message Route ---

@chat_bp.route('/messages', methods=['POST'])
@jwt_required()
def post_message():
    current_user_id = get_jwt_identity()
    conversation_id = request.form.get('conversation_id')
    content = request.form.get('content', '')
    attachment_file = request.files.get('attachment')

    if not conversation_id:
        return jsonify({"message": "Conversation ID is required"}), 400
    
    conversation = Conversation.query.filter_by(id=conversation_id, user_id=current_user_id).first_or_404()
    
    user_message = Message(conversation_id=conversation.id, role='user', content=content)
    
    if attachment_file:
        try:
            unique_filename = save_file_locally(attachment_file)
            # MODIFIED: The URL now points to our new file-serving route
            storage_url = f"/api/uploads/{unique_filename}" # Relative URL
            
            # TODO: Implement Speechmatics API call
            transcription = f"Transcription of {attachment_file.filename}"
            if not user_message.content:
                user_message.content = transcription
                
            new_attachment = Attachment(
                file_name=secure_filename(attachment_file.filename),
                file_type=attachment_file.mimetype,
                storage_url=storage_url, # Save the API route URL
                transcription=transcription
            )
            user_message.attachment = new_attachment
        except Exception as e:
            return jsonify({"message": "Error saving file."}), 500
    
    db.session.add(user_message)
    db.session.commit()

    # --- Simulated AI Response ---
    model_name = conversation.ai_model_id
    assistant_content = f"This is a simulated response from the {model_name} model."
    assistant_message = Message(conversation_id=conversation.id, role='assistant', content=assistant_content)
    db.session.add(assistant_message)
    db.session.commit()
    
    # MODIFIED: We need to update the to_dict() methods to construct the full URL
    return jsonify({
        "user_message": user_message.to_dict(request.host_url), 
        "assistant_message": assistant_message.to_dict()
    }), 201
