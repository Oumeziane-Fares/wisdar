# IMPORTANT: gevent monkey-patching must be the very first thing to run
from gevent import monkey
monkey.patch_all()

# Now import the rest of the modules
from gevent.pywsgi import WSGIServer
from src.main import app
import os

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))

    # Replace the waitress serve() call with the gevent WSGIServer
    http_server = WSGIServer(('0.0.0.0', port), app)
    
    print(f"--- Gevent WSGI server running on http://0.0.0.0:{port} ---")
    print("--- This server is now fully compatible with the gevent-based Celery worker. ---")
    
    http_server.serve_forever()