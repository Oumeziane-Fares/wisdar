# src/routes/stream.py

import redis
from flask import Blueprint, Response, stream_with_context, session, g, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

# Create a Blueprint for stream routes
stream_bp = Blueprint('stream_bp', __name__)

@stream_bp.route('/events')
@jwt_required()
def stream_events():
    """
    Listens to a Redis Pub/Sub channel and streams events to the client.
    This implementation uses a generator with manual flushing to ensure
    low-latency delivery of events.
    """
    user_id = get_jwt_identity()
    user_channel = f'user-{user_id}'

    # Use the application context to get the Redis URL
    redis_url = current_app.config["REDIS_URL"]
    redis_client = redis.from_url(redis_url)
    pubsub = redis_client.pubsub()
    pubsub.subscribe(user_channel)

    current_app.logger.info(f"User {user_id} connected to SSE stream on channel '{user_channel}'.")

    def generate():
        try:
            for message in pubsub.listen():
                if message['type'] == 'message':
                    event_data = message['data'].decode('utf-8')
                    yield f"data: {event_data}\n\n"
        except GeneratorExit:
            current_app.logger.info(f"Client for user {user_id} disconnected from SSE stream.")
        finally:
            pubsub.close()

    # Create a streaming response, explicitly setting the correct content type
    response = Response(stream_with_context(generate()), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no' # A hint for Nginx
    return response
