import os
# MODIFIED: Import db from the new central database.py file
from src.database import db
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum  as SQLAlchemyEnum,Float
from sqlalchemy.orm import relationship
from datetime import datetime
from flask import url_for
import enum
from .agent import Agent 

class MessageStatus(str, enum.Enum):
    """
    Defines the possible states of a message throughout its lifecycle.
    Using (str, enum.Enum) allows us to use the string values directly.
    """
    COMPLETE = 'COMPLETE' 
    PROCESSING = 'PROCESSING'     # Initial state when created
    THINKING = 'THINKING'
    TRANSCRIBING = 'TRANSCRIBING' # Actively being transcribed
    STREAMING = 'STREAMING'       # AI response is being streamed
    FAILED = 'FAILED'             # An unrecoverable error occurred

class Conversation(db.Model):
    __tablename__ = 'conversations'
    
    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    ai_model_id = Column(String(100), nullable=False, comment="The specific model string used, e.g. 'gpt-4o'")
    created_at = Column(DateTime, default=datetime.utcnow)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    is_pinned = db.Column(db.Boolean, default=False, nullable=False, index=True)
    # This column links the conversation to the provider that was used.
    provider_id = Column(String(100), ForeignKey('providers.id'), nullable=True)
    # --- [NEW] Add the service_id column to the model ---
    service_id = db.Column(db.String(255), nullable=False, default='chat')
    # This relationship links to all messages within this conversation
    messages = relationship('Message', back_populates='conversation', lazy='dynamic', cascade="all, delete-orphan")
    provider_service_id = Column(Integer, ForeignKey('provider_services.id'), nullable=True)
    provider_service = relationship('ProviderService')
    video_context_attachment_id = Column(Integer, ForeignKey('attachments.id'), nullable=True) # <-- ADD THIS LINE

    # --- ADD THIS NEW FIELD ---
    # For external YouTube video URLs
    video_context_url = Column(Text, nullable=True)
    # --- END NEW FIELD ---

    agent_id = Column(Integer, ForeignKey('agents.id'), nullable=True)
    agent_state = Column(db.JSON, nullable=True, comment="Stores state for multi-step agent conversations")

    # --- ADD THIS RELATIONSHIP ---
    # This creates the link back to the User model, completing the connection.
    user = relationship('User', back_populates='conversations')
    # ---------------------------
   
    # SQLAlchemy relationship to the Provider model
    provider = relationship('Provider')
        # --- ADD THIS NEW RELATIONSHIP ---
    agent = relationship('Agent')

    def __repr__(self):
        return f"<Conversation {self.id}: {self.title}>"
    
    # --- ADD THIS METHOD ---
    def to_dict(self):
        """Returns a dictionary representation of the conversation."""
        return {
            "id": self.id,
            "title": self.title,
            "ai_model_id": self.ai_model_id,
            "created_at": self.created_at.isoformat(),
            'is_deleted': self.is_deleted,
            'is_pinned': self.is_pinned,
            'provider_id': self.provider_id,
            # --- [FIX] Include the service_id in the data sent to the frontend ---
            'service_id': self.service_id,
            'provider_service_id': self.provider_service_id,
            'video_context_url': self.video_context_url 
        }
    # -----------------------
 
class Message(db.Model):
    __tablename__ = 'messages'
    
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey('conversations.id'), nullable=False)
    role = Column(String(50), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
       # --- NEW FIELD ---
    # This field will track the lifecycle status of the message.
    status = Column(SQLAlchemyEnum(MessageStatus), default=MessageStatus.COMPLETE, nullable=False)
    # --- END NEW FIELD ---
    # --- [NEW] Field to store the URL of a generated image ---
    image_url = Column(Text, nullable=True, comment="URL of a generated image, if applicable")
    # --------------------------------------------------------
    # --- ADD THIS NEW COLUMN ---
    # Stores the raw user prompt that generated an image, for context in editing.
    image_prompt = Column(Text, nullable=True)
    # ---------------------------
    # Relationship back to the Conversation model
    conversation = relationship('Conversation', back_populates='messages')

    # --- START: ADD NEW COLUMNS FOR VIDEO JOBS ---
    parent_message_id = db.Column(db.Integer, db.ForeignKey('messages.id'), nullable=True)
    job_status = db.Column(db.String(255), nullable=True) # e.g., "1/4: Planning scenes..."
    job_metadata = db.Column(db.JSON, nullable=True) # To store scene prompts, clip URLs, etc.
    children = db.relationship(
        'Message', 
        backref=db.backref('parent', remote_side=[id]),
        foreign_keys=[parent_message_id] # <-- ADD THIS LINE
    )
    # --- END: ADD NEW COLUMNS ---
    # --- START: ADD NEW COLUMNS FOR EDITING ---
    edited_message_id = db.Column(db.Integer, db.ForeignKey('messages.id'), nullable=True)
    edit_instructions = db.Column(db.Text, nullable=True)
    version = db.Column(db.Integer, nullable=False, default=1)
    # --- END: ADD NEW COLUMNS ---

    
    # One-to-one relationship with the Attachment model
    attachment = relationship('Attachment', back_populates='message', uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Message {self.id} in Conversation {self.conversation_id}>"
    
    def to_dict(self, host_url=None):
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "timestamp": self.created_at.isoformat(),
            "attachment": self.attachment.to_dict(host_url) if self.attachment else None,
            # --- ADD THIS LINE ---
            'conversation_id': self.conversation_id,
            # ---------------------
            'status': self.status.value,
            # --- [NEW] Add the image_url to the API response ---
            'imageUrl': self.image_url, 
            # -------------------------------------------------
            # --- START: ADD NEW FIELDS TO DICTIONARY ---
            'job_status': self.job_status,
            'job_metadata': self.job_metadata,
            'version': self.version,
            # --- END: ADD NEW FIELDS TO DICTIONARY ---
        }


class Attachment(db.Model):
    __tablename__ = 'attachments'
    
    id = Column(Integer, primary_key=True)
    message_id = Column(Integer, ForeignKey('messages.id'), nullable=False, unique=True)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(100), nullable=False)
    storage_url = Column(Text, nullable=False)
    transcription = Column(Text, nullable=True)
    
    # --- NEW FIELD ---
    # This will store the job ID from Speechmatics so we can link the webhook notification.
    speechmatics_job_id = Column(String(100), nullable=True, index=True)
    original_size_mb = Column(Float, nullable=True)

    # Relationship back to the Message model
    message = relationship('Message', back_populates='attachment')

    def __repr__(self):
        return f"<Attachment for Message {self.message_id}: {self.file_name}>"
    
    def to_dict(self, host_url=None):
        file_url = None
        if self.storage_url:
            # Extract just the filename from the storage_url path
            filename = os.path.basename(self.storage_url)
            
            try:
                file_url = url_for(
                    'chat.get_uploaded_file', 
                    filename=filename,  # Use only the filename here
                    _external=True,
                    _scheme='https'
                )
            except RuntimeError:
                if host_url:
                    # Ensure clean URL concatenation
                    file_url = f"{host_url.rstrip('/')}/api/uploads/{filename}"
                else:
                    file_url = f"/api/uploads/{filename}"
        
        return {
            'id': self.id,
            'fileName': os.path.basename(self.storage_url) if self.storage_url else None,
            'fileType': self.file_type,
            'fileURL': file_url,
            "transcription": self.transcription,
            "speechmatics_job_id": self.speechmatics_job_id,
            'original_size_mb': self.original_size_mb # Added for frontend display
        }
    
