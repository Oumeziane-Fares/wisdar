# backend/wisdar_backend/src/tasks.py

import json
import logging
import time
import requests

# CORRECTED: Removed the stray 'f' character from the line below.
# Celery and Flask imports
from .celery_app import celery_app
from flask import current_app

# --- CORRECTED: Added all necessary model and utility imports ---

from .database import db
from .models.chat import Conversation, Message, Attachment,MessageStatus
from .models.ai_model import AIModel
from .utils.ai_integration import get_ai_response
from .utils.transcription_utils import transcribe_audio_with_whisper,start_speechmatics_job 

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

# ==============================================================================
# NEW: Orchestrator Task for Transcription
# ==============================================================================
@celery_app.task(bind=True, max_retries=3, default_retry_delay=90)
def orchestrate_transcription(self, message_id):
    try:
        message = Message.query.get(message_id)
        if not message or not message.attachment:
            logger.error(f"Task aborted: No message or attachment for ID {message_id}")
            return

        attachment = message.attachment
        audio_file_path = attachment.storage_url
        transcript = None

        # --- STAGE 1: TRY SPEECHMATICS ---
        try:
            logger.info(f"Stage 1: Attempting Speechmatics for message {message_id}")
            job_id = start_speechmatics_job(audio_file_path)
            attachment.speechmatics_job_id = job_id
            db.session.commit()

            api_key = current_app.config.get('SPEECHMATICS_API_KEY')
            if not api_key:
                raise ValueError("Speechmatics API Key not configured")
                
            result_url = f"https://asr.api.speechmatics.com/v2/jobs/{job_id}/transcript?format=txt"
            headers = {"Authorization": f"Bearer {api_key}"}
            
            # Poll for up to 5 minutes
            for _ in range(10): 
                time.sleep(30)
                response = requests.get(result_url, headers=headers)
                if response.status_code == 200 and response.text:
                    transcript = response.text.strip()
                    logger.info(f"Speechmatics success for job {job_id}")
                    break
                elif response.status_code >= 400:
                    logger.error(f"Speechmatics job {job_id} failed with status {response.status_code}: {response.text}")
                    break

            if not transcript:
                 raise ValueError("Speechmatics transcription failed or timed out")

        except Exception as e:
            logger.warning(f"Stage 1 failed: Speechmatics error ({e}). Falling back to Whisper.")

            # --- STAGE 2: FALLBACK TO WHISPER ---
            try:
                logger.info(f"Stage 2: Attempting Whisper for message {message_id}")
                transcript = transcribe_audio_with_whisper(audio_file_path)
            except Exception as whisper_e:
                logger.error(f"FATAL: Both services failed. Whisper error: {whisper_e}")
                message.status = MessageStatus.FAILED
                attachment.transcription = "Transcription failed"
                db.session.commit()

                # 1. Define the correct channel format
                channel = f'user-{user_id}'

                # 2. Define the event name
                event_name = 'task_failed'

                # 3. Construct the data payload for the event
                event_data = {
                    'error': 'Audio Processing Failed',
                    'message': 'We could not transcribe your audio at this time. Please try sending it again.',
                    'message_id': message_id
                }
                
                # 4. Call your existing SSE publishing function with the correct arguments
                _publish_sse_event(
                    channel=channel, 
                    event_data=event_data, 
                    event_name=event_name
                )
                # --- MODIFICATION END ---
                return # End the task

        # --- STAGE 3: SUCCESS & NEXT STEP ---
        if transcript:
            logger.info(f"Transcription successful for message {message_id}. Triggering AI response.")
            message.status = MessageStatus.COMPLETE
            attachment.transcription = transcript
            db.session.commit()

            # Trigger AI response
            generate_text_response.delay(message.conversation_id, "http://127.0.0.1:5000/")

    except Exception as exc:
        logger.error(f"orchestrate_transcription failed: {exc}", exc_info=True)
        raise self.retry(exc=exc)