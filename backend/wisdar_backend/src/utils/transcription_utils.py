import os
from flask import current_app
import json
import requests
# Import your AIModel to fetch the key from the database
from src.models.provider import Provider
from openai import OpenAI

def start_speechmatics_job(file_path: str, language: str = 'auto') -> str:
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
            "language":language,
            "enable_entities": True
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
        
# --- [MODIFIED] This function now uses the new Provider model ---
def transcribe_audio_with_whisper(file_path: str, language: str = None) -> str:
    """
    Transcribes audio using Whisper, fetching the API key securely
    from the 'openai' Provider record in the database.
    """
    try:
        # [NEW] Fetch the OpenAI provider from your database.
        # The API key for Whisper is the OpenAI API key.
        openai_provider = Provider.query.get('openai')

        if not openai_provider:
            current_app.logger.error("OpenAI provider with ID 'openai' not found in the database.")
            raise ValueError("OpenAI provider not configured in the database.")

        # [NEW] Use the secure method on the Provider object to get the decrypted API key.
        api_key = openai_provider.get_api_key()
        
        if not api_key:
            current_app.logger.error("API key for OpenAI provider is not set.")
            raise ValueError("OpenAI API key is not configured.")

        # The rest of the function remains the same, as it correctly uses the modern OpenAI SDK.
        client = OpenAI(api_key=api_key)
        
        with open(file_path, "rb") as audio_file:
            current_app.logger.info(f"Starting transcription with Whisper for file: {file_path}")
            
            transcript_response = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language=language
            )
        
        transcript = transcript_response.text
        current_app.logger.info(f"Successfully received transcript from Whisper for file: {file_path}")
        return transcript

    except Exception as e:
        current_app.logger.error(f"An error occurred during Whisper transcription: {e}", exc_info=True)
        raise
