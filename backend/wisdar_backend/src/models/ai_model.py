# MODIFIED: Import db from the new central database.py file
from src.database import db
from sqlalchemy import Table, Column, Integer, String, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from cryptography.fernet import Fernet
import os

key_from_env = os.getenv('MODEL_ENCRYPTION_KEY')
if not key_from_env:
    raise ValueError("No MODEL_ENCRYPTION_KEY found in environment variables.")
ENCRYPTION_KEY = key_from_env.encode()
fernet = Fernet(ENCRYPTION_KEY)

# This join table now needs to be defined here, as it depends on db.
user_assigned_models = Table('user_assigned_models', db.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('model_id', String(100), ForeignKey('ai_models.id'), primary_key=True)
)

class AIModel(db.Model):
    __tablename__ = 'ai_models'
    
    id = Column(String(100), primary_key=True) # e.g., 'gpt-4o'
    display_name = Column(String(100), nullable=False) # e.g., 'ChatGPT 4o'
    api_key_encrypted = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationship back to the users assigned this model
    assigned_users = relationship('User', secondary='user_assigned_models',
                                  back_populates='assigned_models')

    def set_api_key(self, api_key: str):
        """Encrypts the API key before storing."""
        self.api_key_encrypted = fernet.encrypt(api_key.encode()).decode('utf-8')

    def get_api_key(self) -> str:
        """Decrypts the API key for use."""
        return fernet.decrypt(self.api_key_encrypted.encode()).decode('utf-8')
    # --- THIS METHOD IS REQUIRED ---
    def to_dict(self):
        """Public representation of the model, does NOT include the key."""
        return {
            'id': self.id,
            'display_name': self.display_name,
            'is_active': self.is_active
        }
    # -----------------------------

    def __repr__(self):
        return f'<AIModel {self.display_name}>'