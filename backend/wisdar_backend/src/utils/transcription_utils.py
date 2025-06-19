import os
import openai
from flask import current_app
import json
import requests
# Import your AIModel to fetch the key from the database
from src.models.ai_model import AIModel

def start_speechmatics_job(file_path: str) -> str:
    """Start transcription job with Speechmatics API without a webhook."""
    # This function now fetches the API key itself for better encapsulation
    api_key = current_app.config.get('SPEECHMATICS_API_KEY')
    if not api_key:
        current_app.logger.error("SPEECHMATICS_API_KEY not configured")
        raise ValueError("Speechmatics API key is not configured")

    url = "https://asr.api.speechmatics.com/v2/jobs"
    headers = {"Authorization": f"Bearer {api_key}"}

    # --- MODIFIED CONFIG ---
    # The "notification_config" has been removed as we are now polling for the result.
    config = {
        "type": "transcription",
        "transcription_config": {
            "language": "auto",
            "enable_entities": True,
            "diarization": "speaker"
        }
    }
    # --- END MODIFICATION ---

    data = {'config': json.dumps(config)}
    files = {'data_file': open(file_path, 'rb')}
    
    current_app.logger.info(
        f"Starting Speechmatics job for: {os.path.basename(file_path)}"
    )
    
    try:
        response = requests.post(
            url, 
            headers=headers, 
            data=data, 
            files=files, 
            timeout=30
        )
        response.raise_for_status()
        
        job_id = response.json().get('id')
        current_app.logger.info(f"Started Speechmatics job ID: {job_id}")
        return job_id
    except requests.exceptions.RequestException as e:
        error_details = e.response.json() if e.response else str(e)
        current_app.logger.error(
            f"Speechmatics API error: {e}\nDetails: {error_details}", 
            exc_info=True
        )
        raise
    finally:
        files['data_file'].close()
def transcribe_audio_with_whisper(file_path: str) -> str:
    """
    Transcribes audio using Whisper, fetching the API key securely
    from the AIModel database table.
    """
    try:
        # Fetch the Whisper model configuration from your database
        # The ID 'whisper-1' should match the 'id' in your ai_models table
        whisper_model = AIModel.query.get('whisper-1')

        if not whisper_model:
            current_app.logger.error("Whisper model with ID 'whisper-1' not found in the database.")
            raise ValueError("Whisper model not configured in the database.")

        # Use your existing secure method to get the decrypted API key
        api_key = whisper_model.get_api_key()
        openai.api_key = api_key
        
        with open(file_path, "rb") as audio_file:
            current_app.logger.info(f"Starting transcription with Whisper for file: {file_path}")
            
            transcript_response = openai.Audio.transcribe(
                model="whisper-1",
                file=audio_file
            )
        
        transcript = transcript_response['text']
        current_app.logger.info(f"Successfully received transcript from Whisper for file: {file_path}")
        return transcript

    except Exception as e:
        current_app.logger.error(f"An error occurred during Whisper transcription: {e}", exc_info=True)
        raise