# src/models/provider.py

from src.database import db
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Text, JSON, Float
from sqlalchemy.orm import relationship
from cryptography.fernet import Fernet
import os

# Encryption logic remains the same
key_from_env = os.getenv('MODEL_ENCRYPTION_KEY')
if not key_from_env:
    raise ValueError("No MODEL_ENCRYPTION_KEY found in environment variables.")
ENCRYPTION_KEY = key_from_env.encode()
fernet = Fernet(ENCRYPTION_KEY)

class Provider(db.Model):
    # This model remains unchanged from our last version.
    __tablename__ = 'providers'

    id = Column(String(100), primary_key=True, comment="e.g., 'openai', 'google'")
    name = Column(String(100), nullable=False, comment="e.g., 'OpenAI'")
    api_key_encrypted = Column(Text, nullable=True)

    services = relationship('ProviderService', back_populates='provider', cascade="all, delete-orphan")

    def set_api_key(self, api_key: str):
        if api_key:
            self.api_key_encrypted = fernet.encrypt(api_key.encode()).decode('utf-8')
        else:
            self.api_key_encrypted = None

    def get_api_key(self) -> str | None:
        if not self.api_key_encrypted:
            return None
        return fernet.decrypt(self.api_key_encrypted.encode()).decode('utf-8')

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "services": sorted([s.to_dict() for s in self.services if s.is_active], key=lambda x: x.get('name', ''))
        }

class Service(db.Model):
    # This model also remains unchanged. It's a master list of service types.
    __tablename__ = 'services'
    
    id = Column(String(100), primary_key=True, comment="e.g., 'chat', 'image'")
    name = Column(String(100), nullable=False, comment="e.g., 'Chat'")
    description = Column(String(255), nullable=True)


# --- THIS MODEL IS SIGNIFICANTLY ENHANCED ---
class ProviderService(db.Model):
    """
    This enhanced linking table provides granular control over each
    specific service offered by a provider.
    """
    __tablename__ = 'provider_services'
    
    id = Column(Integer, primary_key=True)
    provider_id = Column(String(100), ForeignKey('providers.id'), nullable=False)
    service_id = Column(String(100), ForeignKey('services.id'), nullable=False)
    model_api_id = Column(String(100), nullable=False, comment="The model ID for the API call, e.g., 'gpt-4o'")
    is_active = Column(Boolean, default=True, nullable=False, index=True, comment="Admin toggle to enable/disable this service.")

    # [NEW] Admin-facing name for easier management
    display_name = Column(String(100), nullable=True, comment="A friendly name for admin panels, e.g., 'GPT-4o (Vision)'")
    
    # [NEW] Dynamic feature flags for the UI
    capabilities = Column(JSON, nullable=True, comment='e.g., {"vision": true, "streaming": true, "tools": false}')

    provider = relationship('Provider', back_populates='services')
    service = relationship('Service', backref='provider_links')

     # --- NEW: Add this line for the reverse relationship ---
    authorized_users = relationship('User', secondary='user_service_permissions', back_populates='allowed_services')

    def to_dict(self):
        # The dictionary sent to the frontend now includes capabilities
        return {
            "providerServiceId": self.id, # --- ADD THIS LINE ---
            "id": self.service.id,
            "name": self.service.name,
            "modelId": self.model_api_id,
            "description": self.service.description,
            "capabilities": self.capabilities or {} # [NEW] Send capabilities to the frontend
        }