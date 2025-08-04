import os
import uuid
from moviepy.editor import VideoFileClip
from flask import current_app

def get_video_duration(video_path: str) -> float:
    """Returns the duration of a video in seconds."""
    with VideoFileClip(video_path) as video_clip:
        return video_clip.duration

def split_video_into_chunks(video_path: str, chunk_duration_sec: int = 360) -> list:
    """
    Splits a video into chunks of a specified duration.
    Returns a list of paths to the video chunk files.
    """
    chunk_paths = []
    video_filename = os.path.basename(video_path)
    temp_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], f"chunks_{uuid.uuid4()}")
    os.makedirs(temp_dir, exist_ok=True)

    with VideoFileClip(video_path) as video:
        total_duration = video.duration
        for i in range(0, int(total_duration), chunk_duration_sec):
            start_time = i
            end_time = min(i + chunk_duration_sec, total_duration)
            
            chunk_filename = f"chunk_{start_time}-{end_time}_{video_filename}"
            chunk_path = os.path.join(temp_dir, chunk_filename)
            
            # Create subclip
            subclip = video.subclip(start_time, end_time)
            subclip.write_videofile(chunk_path, codec="libx264", audio_codec="aac")
            chunk_paths.append(chunk_path)
    
    return chunk_paths

def extract_audio_from_video(video_path: str) -> str:
    """
    Extracts audio from a video file and saves it as a WAV file.
    Returns the path to the new audio file.
    """
    try:
        audio_path = os.path.splitext(video_path)[0] + ".wav"
        with VideoFileClip(video_path) as video_clip:
            video_clip.audio.write_audiofile(audio_path, codec='pcm_s16le')
        return audio_path
    except Exception as e:
        current_app.logger.error(f"Failed to extract audio from {video_path}: {e}")
        raise

def get_video_duration(video_path: str) -> float:
    """Returns the duration of a video in seconds."""
    with VideoFileClip(video_path) as video_clip:
        return video_clip.duration

def split_video_into_chunks(video_path: str, chunk_duration_sec: int = 360) -> list:
    """
    Splits a video into chunks of a specified duration (default 6 minutes).
    Returns a list of paths to the new video chunk files.
    """
    chunk_paths = []
    # Create a unique temporary directory for this video's chunks
    temp_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], f"chunks_{uuid.uuid4()}")
    os.makedirs(temp_dir, exist_ok=True)

    with VideoFileClip(video_path) as video:
        total_duration = video.duration
        for i in range(0, int(total_duration), chunk_duration_sec):
            start_time = i
            end_time = min(i + chunk_duration_sec, total_duration)
            
            # Use a more robust filename for the chunk
            chunk_filename = f"chunk_{i}.mp4"
            chunk_path = os.path.join(temp_dir, chunk_filename)
            
            # Create and save the subclip
            subclip = video.subclip(start_time, end_time)
            subclip.write_videofile(chunk_path, codec="libx264", audio_codec="aac")
            chunk_paths.append(chunk_path)
    
    return chunk_paths