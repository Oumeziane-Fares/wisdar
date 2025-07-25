import os
# MODIFIED: Import db from the new central database.py file
from src.database import db
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SQLAlchemyEnum
from sqlalchemy.orm import relationship
from datetime import datetime
from flask import url_for
import enum


class MessageStatus(str, enum.Enum):
    """
    Defines the possible states of a message throughout its lifecycle.
    Using (str, enum.Enum) allows us to use the string values directly.
    """
    COMPLETE = 'COMPLETE' 
    PROCESSING = 'PROCESSING'     # Initial state when created
    TRANSCRIBING = 'TRANSCRIBING' # Actively being transcribed
    STREAMING = 'STREAMING'       # AI response is being streamed
    FAILED = 'FAILED'             # An unrecoverable error occurred

class Conversation(db.Model):
    __tablename__ = 'conversations'
    
    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    ai_model_id = Column(String(100), ForeignKey('ai_models.id'), nullable=False) # Corrected ForeignKey
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # This relationship links to all messages within this conversation
    messages = relationship('Message', back_populates='conversation', lazy='dynamic', cascade="all, delete-orphan")

    # --- ADD THIS RELATIONSHIP ---
    # This creates the link back to the User model, completing the connection.
    user = relationship('User', back_populates='conversations')
    # ---------------------------

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
            # We can add a summary or last message preview here later if needed
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

    # Relationship back to the Conversation model
    conversation = relationship('Conversation', back_populates='messages')
    
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
            'status': self.status.value
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
            "speechmatics_job_id": self.speechmatics_job_id
        }