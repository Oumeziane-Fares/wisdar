# backend/wisdar_backend/src/celery_app.py

from celery import Celery

# --- CHANGE: Create a placeholder Celery instance ---
# We no longer import the Flask app here. This breaks the circular import.
celery_app = Celery('wisdar_tasks', include=['src.tasks'])

# --- CHANGE: Create an 'init_celery' function ---
# This function will be called from our main application file
# to configure Celery with the Flask app's settings.
def init_celery(app):
    celery_app.conf.update(
        broker_url=app.config["REDIS_URL"],
        result_backend=app.config["REDIS_URL"]
    )

    class ContextTask(celery_app.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app.Task = ContextTask
    return celery_app
