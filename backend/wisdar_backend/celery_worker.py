# celery_worker.py
# At the top of celery_worker.py
from gevent import monkey
monkey.patch_all()

import grpc.experimental.gevent as grpc_gevent
grpc_gevent.init_gevent()
# Import the main Flask app instance from where it's created
from src.main import app 

# Import the celery initializer
from src.celery_app import init_celery

# Initialize Celery with the Flask app context
# This creates the 'celery' variable that the CLI will look for.
celery = init_celery(app)