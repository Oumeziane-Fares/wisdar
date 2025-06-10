# backend/wisdar_backend/run.py
from src.main import app
from waitress import serve
import os


# --- ADD THIS FOR NGROK TESTING ---
# 1. Start ngrok first (e.g., ngrok http 5000)
# 2. Copy the public URL ngrok gives you (e.g., "your-random-string.ngrok.io")
# 3. Paste it here. This tells Flask its public address.
app.config['SERVER_NAME'] = '5753-154-249-221-219.ngrok-free.app'
# ------------------------------------


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    # Use waitress as the production server
    serve(app, host='0.0.0.0', port=port)