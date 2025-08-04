# src/models/agent.py

from src.database import db
from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship

class Agent(db.Model):
    __tablename__ = 'agents'

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=False)
    
    # The system prompt template for the agent.
    # Can include placeholders like {user_input}.
    system_prompt = Column(Text, nullable=False)
    
    # The name of a Lucide icon for the frontend, e.g., 'BookText', 'SearchCheck'
    icon_name = Column(String(50), nullable=True)
    
    # A foreign key to the specific AI service this agent is pre-configured to use.
    provider_service_id = Column(Integer, ForeignKey('provider_services.id'), nullable=False)

    # Relationship to easily access the provider_service details
    provider_service = relationship('ProviderService')

    def to_dict(self):
        """Returns a dictionary representation of the agent."""
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'system_prompt': self.system_prompt,
            'icon_name': self.icon_name,
            'provider_service_id': self.provider_service_id
        }