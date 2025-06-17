# backend/wisdar_backend/src/celery_app.py

from celery import Celery

# 1. Create the Celery instance at the top level.
#    This can be imported by other modules (like tasks.py) without circular dependencies.
celery_app = Celery('wisdar_tasks')

def init_celery(app):
    """
    Configures the Celery instance with the Flask app context.
    This function is called from main.py after the Flask app is created.
    """
    # 2. Configure the celery_app instance using the Flask app config.
    celery_app.conf.update(
        broker_url=app.config['REDIS_URL'],
        result_backend=app.config['REDIS_URL']
    )
    # Update with other relevant app config
    celery_app.conf.update(app.config)

    # 3. Subclass the Task to automatically push an app context.
    #    This means tasks can use `current_app` or `db.session` without
    #    needing to import the `app` object directly in tasks.py.
    class ContextTask(celery_app.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app.Task = ContextTask
    return celery_app
