import os
import shutil
import uuid
import logging
import json
import librosa
import requests
import time
import base64
from datetime import datetime
import openai
from google.api_core.exceptions import ResourceExhausted
# Celery and Flask imports
from celery import group, chord
from .celery_app import celery_app
from flask import current_app
from celery.exceptions import Ignore

# Database and Models
from .database import db
from .models.chat import Conversation, Message, Attachment, MessageStatus
from .utils.ai_integration import generate_tts_audio
from .models.chat import Attachment
from .models.user import User
from src.models.provider import Provider
# Utilities and Services
from .services.credit_service import deduct_credits
from .utils.ai_integration import get_ai_response, generate_image, _get_youtube_transcript,generate_google_video,extract_tts_parameters, stream_openai_tts_audio ,parse_edit_request, rewrite_scene_prompt,get_gemini_video_understanding_response,summarize_youtube_video
from .utils.transcription_utils import transcribe_audio_with_whisper
from .utils.audio_utils import convert_audio_to_wav, split_audio_if_large
from .utils.video_utils import get_video_duration, split_video_into_chunks, extract_audio_from_video
from moviepy.editor import VideoFileClip, concatenate_videoclips

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ==============================================================================
#  HELPER FUNCTIONS
# ==============================================================================

def _publish_sse_event(channel: str, event_data: dict, event_name: str):
    """Helper function to format and publish an SSE event to Redis."""
    try:
        payload = {"data": json.dumps(event_data), "type": event_name}
        formatted_event = json.dumps(payload)
        current_app.redis_client.publish(channel, formatted_event)
    except Exception as e:
        logger.error(f"Failed to publish SSE event: {e}", exc_info=True)


def fail_task_gracefully(task_instance, conversation_id, message_id, error_message):
    """Updates a message to FAILED and publishes an SSE event."""
    try:
        # Ensure we have a conversation_id to work with
        logger.error(f"fail_task_gracefully called from finalize_long_video_task {error_message}")
        if not conversation_id:
            logger.error(f"fail_task_gracefully called without a conversation_id for message_id {message_id}")
            return
            
        conversation = Conversation.query.get(conversation_id)
        if not conversation: return

        user = conversation.user
        if not user: return

        target_message = Message.query.get(message_id)
        if target_message and target_message.status != MessageStatus.FAILED:
            target_message.status = MessageStatus.FAILED
            target_message.content = error_message
            db.session.commit()
            _publish_sse_event(f"user-{user.id}", {
                'error': 'Processing Error', 'message': error_message, 'message_id': message_id
            }, 'task_failed')
    except Exception as e:
        logger.error(f"Error in fail_task_gracefully: {e}", exc_info=True)


# ==============================================================================
#  TEXT, IMAGE, AND AGENT TASKS
# ==============================================================================

@celery_app.task(bind=True)
def generate_text_response(self, conversation_id: int, request_url_root: str, service_id: str, assistant_message_id: int, transcript: str = None):
    """
    Generates an AI response. Now accepts an optional transcript to use as primary context.
    """
    try:
        conversation = Conversation.query.get(conversation_id)
        if not conversation: return

        user_id = conversation.user_id
        channel = f'user-{user_id}'
        
        # --- THIS IS THE CORRECTED LOGIC ---
        # 1. ALWAYS fetch the database message history first.
        db_messages = Message.query.filter_by(conversation_id=conversation.id).order_by(Message.created_at.asc()).all()

        # 2. Determine the context for the AI based on whether a transcript was provided.
        if transcript:
            # For media uploads, the transcript is the primary context.
            context_messages = [{"role": "user", "content": transcript}]
        else:
            # For regular chat, the message history is the context.
            context_messages = [
                {"role": msg.role, "content": msg.content} 
                for msg in db_messages if msg.id != assistant_message_id and msg.role != 'system' and msg.content
            ]

        # 3. Handle YouTube agent logic, which can now safely use db_messages.
        last_user_message = next((msg for msg in reversed(db_messages) if msg.role == 'user'), None)
        if conversation.agent and "{transcript_text}" in conversation.agent.system_prompt:
             if last_user_message:
                yt_transcript, error = _get_youtube_transcript(last_user_message.content)
                if error:
                    return fail_task_gracefully(self, conversation_id, assistant_message_id, error)
                
                deduct_credits(user_id, 'internal.youtube_transcript')
                
                final_content = conversation.agent.system_prompt.format(user_request=last_user_message.content, transcript_text=yt_transcript)
                # Overwrite the context for the AI with the special YouTube prompt
                context_messages = [{"role": "user", "content": final_content}]
        # --- END OF CORRECTION ---

        # The rest of the function remains the same...
        prompt_text = " ".join([msg['content'] for msg in context_messages if msg['role'] == 'user'])
        prompt_word_count = len(prompt_text.split())
        deduct_credits(user_id, f"ai.{service_id}.input", quantity=prompt_word_count)

        assistant_stream = get_ai_response(
            conversation.provider_id, conversation.ai_model_id, context_messages, service_id
        )
        
        assistant_message = Message.query.get(assistant_message_id)
        if not assistant_message: return

        full_response_text = ""
        is_stream_started = False
        for chunk in assistant_stream:
            if not chunk: continue
            if not is_stream_started:
                assistant_message.status = MessageStatus.STREAMING
                db.session.commit()
                _publish_sse_event(channel, {"type": "stream_start", "message": assistant_message.to_dict(request_url_root)}, 'stream_start')
                is_stream_started = True
            _publish_sse_event(channel, {"type": "stream_chunk", "message_id": assistant_message_id, "content": chunk}, 'stream_chunk')
            full_response_text += chunk

        assistant_message.content = full_response_text
        assistant_message.status = MessageStatus.COMPLETE
        db.session.commit()
        _publish_sse_event(channel, {"type": "stream_end", "message_id": assistant_message_id}, 'stream_end')

        response_word_count = len(full_response_text.split())
        deduct_credits(user_id, f"ai.{service_id}.output", quantity=response_word_count)

    except Exception as exc:
        logger.error(f"Celery 'generate_text_response' failed: {exc}", exc_info=True)
        fail_task_gracefully(self, conversation_id, assistant_message_id, "Error generating response.")


