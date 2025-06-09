from src.main import app  # Import the 'app' instance from your main.py
from waitress import serve

if __name__ == '__main__':
    print("Starting server with Waitress on http://127.0.0.1:5000")
    serve(app, host='0.0.0.0', port=5000)