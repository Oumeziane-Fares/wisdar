import os
from celery import Celery
from dotenv import load_dotenv

# Load environment variables to get the Redis URL
load_dotenv()

# Get the same Redis URL your Flask app uses
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Create the Celery app instance 
# The first argument is the name of the current module.
# The 'broker' is the connection URL for Redis.
# The 'include' argument is a list of modules to import when the worker starts.
celery_app = Celery(
    'wisdar_tasks',
    broker=redis_url,
    backend=redis_url, # Using Redis as the result backend is common
    include=['src.tasks'] # Point to the tasks file we will create next
)

# Optional Celery configuration 
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)