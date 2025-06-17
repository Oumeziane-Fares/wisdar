# backend/wisdar_backend/src/routes/stream.py

import json
from flask import Blueprint, current_app, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_sse import sse

stream_bp = Blueprint('stream', __name__)

@stream_bp.route('/events')
@jwt_required()
def stream_events():
    """
    Establishes a Server-Sent Events (SSE) connection.
    Automatically uses the authenticated user's channel.
    """
    user_id = get_jwt_identity()
    channel = f"user-{user_id}"
    
    # Log the connection
    current_app.logger.info(f"User {user_id} connected to SSE stream on channel '{channel}'.")
    
    # Set channel in request args (for flask-sse internal use)
    request.args = request.args.copy()
    request.args["channel"] = channel
    
    return sse.stream()

def push_event(user_id, event_type, data):
    """
    Pushes an event to a specific user's SSE channel.
    """
    channel = f"user-{user_id}"
    with current_app.app_context():
        sse.publish(json.dumps(data), type=event_type, channel=channel)