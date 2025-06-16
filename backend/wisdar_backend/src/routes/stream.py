# backend/wisdar_backend/src/routes/stream.py

from flask import Blueprint, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_sse import sse

stream_bp = Blueprint('stream', __name__)

@stream_bp.route('/events')
@jwt_required()
def stream_events():
    user_id = get_jwt_identity()
    channel = f"user-{user_id}"
    
    current_app.logger.info(f"User {user_id} connected to SSE stream on channel '{channel}'.")
    
    # Send periodic pings to keep connection alive
    sse.add_message_type("ping")
    return sse.stream(channel=channel)