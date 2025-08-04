# In backend/wisdar_backend/src/utils/audio_utils.py

import os
import uuid
import json
import requests
from flask import current_app
from werkzeug.utils import secure_filename
import librosa
import soundfile as sf
import math
from pydub import AudioSegment

ALLOWED_EXTENSIONS = {
    # Audio
    'wav', 'mp3', 'webm', 'flac', 'ogg', 'aac', 'm4a', 'opus',
    # Video
    'mp4', 'mov', 'avi', 'mkv', 'webm'
}

def allowed_file(filename: str) -> bool:
    """Check if filename has an allowed audio or video extension"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def save_file_locally(file) -> tuple:
    """Save uploaded file with a unique filename"""
    filename = secure_filename(file.filename)
    # --- CHANGE IS HERE ---
    unique_filename = f"{uuid.uuid4()}-{filename}"
    save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
    file.save(save_path)
    # Return both the full path for backend use and the filename for DB storage
    return save_path, unique_filename 

def convert_audio_to_wav(file_path: str, original_filename: str) -> str:
    """Convert audio to 16kHz mono WAV format optimized for ASR"""
    try:
        current_app.logger.info(f"Converting audio: {original_filename}")
        y, sr = librosa.load(file_path, sr=16000, mono=True)
        output_path = os.path.splitext(file_path)[0] + ".wav"
        sf.write(output_path, y, sr)
        
        if file_path != output_path:
            os.remove(file_path)
            
        current_app.logger.info(f"Converted to: {os.path.basename(output_path)}")
        return output_path
    except Exception as e:
        current_app.logger.error(f"Audio conversion failed: {e}", exc_info=True)
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

def start_speechmatics_job(file_path: str) -> str:
    """Start transcription job with Speechmatics API without a webhook."""
    api_key = current_app.config.get('SPEECHMATICS_API_KEY')
    if not api_key:
        current_app.logger.error("SPEECHMATICS_API_KEY not configured")
        raise ValueError("Speechmatics API key is not configured")

    url = "https://asr.api.speechmatics.com/v2/jobs"
    headers = {"Authorization": f"Bearer {api_key}"}

    # The "notification_config" has been removed as we are now polling for the result.
    config = {
        "type": "transcription",
        "transcription_config": {
            "language": "auto",
            "enable_entities": True,
            "diarization": "speaker"
        }
    }

    data = {'config': json.dumps(config)}
    files = {'data_file': open(file_path, 'rb')}
    
    current_app.logger.info(f"Starting Speechmatics job for: {os.path.basename(file_path)}")
    
    try:
        response = requests.post(url, headers=headers, data=data, files=files, timeout=30)
        response.raise_for_status()
        job_id = response.json().get('id')
        current_app.logger.info(f"Started Speechmatics job ID: {job_id}")
        return job_id
    except requests.exceptions.RequestException as e:
        error_details = e.response.json() if e.response else str(e)
        current_app.logger.error(f"Speechmatics API error: {e}\nDetails: {error_details}", exc_info=True)
        raise
    finally:
        files['data_file'].close()


def split_audio_if_large(audio_path: str, max_size_mb: int = 24) -> list:
    """
    Checks if an audio file exceeds a max size. If so, splits it into smaller chunks.

    Args:
        audio_path (str): The full path to the audio file to check.
        max_size_mb (int): The maximum size in megabytes before chunking is triggered.

    Returns:
        list: A list of file paths. If the original file is small enough, it contains
              only the original path. If the file is large, it contains the paths
              to the newly created smaller chunk files.
    """
    file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
    
    # If the file is within the size limit, no chunking is needed.
    if file_size_mb <= max_size_mb:
        return [audio_path]

    current_app.logger.info(f"Audio file is {file_size_mb:.2f}MB, splitting into chunks...")
    
    # Load the audio file using pydub
    audio = AudioSegment.from_file(audio_path)
    
    # Determine the number of chunks needed
    num_chunks = math.ceil(file_size_mb / max_size_mb)
    
    # Calculate the duration of each chunk in milliseconds
    chunk_len_ms = math.ceil(len(audio) / num_chunks)
    
    chunk_paths = []
    temp_dir = os.path.dirname(audio_path)

    for i in range(num_chunks):
        start_ms = i * chunk_len_ms
        end_ms = start_ms + chunk_len_ms
        chunk = audio[start_ms:end_ms]
        
        chunk_filename = f"audio_chunk_{i}_{os.path.basename(audio_path)}"
        chunk_path = os.path.join(temp_dir, chunk_filename)
        
        # Export the chunk as a new WAV file
        chunk.export(chunk_path, format="wav")
        chunk_paths.append(chunk_path)

    # Clean up the original large audio file
    os.remove(audio_path)
    
    return chunk_paths