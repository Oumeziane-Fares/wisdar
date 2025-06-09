from src.database import db 
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from werkzeug.security import generate_password_hash, check_password_hash
# This import is necessary to link the User to the association table
from .ai_model import user_assigned_models


class User(db.Model):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    full_name = Column(String(120), nullable=False)
    email = Column(String(120), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(50), nullable=False, default='user')

    # Relationship to Conversations (one-to-many)
    conversations = relationship('Conversation', back_populates='user', lazy='dynamic', cascade="all, delete-orphan")
    
    # Relationship to AI Models (many-to-many)
    assigned_models = relationship('AIModel', secondary=user_assigned_models,
                                   lazy='subquery',
                                   back_populates='assigned_users')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<User {self.email}>'

    # --- THIS IS THE CORRECTED METHOD ---
    def to_dict(self):
        """
        Returns a dictionary representation of the user,
        INCLUDING the list of their assigned models.
        """
        return {
            'id': self.id,
            'full_name': self.full_name,
            'email': self.email,
            'role': self.role,
            # This line ensures the assigned models are included in the API response.
            # It iterates through the user's models and converts each one to a dictionary.
            'assigned_models': [model.to_dict() for model in self.assigned_models]
        }
    # ------------------------------------