# --- MODIFIED: This task now only starts the process ---
@celery_app.task(bind=True)
def generate_image_task(self, user_message_id: int, assistant_message_id: int, image_context_url: str = None, original_prompt: str = None):
    """
    Step 1 of Image Workflow: Generates a temporary image URL from the AI provider
    and passes it to the processing task.
    """
    user_message = Message.query.get(user_message_id)
    if not user_message: return
    logger.info(f"[CELERY_TASK] Executing generate_image_task.")
    logger.info(f"[CELERY_TASK]   - New Instruction: '{user_message.content}'")
    logger.info(f"[CELERY_TASK]   - Original Prompt: '{original_prompt}'")
    logger.info(f"[CELERY_TASK]   - Context URL: {image_context_url}")
    try:
        conversation = user_message.conversation
        user_id = conversation.user_id

        success, message = deduct_credits(user_id, 'ai.image.output', quantity=1)
        if not success:
            return fail_task_gracefully(self, conversation.id, assistant_message_id, message)

        # This call now includes the image_context_url
        temp_image_url = generate_image(
            provider_id=conversation.provider_id,
            model_id=conversation.ai_model_id,
            prompt=user_message.content,
            image_context_url=image_context_url,
            original_prompt=original_prompt
        )

        # Trigger the next step in the workflow to download and save the image
        process_and_save_image.delay(assistant_message_id, temp_image_url)

    except Exception as exc:
        logger.error(f"Celery 'generate_image_task' failed: {exc}", exc_info=True)
        fail_task_gracefully(self, user_message.conversation.id, assistant_message_id, "Could not generate the image.")


# --- MODIFIED: This task now finalizes the process and notifies the user ---
@celery_app.task(bind=True, max_retries=3, default_retry_delay=120)
def process_and_save_image(self, assistant_message_id: int, temp_url: str):
    """
    Step 2 of Image Workflow: Downloads an image, saves it permanently, updates the
    database, and sends the final SSE notification with a cache-busted URL.
    """
    assistant_message = Message.query.get(assistant_message_id)
    if not assistant_message: return

    try:
        response = requests.get(temp_url, stream=True, timeout=60)
        response.raise_for_status()

        image_filename = f"{uuid.uuid4()}.png"
        save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], image_filename)

        with open(save_path, "wb") as f:
            f.write(response.content)

        server_url = current_app.config.get("PUBLIC_SERVER_URL", "").rstrip('/')
        permanent_url = f"{server_url}/api/chat/uploads/{image_filename}"
        
        # --- NEW CACHE-BUSTING LOGIC ---
        # 1. Create a unique timestamp
        timestamp = int(datetime.utcnow().timestamp())
        # 2. Append it to the URL as a query parameter
        cache_busted_url = f"{permanent_url}?v={timestamp}"
        # --- END OF NEW LOGIC ---

        user_message = Message.query.filter(
            Message.conversation_id == assistant_message.conversation_id,
            Message.role == 'user',
            Message.created_at < assistant_message.created_at
        ).order_by(Message.created_at.desc()).first()

        # Update the message with the cache-busted URL
        assistant_message.image_url = cache_busted_url
        assistant_message.status = MessageStatus.COMPLETE
        
        if user_message:
            assistant_message.content = f"Image generated for: \"{user_message.content[:100]}...\""
            assistant_message.image_prompt = user_message.content # Save the true original prompt
        else:
            assistant_message.content = "Image generated."

        db.session.commit()

        # Send the cache-busted URL to the frontend
        _publish_sse_event(f'user-{assistant_message.conversation.user_id}', {
            'message_id': assistant_message.id,
            'imageUrl': cache_busted_url, # Use the new URL here
            'content': assistant_message.content,
            'conversation_id': assistant_message.conversation.id
        }, 'image_complete')

    except Exception as exc:
        logger.error(f"Celery 'process_and_save_image' failed for message {assistant_message_id}: {exc}", exc_info=True)
        fail_task_gracefully(self, assistant_message.conversation.id, assistant_message_id, "Could not save the generated image.")
        raise self.retry(exc=exc)
# =========== ===================================================================
#  VIDEO & AUDIO PROCESSING WORKFLOW
# ==============================================================================
@celery_app.task(bind=True)
def orchestrate_video_processing(self, message_id: int, language: str = None):
    """
    ROUTER for Video: Extracts audio from the video and hands it off to the
    audio processing workflow. The original video is NOT deleted.
    """
    message = Message.query.get(message_id)
    if not message or not message.attachment: return

    assistant_message = Message.query.filter_by(conversation_id=message.conversation.id, role='assistant').order_by(Message.created_at.desc()).first()
    if not assistant_message: return
    
    channel = f'user-{message.conversation.user_id}'
    video_filename = message.attachment.storage_url # This is just the filename, e.g., '6382b8f8-....mp4'

    # --- THE FIX: Construct the full, absolute path to the file ---
    # Get the path to the uploads folder from the application's configuration
    upload_folder = current_app.config['UPLOAD_FOLDER']
    # Join the folder path and the filename to get the full path
    full_video_path = os.path.join(upload_folder, video_filename)

    try:
        _publish_sse_event(channel, {'message_id': assistant_message.id}, 'audio_extraction_started')
        
        # --- Use the 'full_video_path' from now on ---
        video_size_mb = os.path.getsize(full_video_path) / (1024 * 1024)
        deduct_credits(message.conversation.user_id, 'video.upload', quantity=video_size_mb)
        deduct_credits(message.conversation.user_id, 'video.conversion', quantity=video_size_mb)

        # Extract audio from the full path
        temp_audio_path = extract_audio_from_video(full_video_path)

        # Trigger the audio workflow (this part is unchanged)
        orchestrate_transcription.delay(
            audio_path=temp_audio_path,
            original_user_message_id=message_id,
            language=language
        )

    except Exception as exc:
        logger.error(f"Video orchestration failed: {exc}", exc_info=True)
        fail_task_gracefully(self, message.conversation.id, message.id, "Failed to process video.")


@celery_app.task(bind=True)
def orchestrate_transcription(self, audio_path: str, original_user_message_id: int, language: str = None):
    """
    ROUTER for Audio: Takes a path to an audio file, chunks it if needed,
    and starts the transcription workflow.
    """
    message = Message.query.get(original_user_message_id)
    if not message: return
    
    try:
        # 1. Check size of the audio file and split if necessary
        audio_chunk_paths = split_audio_if_large(audio_path)
        
        # 2. Create a group of tasks to transcribe each chunk
        transcription_tasks = [
            transcribe_audio_chunk_task.s(chunk_path, message.conversation.user_id, language) for chunk_path in audio_chunk_paths
        ]
        
        # 3. Define the callback to run after all chunks are done
        callback = combine_transcripts_and_finalize.s(message_id=original_user_message_id)
        
        # 4. Execute the workflow
        chord(group(transcription_tasks))(callback)

    except Exception as exc:
        logger.error(f"Audio orchestration failed for message {original_user_message_id}: {exc}", exc_info=True)
        fail_task_gracefully(self, message.conversation.id, original_user_message_id, "Failed to prepare audio.")


@celery_app.task(bind=True)
def transcribe_audio_chunk_task(self, audio_chunk_path: str, user_id: int, language: str = None):
    """WORKER: Transcribes a single audio chunk, returns the text, and cleans up the chunk."""
    try:
        duration_sec = librosa.get_duration(path=audio_chunk_path)
        deduct_credits(user_id, 'ai.transcription', quantity=duration_sec)
        transcript = transcribe_audio_with_whisper(audio_chunk_path, language)
        return transcript
    finally:
        # This task now cleans up the temporary audio chunk it was given
        if os.path.exists(audio_chunk_path):
            os.remove(audio_chunk_path)


