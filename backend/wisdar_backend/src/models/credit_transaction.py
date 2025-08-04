# src/models/credit_transaction.py

from src.database import db
from sqlalchemy import Column, Integer, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

class CreditTransaction(db.Model):
    __tablename__ = 'credit_transactions'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, comment="The sub-account user who initiated the action")
    team_id = Column(Integer, ForeignKey('users.id'), nullable=False, comment="The parent team account whose credits were used")
    provider_service_id = Column(Integer, ForeignKey('provider_services.id'), nullable=False, comment="The specific service that was used")
    cost_deducted = Column(Float, nullable=False, comment="The number of credits deducted for this transaction")
    transaction_time = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships to easily fetch related data
    user = relationship('User', foreign_keys=[user_id])
    team = relationship('User', foreign_keys=[team_id])
    service_used = relationship('ProviderService')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_email': self.user.email,
            'service_name': self.service_used.service.name,
            'model_name': self.service_used.model_api_id,
            'cost_deducted': self.cost_deducted,
            'transaction_time': self.transaction_time.isoformat()
        }