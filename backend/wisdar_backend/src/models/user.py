# src/models/user.py

from src.database import db
from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

class User(db.Model):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    full_name = Column(String(120), nullable=False)
    email = Column(String(120), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=True) # --- MODIFIED: Now nullable for pending invitations

    # --- MODIFIED: Added 'team_admin' role ---
    role = Column(String(20), nullable=False, default='user', comment="user, admin, or team_admin")
    credits = Column(Float, nullable=False, default=10000.0)

    # --- NEW: Fields for Team Hierarchy ---
    parent_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    sub_accounts = relationship('User', back_populates='parent', lazy='joined')
    parent = relationship('User', remote_side=[id], back_populates='sub_accounts', uselist=False)

    # --- NEW: Fields for Sub-account Management ---
    credit_limit = Column(Float, nullable=True, comment="Monthly or total credit budget for a sub-account")
    is_active = Column(Boolean, default=True, nullable=False, comment="False for pending invitations until password is set")

    # --- NEW: Relationships for Permissions ---
    # This links a user to the specific services they are allowed to use.
    allowed_services = relationship('ProviderService', secondary='user_service_permissions', back_populates='authorized_users')

    tts_voice = db.Column(db.String(50), nullable=True, default='alloy') 

    # Existing relationships
    conversations = relationship('Conversation', back_populates='user', lazy='dynamic')
    
    # The relationship to the old AIModel table has been removed for a cleaner architecture.
    def __init__(self, **kwargs):
        # Set a default value for is_active if not provided
        if 'is_active' not in kwargs:
            kwargs['is_active'] = True
        super(User, self).__init__(**kwargs)
        
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<User {self.email}>'

    def to_dict(self):
        # --- MODIFIED: Include new fields in the dictionary representation ---
        return {
            'id': self.id,
            'full_name': self.full_name,
            'email': self.email,
            'role': self.role,
            'credits': self.credits,
            'is_active': self.is_active,
            'parent_id': self.parent_id,
            'credit_limit': self.credit_limit,
            'tts_voice': self.tts_voice, # <-- ADD THIS
            # We don't return assigned_models or conversations by default to keep the payload clean
        }