@celery_app.task(bind=True)
def combine_transcripts_and_finalize(self, transcripts: list, message_id: int):
    """CALLBACK: Combines transcripts and triggers the final AI text response."""
    message = Message.query.get(message_id)
    if not message: return
    
    valid_transcripts = [t for t in transcripts if t is not None]
    full_transcript = " ".join(valid_transcripts).strip()

    if not full_transcript:
        return fail_task_gracefully(self, message.conversation.id, message_id, "Transcription resulted in empty text.")

    # We no longer modify the original user message content
    # The frontend is notified that the background processing is done
    channel = f'user-{message.conversation.user_id}'
    _publish_sse_event(channel, {'message_id': message.id, 'content': full_transcript}, 'transcription_complete')
    
    assistant_message = Message.query.filter_by(conversation_id=message.conversation.id, role='assistant').order_by(Message.created_at.desc()).first()
    if assistant_message:
        generate_text_response.delay(
            conversation_id=message.conversation.id, 
            request_url_root=current_app.config.get("PUBLIC_SERVER_URL"),
            service_id=message.conversation.service_id, 
            assistant_message_id=assistant_message.id,
            transcript=full_transcript # Pass transcript as context
        )
# --- MODIFIED: This task is now fully implemented ---
@celery_app.task(bind=True, max_retries=3, default_retry_delay=300)
def send_invitation_email(self, user_email: str, token: str):
    """
    Sends an account setup/invitation email to a new sub-account user using the SendGrid API.
    """
    # --- Retrieve configuration from environment variables ---
    sendgrid_api_key = os.getenv('SENDGRID_API_KEY')
    from_email = os.getenv('MAIL_FROM_EMAIL')
    from_name = os.getenv('MAIL_FROM_NAME', 'Wisdar')

    if not all([sendgrid_api_key, from_email]):
        logger.error("Email service is not configured. SENDGRID_API_KEY and MAIL_FROM_EMAIL must be set in .env")
        # We don't retry here because it's a configuration issue, not a transient error.
        return

    try:
        # Construct the invitation link for the frontend
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
        invitation_link = f"{frontend_url}/invitation/{token}"

        # --- Professional HTML Email Template ---
        html_content = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invitation to Join Wisdar</title>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f7; }}
                .container {{ max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }}
                .header {{ text-align: center; border-bottom: 1px solid #e9e9eb; padding-bottom: 20px; margin-bottom: 30px; }}
                .header h1 {{ color: #2a2a2e; }}
                .content p {{ color: #555; line-height: 1.6; }}
                .button-container {{ text-align: center; margin-top: 30px; }}
                .button {{ background-color: #6B5CA5; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; }}
                .footer {{ text-align: center; margin-top: 30px; font-size: 12px; color: #999; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>You're Invited to Join Your Team on Wisdar</h1>
                </div>
                <div class="content">
                    <p>Hello,</p>
                    <p>You have been invited to join your team's account on Wisdar. To get started, please set up your account by creating a secure password.</p>
                    <div class="button-container">
                        <a href="{invitation_link}" class="button">Set Your Password</a>
                    </div>
                    <p>This invitation link is valid for the next 72 hours. If you did not expect this invitation, you can safely ignore this email.</p>
                </div>
                <div class="footer">
                    <p>&copy; {datetime.utcnow().year} Wisdar. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """

        # --- Construct the SendGrid API payload ---
        sendgrid_payload = {
            "personalizations": [{"to": [{"email": user_email}]}],
            "from": {"email": from_email, "name": from_name},
            "subject": f"You're invited to join your team on {from_name}",
            "content": [{"type": "text/html", "value": html_content}]
        }

        headers = {
            "Authorization": f"Bearer {sendgrid_api_key}",
            "Content-Type": "application/json"
        }

        # --- Make the API call to SendGrid ---
        response = requests.post("https://api.sendgrid.com/v3/mail/send", json=sendgrid_payload, headers=headers)
        
        # Raise an exception for bad status codes (4xx or 5xx)
        response.raise_for_status()

        logger.info(f"Successfully sent invitation email to {user_email}. Status Code: {response.status_code}")

    except requests.exceptions.RequestException as exc:
        logger.error(f"Failed to send invitation email to {user_email} via SendGrid: {exc}", exc_info=True)
        # Retry the task in case of a network error or temporary SendGrid issue
        raise self.retry(exc=exc)
    except Exception as exc:
        logger.error(f"An unexpected error occurred in send_invitation_email for {user_email}: {exc}", exc_info=True)
        # Retry for other unexpected errors
        raise self.retry(exc=exc)
    
@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def verify_sub_claim_task(self, conversation_id: int, sub_claim: str, assistant_message_id: int):
    """
    A dedicated task to verify a single sub-claim using a simple prompt.
    """
    try:
        conversation = Conversation.query.get(conversation_id)
        if not conversation or not conversation.agent:
            logger.error(f"Task failed: Conversation {conversation_id} not found or is not an agent conversation.")
            return

        # Use the conversation's linked agent and service for the AI call
        agent = conversation.agent
        provider_service = agent.provider_service
        user_id = conversation.user_id

        # This prompt is much simpler, focused on a single task
        verification_system_prompt = (
            "You are a meticulous fact-checker. Verify the following single statement using your web search tool. "
            "Respond ONLY in a Markdown table with 'Conclusion' and 'Evidence' columns. Cite sources with footnotes like [1]."
        )
        
        context_messages = [
            {"role": "system", "content": verification_system_prompt},
            {"role": "user", "content": sub_claim}
        ]
        
        # We can reuse the credit deduction and streaming logic
        # --- THE FIX: Use the central deduct_credits function ---
        prompt_word_count = len(sub_claim.split())
        service_key = f"ai.{provider_service.service_id}.input"
        
        success, message = deduct_credits(user_id, service_key, quantity=prompt_word_count)

        if not success:
            fail_task_gracefully(self, conversation_id, assistant_message_id, message)
            raise Ignore()
        
        assistant_stream = get_ai_response(
            provider_id=provider_service.provider_id,
            model_id=provider_service.model_api_id,
            context_messages=context_messages,
            service_id=provider_service.service_id
        )

        # The rest of the streaming logic can be refactored from generate_text_response
        # For now, let's assume the streaming logic is here...
        # ... (This part is complex, let's simplify for now and just stream the result)
        full_response_text = ""
        for chunk in assistant_stream:
            full_response_text += chunk
            _publish_sse_event(f"user-{user_id}", {"type": "stream_chunk", "message_id": assistant_message_id, "content": chunk}, 'stream_chunk')
        
        assistant_message = Message.query.get(assistant_message_id)
        if assistant_message:
            assistant_message.content = full_response_text
            assistant_message.status = MessageStatus.COMPLETE
            db.session.commit()
            _publish_sse_event(f"user-{user_id}", {"type": "stream_end", "message_id": assistant_message_id}, 'stream_end')


    except Exception as exc:
        logger.error(f"Celery 'verify_sub_claim_task' failed: {exc}", exc_info=True)
        fail_task_gracefully(self, conversation_id, assistant_message_id, "An error occurred during sub-claim verification.")
        raise self.retry(exc=exc)

# =========== ===================================================================
#  TEXT-TO-VOICE SECTION
# ==============================================================================

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def generate_tts_from_message(self, message_id: int):
    """
    Generates TTS audio for a given message, saves it as an attachment,
    and notifies the user via SSE, using the user's preferred voice.
    """
    logger.info(f"[CELERY_TASK] Starting TTS generation for message_id: {message_id}")
    message = Message.query.get(message_id)
    if not message:
        logger.error(f"TTS Task: Message with ID {message_id} not found.")
        return

    conversation = message.conversation
    user_id = conversation.user_id
    channel = f'user-{user_id}'

    try:
        # 1. Deduct credits for the TTS operation.
        character_count = len(message.content)
        deduct_credits(user_id, 'ai.tts', quantity=character_count)

        # 2. Fetch the user to get their saved voice preference.
        user = User.query.get(user_id)
        user_voice = user.tts_voice if user and user.tts_voice else 'alloy'
        
        # 3. Call the OpenAI API via our helper, passing the user's voice.
        audio_data = generate_tts_audio(
            provider_id=conversation.provider_id,
            text_input=message.content,
            voice=user_voice
        )

        # 4. Save the audio data to a unique file.
        audio_filename = f"tts_{uuid.uuid4()}.mp3"
        save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], audio_filename)
        with open(save_path, 'wb') as f:
            f.write(audio_data)

        # 5. Create the attachment record in the database.
        new_attachment = Attachment(
            message_id=message.id,
            file_name=audio_filename,
            file_type='audio/mpeg',
            storage_url=audio_filename 
        )
        db.session.add(new_attachment)
        db.session.commit()
        logger.info(f"TTS audio saved for message {message_id} as attachment {new_attachment.id}")

        # 6. Notify the frontend that the audio is ready.
        server_url = current_app.config.get("PUBLIC_SERVER_URL", "").rstrip('/')
        permanent_url = f"{server_url}/api/chat/uploads/{audio_filename}"
        
        _publish_sse_event(channel, {
            'message_id': message.id,
            'audioUrl': permanent_url,
        }, 'tts_complete')

    except Exception as exc:
        logger.error(f"Celery 'generate_tts_from_message' failed: {exc}", exc_info=True)
        raise self.retry(exc=exc)
    


# =========== ===================================================================
#  Video Generation VEO 3 
# ===============================================================================
@celery_app.task(bind=True, max_retries=3, default_retry_delay=180)
def generate_video_task(self, user_message_id: int, assistant_message_id: int, aspect_ratio: str, context_attachment_id: int = None):
    """
    Placeholder task for generating video. It simulates the workflow:
    deducts credits, waits, and then returns a success event.
    """
    logger.info(f"[CELERY_TASK] Starting Video Generation for message_id: {user_message_id}")
    user_message = Message.query.get(user_message_id)
    if not user_message:
        logger.error(f"Video Task: Message with ID {user_message_id} not found.")
        return

    conversation = user_message.conversation
    user_id = conversation.user_id
    channel = f'user-{user_id}'

    # The assistant message was already created as a placeholder by the route
    assistant_message = Message.query.get(assistant_message_id)

    if not assistant_message:
        logger.error(f"Video Task: Could not find assistant placeholder message for user message {user_message_id}.")
        return

    try:
            # 1. Deduct credits (initial cost)
            deduct_credits(user_id, 'ai.video.text_to_video.output', quantity=5)

            # 2. Get the Google provider and its API key
            google_provider = Provider.query.get('google')
            if not google_provider or not google_provider.get_api_key():
                raise ValueError("Google Provider or its API key is not configured.")
            
            api_key = google_provider.get_api_key()

            # 3. Initiate the video generation job
            client, operation = generate_google_video(
                api_key=api_key,
                model_id='veo-3.0-generate-preview', # e.g., 'veo-3.0-generate-preview'
                prompt=user_message.content,
                aspect_ratio=aspect_ratio
            )

            # 4. Poll for the result
            logger.info(f"Polling for video result. Operation: {operation}")
            while not operation.done:
                time.sleep(20) # Wait 20 seconds between checks as per the example code
                operation = client.operations.get(operation)
                logger.info("...checking video status...")
            
            logger.info("Video generation operation complete.")

            # 5. --- START: NEW DETAILED ERROR CHECKING ---
            # Check if the operation result has a safety block reason
            if hasattr(operation.result, 'prompt_feedback') and operation.result.prompt_feedback.block_reason:
                reason = operation.result.prompt_feedback.block_reason.name
                # Create a user-friendly error message
                error_message = f"Video generation was blocked by the safety filter: {reason}. Please adjust your prompt and try again."
                logger.warning(f"Safety block detected for message {user_message_id}. Reason: {reason}")
                raise ValueError(error_message)

            # Check if video data is missing for other reasons
            if not operation.result or not operation.result.generated_videos:
                raise ValueError("Operation finished, but no video was generated. The prompt may be unsupported.")
            # --- END: NEW DETAILED ERROR CHECKING ---

            generated_video_data = operation.result.generated_videos[0]

            # 6. Save the real video data to a file
            video_filename = f"generated_video_{uuid.uuid4()}.mp4"
            save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], video_filename)
            
            # Use the download method from the example
            downloaded_file = client.files.download(file=generated_video_data.video)
            with open(save_path, "wb") as f:
                f.write(downloaded_file)
            
            # 7. Create the attachment and update the message in the database
            new_attachment = Attachment(
                message_id=assistant_message.id,
                file_name=video_filename,
                file_type='video/mp4',
                storage_url=video_filename
            )
            db.session.add(new_attachment)
            
            assistant_message.status = MessageStatus.COMPLETE
            assistant_message.content = f"Video generated for prompt: \"{user_message.content[:50]}...\""
            db.session.commit()
            
            # 8. Notify the frontend with the URL to the real video
            server_url = current_app.config.get("PUBLIC_SERVER_URL", "").rstrip('/')
            permanent_url = f"{server_url}/api/chat/uploads/{video_filename}"

            _publish_sse_event(channel, {
                'message_id': assistant_message.id,
                'videoUrl': permanent_url,
                'content': assistant_message.content
            }, 'video_complete')

            logger.info(f"Successfully generated and saved real video for message {user_message_id}")

    except Exception as exc:
        logger.error(f"Celery 'generate_video_task' failed: {exc}", exc_info=True)
        fail_task_gracefully(self, conversation.id, assistant_message.id, str(exc))
        raise self.retry(exc=exc)
    

# =========== ===================================================================
#  TTS generation 
# ===============================================================================
# 1. THE MAIN ROUTER TASK
@celery_app.task(bind=True)
def generate_tts_task(self, user_message_id: int, assistant_message_id: int):
    """
    Main TTS router task. It inspects the provider and calls the appropriate sub-task.
    """
    logger.info(f"[CELERY_TASK] Routing TTS request for user_message_id: {user_message_id}")
    user_message = Message.query.get(user_message_id)
    if not user_message: return

    conversation = user_message.conversation
    provider_id = conversation.provider_id

    # Route to the correct sub-task based on the provider
    if provider_id == 'openai':
        _generate_openai_instructed_tts.delay(user_message_id, assistant_message_id)
    elif provider_id == 'google':
        _generate_google_tts.delay(user_message_id, assistant_message_id)
    else:
        fail_task_gracefully(self, conversation.id, assistant_message_id, f"TTS is not supported for provider: {provider_id}")

# 2. Add this new task at the end of the file
@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def _generate_openai_instructed_tts(self, user_message_id: int, assistant_message_id: int):
    """
    Orchestrates the two-step AI process for OpenAI's instructed TTS and streams the audio.
    """
    logger.info(f"[CELERY_SUBTASK] Generating OpenAI Instructed TTS for user_message_id: {user_message_id}")
    user_message = Message.query.get(user_message_id)
    assistant_message = Message.query.get(assistant_message_id)
    if not user_message or not assistant_message:
        logger.error(f"OpenAI TTS Task: User or Assistant message not found for user_message_id {user_message_id}.")
        return

    conversation = user_message.conversation
    user_id = conversation.user_id
    channel = f'user-{user_id}'

    try:
        # Step 1: Interpret the user's prompt to get structured parameters
        tts_params = extract_tts_parameters(user_message.content)
        input_text = tts_params.get("input")
        instructions = tts_params.get("instructions")

        if not input_text:
            raise ValueError("AI could not extract text to speak from the prompt.")

        # Step 2: Get user's preferred voice and the provider API key
        user = User.query.get(user_id)
        user_voice = user.tts_voice if user and user.tts_voice else 'alloy'
        openai_provider = Provider.query.get('openai')
        api_key = openai_provider.get_api_key()
        if not api_key:
            raise ValueError("OpenAI API key is not configured.")

        # Step 3: Notify the frontend that the audio stream is starting
        _publish_sse_event(channel, {'message_id': assistant_message.id}, 'instructed_tts_start')

        # Step 4: Call the AI helper to get the streaming audio response
        audio_stream = stream_openai_tts_audio(
            api_key=api_key,
            model_id=conversation.ai_model_id,
            voice=user_voice,
            input_text=input_text,
            instructions=instructions
        )

        # Step 5: Stream audio chunks to the frontend and collect them
        audio_chunks = []
        for chunk in audio_stream:
            audio_chunks.append(chunk)
            _publish_sse_event(channel, {
                'message_id': assistant_message.id,
                'chunk': base64.b64encode(chunk).decode('utf-8')
            }, 'instructed_tts_chunk')

        _publish_sse_event(channel, {'message_id': assistant_message.id}, 'instructed_tts_end')

        # Step 6: Combine chunks, save the final audio file, and update the database
        full_audio_bytes = b"".join(audio_chunks)
        audio_filename = f"instructed_tts_{uuid.uuid4()}.mp3"
        save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], audio_filename)
        with open(save_path, "wb") as f:
            f.write(full_audio_bytes)

        new_attachment = Attachment(
            message_id=assistant_message.id,
            file_name=audio_filename,
            file_type='audio/mpeg',
            storage_url=audio_filename
        )
        db.session.add(new_attachment)

        assistant_message.status = MessageStatus.COMPLETE
        assistant_message.content = f"Audio generated for: \"{input_text[:100]}...\""
        db.session.commit()

        # Step 7: Deduct credits for the operation
        deduct_credits(user_id, 'ai.tts', quantity=len(input_text))
        
        logger.info(f"Successfully generated and saved instructed TTS for message {user_message_id}")

    except Exception as exc:
        logger.error(f"Celery '_generate_openai_instructed_tts' failed: {exc}", exc_info=True)
        fail_task_gracefully(self, conversation.id, assistant_message.id, str(exc))
# 3. THE GOOGLE WORKER TASK (Placeholder)
@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def _generate_google_tts(self, user_message_id: int, assistant_message_id: int):
    """
    Placeholder task for generating TTS with Google.
    """
    logger.info(f"[CELERY_SUBTASK] Generating Google TTS for user_message_id: {user_message_id}")
    user_message = Message.query.get(user_message_id)
    assistant_message = Message.query.get(assistant_message_id)
    conversation = user_message.conversation
    
    try:
        # Here, you would call the generate_google_tts_audio function and handle its logic
        raise NotImplementedError("Google TTS is not yet implemented with a live API call.")
    except Exception as exc:
        fail_task_gracefully(self, conversation.id, assistant_message.id, str(exc))



# =========== ===================================================================
#  Video Generation VEO 3 
# ===============================================================================
# 1. The Main Orchestrator Task
@celery_app.task(bind=True)
def orchestrate_long_video_generation(self, user_message_id: int, assistant_message_id: int, aspect_ratio: str):
    """
    The main router for the long video generation workflow.
    """
    logger.info(f"[CELERY_ORCHESTRATOR] Starting long video workflow for user message {user_message_id}")
    user_message = Message.query.get(user_message_id)
    assistant_message = Message.query.get(assistant_message_id)
    if not user_message or not assistant_message:
        return

    try:
        # Update the UI immediately to show that planning is in progress
        assistant_message.job_status = "1/4: Analyzing prompt and planning scenes..."
        db.session.commit()
        _publish_sse_event(f'user-{user_message.conversation.user_id}', {
            'message_id': assistant_message.id,
            'job_status': assistant_message.job_status
        }, 'video_progress_update')

        # Create a chain of tasks: first segment the prompt, then generate and stitch the clips
        workflow_chain = (
            segment_prompt_task.s(user_message.content) |
            stitch_video_clips_task.s(user_message_id, assistant_message_id, aspect_ratio)
        )
        workflow_chain.delay()
        
    except Exception as exc:
        logger.error(f"Long video orchestration failed at setup: {exc}", exc_info=True)
        fail_task_gracefully(self, user_message.conversation.id, assistant_message_id, "Failed to start video generation workflow.")


# 2. The Prompt Segmentation Task (with Live AI Call)
@celery_app.task(bind=True)
def segment_prompt_task(self, full_prompt: str) -> list:
    """
    Uses a powerful LLM (GPT-4o) to break a long video prompt into a list of 8-second scene descriptions.
    """
    logger.info(f"[CELERY_TASK] Segmenting prompt: '{full_prompt[:60]}...'")
    
    try:
        # For a critical task like this, we hard-code a powerful model
        provider = Provider.query.get('openai')
        if not provider or not provider.get_api_key():
            raise ValueError("OpenAI provider not configured for prompt segmentation.")
        
        client = openai.OpenAI(api_key=provider.get_api_key())

        system_prompt = (
            "You are a film director's assistant. Your task is to analyze a user's video prompt and break it down into a sequence of distinct scenes. "
            "Each scene should describe about 8 seconds of action. "
            "Maintain narrative and visual continuity between the scenes. "
            "Return your response ONLY as a single, valid JSON array of strings, where each string is a detailed prompt for one scene. "
            "Do not include any other text, markdown, or explanation."
            'Example input: "A knight finds a sword and raises it to the sky." -> '
            'Output: ["A knight in shining armor cautiously walking through a dark, misty forest.", "The knight stops, noticing a faint blue glow from behind a tree.", "A close-up of the knight\'s hand pulling a glowing, ornate sword from the ground.", "The knight raises the glowing sword triumphantly towards the sky, light reflecting off his armor."]'
        )

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.5
        )

        # The response content should be a JSON string like '{"scenes": ["scene 1", "scene 2"]}'
        # We need to parse it to get the list.
        response_data = json.loads(response.choices[0].message.content)
        scenes = response_data.get("scenes") # Assuming the model returns a JSON object with a "scenes" key

        if not isinstance(scenes, list) or not all(isinstance(s, str) for s in scenes):
            raise ValueError("AI did not return a valid list of scene strings.")
            
        logger.info(f"Prompt successfully segmented into {len(scenes)} scenes.")
        return scenes

    except Exception as e:
        logger.error(f"Failed to segment prompt with AI: {e}", exc_info=True)
        # Fallback: if AI fails, split by sentence or comma as a last resort
        scenes = [scene.strip() for scene in full_prompt.split(',') if scene.strip()]
        if not scenes:
            scenes = [full_prompt]
        return scenes


# TASK 1: THE NEW STITCHING ORCHESTRATOR
@celery_app.task(bind=True)
def stitch_video_clips_task(self, scene_prompts: list, user_message_id: int, assistant_message_id: int, aspect_ratio: str):
    """
    Receives scene prompts, creates a group of generation tasks to run in parallel,
    and sets up a final task to stitch the results.
    """
    logger.info(f"[CELERY_CHORD_SETUP] Creating a video generation job for {len(scene_prompts)} scenes.")
    assistant_message = Message.query.get(assistant_message_id)
    if not assistant_message: return

    # Update UI with the plan
    assistant_message.job_status = f"2/4: Generating {len(scene_prompts)} video clips..."
    assistant_message.job_metadata = {'scenes': scene_prompts, 'completed_clips': 0, 'total_clips': len(scene_prompts)}
    db.session.commit()
    _publish_sse_event(f'user-{assistant_message.conversation.user_id}', {
        'message_id': assistant_message.id, 'job_status': assistant_message.job_status, 'job_metadata': assistant_message.job_metadata
    }, 'video_progress_update')

    # Create a group of parallel tasks, one for each scene
    clip_generation_group = group(
        generate_video_clip_task.s(
            scene_prompt=prompt, 
            user_message_id=user_message_id,
            assistant_message_id=assistant_message_id,
            aspect_ratio=aspect_ratio # <-- Pass it to each worker
        ) for prompt in scene_prompts
    )

    # Define the final task that will run after all clips are generated
    stitching_callback = finalize_long_video_task.s(assistant_message_id=assistant_message_id)

    # Execute the chord: run the group in parallel, then run the callback with the results
    chord(clip_generation_group)(stitching_callback)


# TASK 2: THE INDIVIDUAL CLIP GENERATOR
@celery_app.task(bind=True)
def generate_video_clip_task(self, scene_prompt: str, user_message_id: int, assistant_message_id: int, aspect_ratio: str) -> str:
    """
    WORKER: Generates a single 8-second video clip for a given scene prompt.
    Returns the file path of the generated clip.
    """
    logger.info(f"[CELERY_CLIP_WORKER] Generating clip for prompt: '{scene_prompt[:50]}...'")
    user_message = Message.query.get(user_message_id)
    assistant_message = Message.query.get(assistant_message_id)
    if not user_message or not assistant_message: return None
    
    conversation = user_message.conversation
    
    try:
        # Get provider and API key
        google_provider = Provider.query.get('google')
        api_key = google_provider.get_api_key()
        if not api_key: raise ValueError("Google API key not configured.")

        # Call the AI helper to get the video data
        client, operation_name = generate_google_video(
            api_key=api_key, model_id=conversation.ai_model_id,
            prompt=scene_prompt, aspect_ratio=aspect_ratio # Aspect ratio can be passed in later
        )
        
        # Poll for the result
        operation = client.operations.get(operation_name)
        while not operation.done:
            time.sleep(20)
            operation = client.operations.get(operation_name)
        
        if not operation.result or not operation.result.generated_videos:
            raise ValueError("Clip generation finished but no video was returned.")

        # Download and save the clip
        generated_video_data = operation.result.generated_videos[0]
        clip_filename = f"clip_{uuid.uuid4()}.mp4"
        save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], clip_filename)
        
        downloaded_file = client.files.download(file=generated_video_data.video)
        with open(save_path, "wb") as f:
            f.write(downloaded_file)

        # --- START: THIS IS THE FIX ---
        # Re-fetch the message from the database to get the latest state
        # This prevents race conditions from other parallel workers.
        assistant_message = Message.query.get(assistant_message_id)
        if not assistant_message:
            logger.error(f"Assistant message {assistant_message_id} not found before progress update.")
            return save_path # Return path anyway to not break the chain

        # Update and publish progress
        meta = assistant_message.job_metadata or {}
        meta['completed_clips'] = meta.get('completed_clips', 0) + 1
        assistant_message.job_metadata = meta
        
        # Use a nested session to ensure this update is committed immediately
        with db.session.begin_nested():
            db.session.merge(assistant_message)
        db.session.commit()
        
        _publish_sse_event(f'user-{user_message.conversation.user_id}', {
            'message_id': assistant_message.id, 'job_metadata': assistant_message.job_metadata
        }, 'video_progress_update')
        # --- END: THIS IS THE FIX ---

        logger.info(f"[CELERY_CLIP_WORKER] Successfully generated clip: {clip_filename}")
        return save_path # Return the full path to the saved 
    
    # Catch the specific ResourceExhausted error
    except ResourceExhausted as exc:
        logger.warning(f"Quota exceeded for video clip generation. Retrying in {self.default_retry_delay}s...")
        # Tell Celery to retry the task after a delay.
        # The delay will increase automatically on subsequent retries.
        raise self.retry(exc=exc, countdown=self.default_retry_delay)
    # --- END: THIS IS THE FIX ---
    except Exception as e:
        logger.error(f"Failed to generate video clip: {e}", exc_info=True)
        # In case of failure, we return None. The final task will handle it.
        return None


# TASK 3: THE FINAL VIDEO ASSEMBLER
@celery_app.task(bind=True)
def finalize_long_video_task(self, clip_paths: list, assistant_message_id: int):
    """
    CALLBACK: Receives a list of video clip file paths, stitches them together,
    updates the database, and notifies the user.
    """
    logger.info("[CELERY_FINALIZER] All clips generated. Starting final assembly.")
    assistant_message = Message.query.get(assistant_message_id)
    if not assistant_message: return

    # Filter out any failed clips (which will be None) and ensure files exist
    valid_clip_paths = [path for path in clip_paths if path and os.path.exists(path)]
    
    # If no clips were successfully generated, fail the entire job.
    if not valid_clip_paths:
        logger.error("[CELERY_FINALIZER] No valid video clips were generated. Aborting task.")
        
        # --- START: THIS IS THE FIX ---
        # Create a user-friendly error message
        error_msg = "Video generation failed. This could be due to exceeding your API quota or an issue with the prompt. Please check your provider plan and try again."
        
        # Update the message in the database to reflect the failure
        assistant_message.status = MessageStatus.FAILED
        assistant_message.content = error_msg
        assistant_message.job_status = None # Clear the job status
        assistant_message.job_metadata = None # Clear the metadata
        db.session.commit()
        
        # --- THIS IS THE FIX ---
        # Directly publish the 'task_failed' event.
        _publish_sse_event(f'user-{assistant_message.conversation.user_id}', {
            'error': 'Video Generation Error', 
            'message': error_msg, 
            'message_id': assistant_message_id
        }, 'task_failed')
        # --- END OF THE FIX ---
        return

    try:
        # Update UI status to show stitching is in progress
        assistant_message.job_status = "3/4: Assembling the final video..."
        db.session.commit()
        _publish_sse_event(f'user-{assistant_message.conversation.user_id}', {
            'message_id': assistant_message.id, 'job_status': assistant_message.job_status
        }, 'video_progress_update')

        # Use moviepy to load clips and concatenate them
        logger.info(f"Stitching {len(valid_clip_paths)} video clips...")
        video_clips = [VideoFileClip(path) for path in valid_clip_paths]
        final_clip = concatenate_videoclips(video_clips, method="compose")
        
        # Save the final stitched video
        final_video_filename = f"stitched_video_{uuid.uuid4()}.mp4"
        final_save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], final_video_filename)
        final_clip.write_videofile(final_save_path, codec="libx264", audio_codec="aac")

        # Create the final attachment record for the assistant's message
        new_attachment = Attachment(
            message_id=assistant_message.id, 
            file_name=final_video_filename,
            file_type='video/mp4', 
            storage_url=final_video_filename
        )
        db.session.add(new_attachment)
        
        # Update the message to its final state
        assistant_message.status = MessageStatus.COMPLETE
        assistant_message.job_status = "4/4: Complete!"
        # --- START: THIS IS THE FIX ---
        # Clear the metadata so the progress UI disappears
        # --- START: THIS IS THE CRITICAL UPDATE ---
        # Save the list of individual clip filenames for future editing
        meta = assistant_message.job_metadata.copy()
        meta['clip_filenames'] = [os.path.basename(p) for p in valid_clip_paths]
        assistant_message.job_metadata = meta
        # --- END: THIS IS THE CRITICAL UPDATE ---

        db.session.commit()
        # --- END: THIS IS THE FIX ---

        # Notify the frontend with the final video URL
        server_url = current_app.config.get("PUBLIC_SERVER_URL", "").rstrip('/')
        permanent_url = f"{server_url}/api/chat/uploads/{final_video_filename}"
        
        _publish_sse_event(f'user-{assistant_message.conversation.user_id}', {
            'message_id': assistant_message.id, 
            'videoUrl': permanent_url, 
            'content': assistant_message.content,
            # --- START: THIS IS THE FIX ---
            # Also send a final update to clear the job_status and job_metadata from the UI state
            'job_status': None,
            'job_metadata': None
            # --- END: THIS IS THE FIX ---
        }, 'video_complete')

    except Exception as exc:
        logger.error(f"Celery 'finalize_long_video_task' failed: {exc}", exc_info=True)
        fail_task_gracefully(self, assistant_message.conversation.id, assistant_message_id, "An error occurred while assembling the final video.")
    
    finally:
        # Clean up the individual temporary clip files
        for path in valid_clip_paths:
            try:
                os.remove(path)
            except OSError as e:
                logger.error(f"Error removing temporary clip file {path}: {e}")

@celery_app.task(bind=True)
def apply_contextual_edit_task(self, original_assistant_message_id: int, user_edit_message_id: int, aspect_ratio: str):
    """
    Parses an edit request, re-generates a specific clip, and re-assembles the video.
    """
    logger.info(f"[CELERY_EDIT_ENGINE] Starting contextual edit for message {original_assistant_message_id}")
    original_message = Message.query.get(original_assistant_message_id)
    user_edit_message = Message.query.get(user_edit_message_id)
    # --- START: ADD LOGGING HERE ---
    if not original_message:
        logger.warning("[CELERY_EDIT_ENGINE] ABORTING: Original assistant message not found in database.")
        return
        
    if not user_edit_message:
        logger.warning("[CELERY_EDIT_ENGINE] ABORTING: User edit message not found in database.")
        return

    if not original_message.job_metadata:
        logger.warning(f"[CELERY_EDIT_ENGINE] ABORTING: The original message (ID: {original_assistant_message_id}) does not have any 'job_metadata'. It cannot be edited.")
        return
        
    logger.info(f"[CELERY_EDIT_ENGINE] Found job_metadata: {original_message.job_metadata}")
    # --- END: ADD LOGGING HERE ---

    conversation = original_message.conversation
    
    # Create a new assistant message to track the edit job
    assistant_edit_message = Message(
        conversation_id=conversation.id, role='assistant',content="", status=MessageStatus.PROCESSING,
        job_status="1/4: Analyzing edit request...", edited_message_id=original_assistant_message_id,
        version=original_message.version + 1, edit_instructions=user_edit_message.content
    )
    db.session.add(assistant_edit_message)
    db.session.commit()
    _publish_sse_event(f'user-{conversation.user_id}', assistant_edit_message.to_dict(), 'new_message_for_edit')

    try:
        original_scenes = original_message.job_metadata.get('scenes', [])
        original_clip_filenames = original_message.job_metadata.get('clip_filenames', [])

        # Step 1: Use AI to parse the user's request
        parsed_request = parse_edit_request(user_edit_message.content, original_scenes)
        target_index = parsed_request.get('target_scene_index')
        modification = parsed_request.get('modification_instruction')

        if target_index is None or not modification:
            raise ValueError("AI could not determine which scene to edit or what change to make.")

        # Step 2: Use AI to rewrite the specific scene prompt
        original_scene_prompt = original_scenes[target_index]
        modified_prompt = rewrite_scene_prompt(original_scene_prompt, modification)

        # Step 3: Update UI
        assistant_edit_message.job_status = f"2/4: Re-generating Scene {target_index + 1}..."
        assistant_edit_message.job_metadata = {'scenes': original_scenes, 'editing_scene_index': target_index}
        db.session.commit()
        _publish_sse_event(f'user-{conversation.user_id}', assistant_edit_message.to_dict(), 'video_progress_update')

        # Step 4: Re-generate only the single modified clip
        new_clip_path = generate_video_clip_task.delay(
            scene_prompt=modified_prompt,
            user_message_id=user_edit_message.id,
            assistant_message_id=assistant_edit_message.id,
            aspect_ratio=aspect_ratio # This could also be stored/passed
        ).get() # .get() waits for the single task to complete

        if not new_clip_path:
            raise ValueError("Failed to generate the edited video clip.")

        # Step 5: Prepare the final list of clips for re-stitching
        final_clip_paths = []
        upload_folder = current_app.config['UPLOAD_FOLDER']
        for i, original_filename in enumerate(original_clip_filenames):
            if i == target_index:
                final_clip_paths.append(new_clip_path)
            else:
                final_clip_paths.append(os.path.join(upload_folder, original_filename))
        
        # Step 6: Call the final stitching task with the mixed list of old and new clips
        finalize_long_video_task.delay(final_clip_paths, assistant_edit_message.id)

    except Exception as exc:
        logger.error(f"Celery 'apply_contextual_edit_task' failed: {exc}", exc_info=True)
        fail_task_gracefully(self, conversation.id, assistant_edit_message.id, str(exc))


@celery_app.task(bind=True)
def orchestrate_video_understanding(self, full_video_path: str, prompt: str, model_id: str, api_key: str, assistant_message_id: int, conversation_id: int, user_id: int):
    """
    Receives all necessary data directly to avoid database race conditions.
    Takes a video path and prompt, sends them to the Gemini API, and streams the
    text response back with real-time status updates to the UI.
    """
    logger.info(f"[CELERY_TASK] Starting Video Q&A for assistant_message_id: {assistant_message_id}")
    
    # --- 1. Initial Setup ---
    # The task now receives user_id directly, no need to look up the conversation just for this.
    channel = f'user-{user_id}'
    # We only need to get the assistant_message to update its status during the process.
    assistant_message = Message.query.get(assistant_message_id)
    if not assistant_message:
        logger.error(f"Video Q&A Task: Assistant placeholder message {assistant_message_id} not found.")
        return

    try:
        # --- 2. File and API Key Validation ---
        # The task receives the full_video_path, no need to construct it.
        if not os.path.exists(full_video_path):
            raise FileNotFoundError(f"Video file not found at path: {full_video_path}")

        # The api_key is passed in directly.
        if not api_key:
            raise ValueError("Google API key was not provided to the task.")

        # --- 3. Execute and Stream the Response ---
        assistant_stream = get_gemini_video_understanding_response(
            api_key=api_key,
            video_path=full_video_path,
            prompt=prompt,
            model_id=model_id
        )

        full_response_text = ""
        is_stream_started = False
        server_url = current_app.config.get("PUBLIC_SERVER_URL", "").rstrip('/')

        for item in assistant_stream:
            if item["type"] == "status":
                # This is a status update. Send a 'video_progress_update' SSE event.
                assistant_message.job_status = item["data"]
                db.session.commit()
                _publish_sse_event(channel, {
                    'message_id': assistant_message.id,
                    'job_status': assistant_message.job_status
                }, 'video_progress_update')

            elif item["type"] == "chunk":
                # This is a text chunk for the final response.
                if not is_stream_started:
                    assistant_message.status = MessageStatus.STREAMING
                    assistant_message.job_status = None # Clear the status text
                    db.session.commit()
                    _publish_sse_event(channel, {"type": "stream_start", "message": assistant_message.to_dict(server_url)}, 'stream_start')
                    is_stream_started = True
                
                _publish_sse_event(channel, {"type": "stream_chunk", "message_id": assistant_message.id, "content": item["data"]}, 'stream_chunk')
                full_response_text += item["data"]

        # --- 4. Finalize the Message ---
        assistant_message.content = full_response_text
        assistant_message.status = MessageStatus.COMPLETE
        assistant_message.job_status = None # Ensure status is cleared at the end
        db.session.commit()
        _publish_sse_event(channel, {"type": "stream_end", "message_id": assistant_message.id}, 'stream_end')

    except Exception as exc:
        # --- 5. Handle Any Errors ---
        logger.error(f"Celery 'orchestrate_video_understanding' failed: {exc}", exc_info=True)
        fail_task_gracefully(self, conversation_id, assistant_message.id, "Failed to analyze video.")

#*********************************************************
#youtube agent 
#*********************************************************
@celery_app.task(bind=True, max_retries=3, default_retry_delay=120)
def process_youtube_summary_task(self, conversation_id: int, assistant_message_id: int, youtube_settings: dict, prompt: str):
    """
    A Celery background task to handle the streaming summarization of a YouTube video.
    
    1. Calls the Gemini API to get a streaming response.
    2. Sends each text chunk to the client via SSE using the project's helper.
    3. Updates the placeholder message in the database with the final summary.
    """
    # Fetch the placeholder message from the database
    assistant_message = Message.query.get(assistant_message_id)
    if not assistant_message:
        print(f"Task failed: Assistant message with ID {assistant_message_id} not found.")
        return

    user_id = assistant_message.conversation.user_id
    channel = f'user-{user_id}'
    request_url_root = current_app.config.get("PUBLIC_SERVER_URL", "")

    try:
        # Set the message status to STREAMING so the frontend knows to listen
        assistant_message.status = MessageStatus.STREAMING
        db.session.commit()

        # Send the initial 'stream_start' event
        _publish_sse_event(
            channel,
            {'message': assistant_message.to_dict(request_url_root)},
            'stream_start'
        )

        full_response_text = ""
        # Call the streaming generator function
        response_generator = summarize_youtube_video(
            video_url=youtube_settings.get('url'),
            prompt=prompt,
            start_time=youtube_settings.get('startTime'),
            end_time=youtube_settings.get('endTime')
        )

        # Iterate through the streamed chunks from the API
        for chunk in response_generator:
            full_response_text += chunk
            # Send each chunk to the frontend via SSE
            _publish_sse_event(
                channel,
                {'message_id': assistant_message.id, 'content': chunk},
                'stream_chunk'
            )
        
        # Once streaming is complete, update the message in the database
        assistant_message.content = full_response_text
        assistant_message.status = MessageStatus.COMPLETE
        db.session.commit()

    except Exception as e:
        # If any error occurs, update the message to FAILED
        print(f"Error during YouTube summary task: {e}")
        assistant_message.content = "Sorry, I was unable to process the video summary. Please try again."
        assistant_message.status = MessageStatus.FAILED
        db.session.commit()
        
        # Notify the frontend of the failure
        _publish_sse_event(
            channel,
            {
                'message_id': assistant_message.id,
                'error': 'Video Processing Error',
                'message': 'Could not generate a summary for the provided video.'
            },
            'task_failed'
        )
        # Optionally re-raise to trigger Celery's retry mechanism
        self.retry(exc=e)
    finally:
        # Send the final 'stream_end' event to notify the frontend
        _publish_sse_event(
            channel,
            {'message_id': assistant_message.id},
            'stream_end'
        )
