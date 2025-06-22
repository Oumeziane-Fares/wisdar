import os
from celery import Celery
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get the Redis URL from the environment, with a fallback for safety
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Create the Celery instance and configure it immediately
celery_app = Celery(
    "wisdar_tasks",
    broker=redis_url,
    backend=redis_url,
    include=['src.tasks'] # Tell Celery where to find your task modules
)

# Optional: Update with other configurations
celery_app.conf.update(
    task_track_started=True,
    broker_connection_retry_on_startup=True
)

# This function is now only for compatibility with your main.py, it doesn't configure the broker
def init_celery(app):
    """Links the Flask app context to Celery tasks."""
    celery_app.conf.update(app.config)

    class ContextTask(celery_app.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app.Task = ContextTask
    return celery_app
