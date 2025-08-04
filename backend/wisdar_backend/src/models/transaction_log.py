from src.database import db
from sqlalchemy import Column, Integer, Float, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship

class TransactionLog(db.Model):
    __tablename__ = 'transaction_logs'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    service_cost_id = Column(Integer, ForeignKey('service_costs.id'), nullable=False, index=True)
    units_consumed = Column(Float, nullable=False, default=1.0)
    cost_deducted = Column(Float, nullable=False)
    timestamp = Column(DateTime, nullable=False, server_default=func.now())

    user = relationship('User', foreign_keys=[user_id])
    team = relationship('User', foreign_keys=[team_id])
    service_cost = relationship('ServiceCost')

    def to_dict(self):
        return {
            'id': self.id,
            'user_email': self.user.email,
            'team_id': self.team_id,
            'service_name': self.service_cost.display_name,
            'units_consumed': self.units_consumed,
            'cost_deducted': self.cost_deducted,
            'timestamp': self.timestamp.isoformat()
        }