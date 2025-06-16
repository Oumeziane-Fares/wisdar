import os
import signal
from gevent import monkey
monkey.patch_all()

from gevent.pywsgi import WSGIServer
from src.main import app

def shutdown_handler(signal, frame):
    print("\nShutting down server...")
    http_server.stop(timeout=10)
    exit(0)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    http_server = WSGIServer(('', port), app)
    
    # Setup graceful shutdown
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)
    
    print(f"Server listening on port {port}...")
    print(f"SSE endpoint: http://localhost:{port}/api/stream/events")
    print("Press Ctrl+C to stop")
    
    try:
        http_server.serve_forever()
    except KeyboardInterrupt:
        shutdown_handler(None, None)