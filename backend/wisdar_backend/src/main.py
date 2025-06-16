# backend/wisdar_backend/src/main.py

import os
import sys
import logging
import redis
from dotenv import load_dotenv

# --- Pre-App Setup ---
load_dotenv() 
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# --- Flask App Imports ---
from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_sse import sse  # Import SSE directly

# --- Local Module Imports ---
from src.database import db
from src.models.user import User
from src.models.ai_model import AIModel
from src.routes.user import auth_bp, init_oauth
from src.routes.chat import chat_bp
from src.celery_app import init_celery

# ==============================================================================
# 1. FLASK APPLICATION CREATION
# ==============================================================================
app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), 'static'))

# ==============================================================================
# 2. APP CONFIGURATION
# ==============================================================================
# --- Redis Config ---
app.config["REDIS_URL"] = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# JWT configuration for SSE compatibility
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'your-secret-key')
app.config['JSON_AS_ASCII'] = False
db_uri = (
    f"mysql+pymysql://{os.getenv('DB_USERNAME')}:{os.getenv('DB_PASSWORD')}"
    f"@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
    f"?charset=utf8mb4"
)
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(app.static_folder, 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-super-secret-jwt-key')
app.config["JWT_TOKEN_LOCATION"] = ["cookies"]  # Changed to cookies for SSE compatibility
app.config["JWT_COOKIE_SECURE"] = not app.debug
app.config["JWT_COOKIE_CSRF_PROTECT"] = False  # Disable CSRF for SSE
app.config["JWT_COOKIE_SAMESITE"] = "Lax"
app.config["SPEECHMATICS_API_KEY"] = os.getenv("SPEECHMATICS_API_KEY")
app.config["PUBLIC_SERVER_URL"] = os.getenv("PUBLIC_SERVER_URL", "http://localhost:5000")

# RSA Key Configuration
rsa_key_from_env = os.getenv("RSA_PRIVATE_KEY")
if not rsa_key_from_env:
    raise ValueError("RSA_PRIVATE_KEY is not set in the .env file. Please generate one.")
cleaned_key = rsa_key_from_env.strip().strip('"').strip("'")
formatted_key = cleaned_key.replace('\\n', '\n')
app.config["RSA_PRIVATE_KEY"] = formatted_key

# Create Redis client
app.redis_client = redis.from_url(app.config["REDIS_URL"])

# CORS Configuration
CORS(
    app,
    origins=[r"http://localhost:5173", r"https://.*\.loca\.lt", r"http://192\.168\..*"],
    supports_credentials=True  # Allow credentials for SSE
)

# NGROK Configuration
NGROK_URL = os.getenv('NGROK_URL')
if NGROK_URL:
    app.config['SERVER_NAME'] = NGROK_URL

# Logging Configuration
if not app.debug:
    app.logger.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    app.logger.addHandler(handler)

# ==============================================================================
# 3. INITIALIZE FLASK EXTENSIONS
# ==============================================================================
db.init_app(app)
jwt = JWTManager(app)
init_oauth(app) 
init_celery(app)  # Initialize Celery with app context

# ==============================================================================
# 4. JWT USER LOOKUP
# ==============================================================================
@jwt.user_lookup_loader
def user_lookup_callback(_jwt_header, jwt_data):
    identity = jwt_data["sub"]
    return User.query.filter_by(id=identity).one_or_none()

# ==============================================================================
# 5. REGISTER BLUEPRINTS
# ==============================================================================
app.register_blueprint(auth_bp, url_prefix='/api')
app.register_blueprint(chat_bp, url_prefix='/api')
app.register_blueprint(sse, url_prefix='/api/stream')  # Corrected SSE endpoint

# ==============================================================================
# 6. SETUP DATABASE AND INITIAL DATA
# ==============================================================================
with app.app_context():
    db.create_all()
    if AIModel.query.count() == 0:
        print("Seeding database with initial AI models...")
        # Example seeding - replace with your actual models
        models = [
            {"id": "gemini-1.5-pro", "display_name": "Gemini 1.5 Pro"},
            {"id": "gpt-4-turbo", "display_name": "GPT-4 Turbo"},
            {"id": "claude-3-opus", "display_name": "Claude 3 Opus"}
        ]
        
        for model_data in models:
            if not AIModel.query.get(model_data["id"]):
                model = AIModel(
                    id=model_data["id"],
                    display_name=model_data["display_name"]
                )
                db.session.add(model)
        
        db.session.commit()
        print("AI models seeded successfully.")

# ==============================================================================
# 7. SERVE FRONTEND
# ==============================================================================
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    static_folder_path = app.static_folder
    if static_folder_path is None:
        return "Static folder not configured", 404
        
    full_path = os.path.join(static_folder_path, path)
    
    if path != "" and os.path.exists(full_path) and not os.path.isdir(full_path):
        return send_from_directory(static_folder_path, path)
    else:
        index_path = os.path.join(static_folder_path, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(static_folder_path, 'index.html')
        else:
            return "index.html not found", 404

