# src/models/service_permission.py

from src.database import db
from sqlalchemy import Table, Column, Integer, ForeignKey

# This is a many-to-many association table.
# It doesn't need its own class because it only contains foreign keys.
user_service_permissions = Table('user_service_permissions', db.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('provider_service_id', Integer, ForeignKey('provider_services.id'), primary_key=True)
)