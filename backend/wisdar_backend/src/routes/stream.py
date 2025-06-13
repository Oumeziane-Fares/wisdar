import logging
import json
import gevent # <-- Import gevent
from flask import Blueprint, Response, current_app
from flask_jwt_extended import jwt_required, get_current_user

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

stream_bp = Blueprint('stream', __name__)

@stream_bp.route('/events')
@jwt_required()
def event_stream():
    try:
        user = get_current_user()
        if not user:
            return Response("Authentication failed", status=401)

        current_app.logger.info(f"User {user.id} connecting to SSE stream.")
        
        redis_client = current_app.redis_client

        def stream_generator():
            log.info(f"Stream generator started for user {user.id}.")
            pubsub = None
            try:
                pubsub = redis_client.pubsub()
                channel_name = f"user-{user.id}"
                pubsub.subscribe(channel_name)
                log.info(f"Successfully subscribed to Redis channel: '{channel_name}'. Now listening...")

                # --- FINAL FIX: Use a non-blocking loop ---
                while True:
                    # Get a message without blocking, with a 1-second timeout
                    message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                    
                    if message and message['type'] == 'message':
                        log.info(f"Received message for user {user.id}, yielding to client.")
                        sse_formatted_data = message['data'].decode('utf-8')
                        yield sse_formatted_data
                    
                    # IMPORTANT: Cooperate with the gevent server by sleeping briefly
                    gevent.sleep(0.1)
                # ----------------------------------------

            except GeneratorExit:
                log.info(f"Client for user {user.id} disconnected.")
            finally:
                if pubsub:
                    log.info(f"Closing Redis pubsub connection for user {user.id}.")
                    pubsub.close()

        response = Response(stream_generator(), mimetype='text/event-stream')
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Cache-Control'] = 'no-cache'
        response.headers['X-Accel-Buffering'] = 'no'
        
        return response

    except Exception as e:
        current_app.logger.error(f"Error in SSE stream setup for user: {e}", exc_info=True)
        return Response(f"Error establishing stream: {e}", status=500, mimetype='text/plain')