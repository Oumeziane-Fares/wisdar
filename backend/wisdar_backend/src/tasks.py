import json
import requests  # IMPORT ADDED HERE
from .celery_app import celery_app
# DO NOT import app at the top level

# Import from our new, clean utility file
from src.utils.ai_integration import get_ai_response
from src.database import db
from src.models.chat import Message, Attachment

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_speechmatics_transcription(self, webhook_payload: dict, request_url_root: str):
    """
    Processes speechmatics webhook, fetches transcript, updates DB,
    and triggers AI response generation.
    """
    from src.main import app

    with app.app_context():
        try:
            job_id = webhook_payload.get('job', {}).get('id')
            if not job_id:
                app.logger.warning("Celery task: Webhook payload missing job ID.")
                return

            # Fetch transcript from Speechmatics API
            api_key = app.config.get('SPEECHMATICS_API_KEY')
            headers = {"Authorization": f"Bearer {api_key}"}
            transcript_url = f"https://asr.api.speechmatics.com/v2/jobs/{job_id}/transcript?format=txt"
            
            response = requests.get(transcript_url, headers=headers)
            response.raise_for_status()
            response.encoding = 'utf-8'
            transcription = response.text
            
            app.logger.info(f"Fetched transcript for job {job_id}")

            # Find the attachment record
            attachment = Attachment.query.filter_by(speechmatics_job_id=job_id).first()
            if not attachment:
                app.logger.warning(f"Celery task: Could not find attachment for job_id: {job_id}")
                return
            
            # Save transcription to attachment
            attachment.transcription = transcription
            
            # Update associated message
            if attachment.message:
                if attachment.message.content == "Transcription in progress...":
                    attachment.message.content = transcription
                else:
                    attachment.message.content = (
                        f"{attachment.message.content}\n\n"
                        f"--- Audio Transcription ---\n"
                        f"{transcription}"
                    )
            
            db.session.commit()
            app.logger.info(f"Updated message and attachment for job {job_id}")
            
            # Generate AI response
            conversation = attachment.message.conversation
            context_messages = (
                Message.query
                .filter_by(conversation_id=conversation.id)
                .order_by(Message.created_at.asc())
                .all()
            )
            
            assistant_content = get_ai_response(
                conversation.ai_model_id,
                context_messages
            )
            
            # Create new assistant message
            new_ai_message = Message(
                conversation_id=conversation.id,
                role='assistant',
                content=assistant_content
            )
            db.session.add(new_ai_message)
            db.session.commit()
            app.logger.info(f"Created new assistant message with AI response")
            
            # Build and send SSE
            user_id = conversation.user_id
            message_dict = new_ai_message.to_dict(host_url=request_url_root)
            json_payload = json.dumps(message_dict)
            sse_message_string = f"event: new_message\ndata: {json_payload}\n\n"
            
            channel = f'user-{user_id}'
            app.redis_client.publish(channel, sse_message_string)
            app.logger.info(f"Published SSE for user {user_id}")

        except Exception as exc:
            app.logger.error(f"Celery task failed for job {job_id}. Retrying... Error: {exc}")
            raise self.retry(exc=exc)
