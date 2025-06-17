# backend/wisdar_backend/src/tasks.py

import json
import logging
import requests

# CORRECTED: Removed the stray 'f' character from the line below.
# Celery and Flask imports
from .celery_app import celery_app
from flask import current_app

# --- CORRECTED: Added all necessary model and utility imports ---
from .database import db
from .models.chat import Conversation, Message, Attachment
from .models.ai_model import AIModel
from .utils.ai_integration import get_ai_response

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _publish_sse_event(channel: str, event_data: dict, event_name: str):
    """
    Helper function to manually format and publish an SSE event to Redis.
    """
    try:
        # The flask-sse library expects the data part of the payload
        # to be a JSON string.
        payload = {
            "data": json.dumps(event_data),
            "type": event_name
        }
        # The final message published to Redis is also a JSON string.
        formatted_event = json.dumps(payload)
        
        # Use the redis client from the Flask app context to publish
        current_app.redis_client.publish(channel, formatted_event)
        
        logger.info(f"Published '{event_name}' event to channel '{channel}'")
    except Exception as e:
        logger.error(f"Failed to publish SSE event: {e}", exc_info=True)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_speechmatics_transcription(self, webhook_payload: dict, request_url_root: str):
    """
    Processes speechmatics webhook, fetches transcript, updates DB,
    and triggers AI response generation and streaming.
    """
    # The `with current_app.app_context()` is no longer needed
    # as the ContextTask in celery_app.py handles this automatically.
    try:
        job_id = webhook_payload.get('job', {}).get('id')
        if not job_id:
            logger.warning("Celery task: Webhook payload missing job ID.")
            return

        api_key = current_app.config.get('SPEECHMATICS_API_KEY')
        headers = {"Authorization": f"Bearer {api_key}"}
        transcript_url = f"https://asr.api.speechmatics.com/v2/jobs/{job_id}/transcript?format=txt"
        
        response = requests.get(transcript_url, headers=headers)
        response.raise_for_status()
        response.encoding = 'utf-8'
        transcription = response.text
        
        attachment = Attachment.query.filter_by(speechmatics_job_id=job_id).first()
        if not attachment:
            logger.warning(f"Celery task: Could not find attachment for job_id: {job_id}")
            return
        
        attachment.transcription = transcription
        user_message = attachment.message
        if user_message:
            user_message.content = transcription
        
        db.session.commit()
        
        conversation = user_message.conversation
        channel = f'user-{conversation.user_id}'

        transcription_complete_event = {
            "type": "transcription_complete", 
            "message_id": user_message.id,
            "content": user_message.content
        }
        _publish_sse_event(channel, transcription_complete_event, 'transcription_complete')
        
        # Trigger the text response generation task
        generate_text_response.delay(conversation.id, request_url_root)

    except Exception as exc:
        logger.error(f"Celery 'process_speechmatics_transcription' failed. Retrying... Error: {exc}", exc_info=True)
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def generate_text_response(self, conversation_id: int, request_url_root: str):
    """
    Generates an AI response for a text-based message and streams it back via SSE.
    """
    # The `with current_app.app_context()` is no longer needed.
    try:
        conversation = Conversation.query.get(conversation_id)
        if not conversation: 
            return

        context_messages = Message.query.filter_by(
            conversation_id=conversation.id
        ).order_by(Message.created_at.asc()).all()
        
        assistant_content_stream = get_ai_response(conversation.ai_model_id, context_messages)
        
        new_ai_message = None
        full_response_text = ""
        channel = f'user-{conversation.user_id}'
        
        for chunk in assistant_content_stream:
            if not chunk: 
                continue

            if new_ai_message is None:
                new_ai_message = Message(
                    conversation_id=conversation.id, 
                    role='assistant', 
                    content=chunk
                )
                db.session.add(new_ai_message)
                db.session.commit()
                
                message_dict = new_ai_message.to_dict(host_url=request_url_root)
                start_event_data = {
                    "type": "stream_start", 
                    "message": message_dict
                }
                _publish_sse_event(channel, start_event_data, 'stream_start')
            else:
                chunk_event_data = {
                    "type": "stream_chunk", 
                    "message_id": new_ai_message.id, 
                    "content": chunk
                }
                _publish_sse_event(channel, chunk_event_data, 'stream_chunk')
            
            full_response_text += chunk
        
        if new_ai_message:
            new_ai_message.content = full_response_text
            db.session.commit()
            end_event_data = {
                "type": "stream_end", 
                "message_id": new_ai_message.id
            }
            _publish_sse_event(channel, end_event_data, 'stream_end')

    except Exception as exc:
        logger.error(f"Celery 'generate_text_response' failed. Retrying... Error: {exc}", exc_info=True)
        raise self.retry(exc=exc)
