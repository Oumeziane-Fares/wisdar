from src.database import db
from sqlalchemy import Column, Integer, String, Float, Text

class ServiceCost(db.Model):
    """
    Represents the single source of truth for the cost of any billable action
    in the application, from internal tasks to specific AI service types.
    """
    __tablename__ = 'service_costs'

    id = Column(Integer, primary_key=True)
    
    # A unique machine-readable key for the service type.
    # e.g., "internal.create_team_member" or "ai.chat.input"
    service_key = Column(String(255), unique=True, nullable=False, index=True)
    
    # A human-readable name for display in admin panels.
    display_name = Column(String(255), nullable=False)
    
    # A description of what the service is for.
    description = Column(Text, nullable=True)

    # The cost in credits for one unit of this service.
    cost = Column(Float, nullable=False, default=0.0)
    
    # The unit of measurement for the cost.
    # e.g., "per_action", "per_mb_upload", "per_1k_words", "per_image"
    unit = Column(String(50), nullable=False)

    def __repr__(self):
        return f'<ServiceCost {self.service_key}>'

    def to_dict(self):
        """Returns a dictionary representation suitable for API responses."""
        return {
            'id': self.id,
            'service_key': self.service_key,
            'display_name': self.display_name,
            'description': self.description,
            'cost': self.cost,
            'unit': self.unit
        }