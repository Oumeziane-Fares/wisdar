# backend/wisdar_backend/src/main.py
# ADD THESE LINES AT THE VERY TOP OF THE FILE
from gevent import monkey
monkey.patch_all()
import os
import sys
import logging
import redis
from dotenv import load_dotenv

# --- Pre-App Setup ---
load_dotenv() 
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# --- Flask App Imports ---
from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_sse import sse

# --- Local Module Imports ---
from src.database import db
from src.models.user import User
# CORRECTED: Changed import to match the class name 'AIModel'
from src.models.ai_model import AIModel
from src.routes.user import auth_bp, init_oauth
from src.routes.chat import chat_bp
from src.routes.models import models_bp
from src.routes.stream import stream_bp 
from src.celery_app import init_celery

# ==============================================================================
# 1. FLASK APPLICATION CREATION
# ==============================================================================
# Correctly pointing to the static folder for the built frontend
app = Flask(__name__, static_folder='static', static_url_path='')

# ==============================================================================
# 2. APP CONFIGURATION
# ==============================================================================
# --- Redis Config ---
app.config["REDIS_URL"] = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# JWT configuration
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'your-default-secret-key')
app.config['JSON_AS_ASCII'] = False
db_uri = (
    f"mysql+pymysql://{os.getenv('DB_USERNAME')}:{os.getenv('DB_PASSWORD')}"
    f"@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
    f"?charset=utf8mb4"
)
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# Add these lines to increase the database connection pool
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    "pool_size": 20,
    "pool_recycle": 280,
    "pool_pre_ping": True
}
app.config['UPLOAD_FOLDER'] = os.path.join(app.static_folder, 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
# Determine if the app is running in a secure context
is_production = os.getenv("PUBLIC_SERVER_URL", "").startswith("https://")
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-super-secret-jwt-key')
app.config["JWT_TOKEN_LOCATION"] = ["cookies"]
app.config["JWT_COOKIE_SECURE"] = is_production
app.config["JWT_COOKIE_CSRF_PROTECT"] = False
app.config["JWT_COOKIE_SAMESITE"] = "None" if is_production else "Lax"
app.config["SPEECHMATICS_API_KEY"] = os.getenv("SPEECHMATICS_API_KEY")
app.config["PUBLIC_SERVER_URL"] = os.getenv("PUBLIC_SERVER_URL", "http://localhost:5000")
app.config["JWT_COOKIE_DOMAIN"] = os.getenv('COOKIE_DOMAIN', None)
app.config["JWT_ACCESS_COOKIE_PATH"] = "/"

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
    resources={r"/api/*": {"origins": "*"}}, # Allowing all origins for now, can be restricted later
    supports_credentials=True
)

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
init_celery(app)

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
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(chat_bp, url_prefix='/api/chat')
app.register_blueprint(models_bp, url_prefix='/api/models')
# CORRECTED: Registered your custom stream_bp instead of the raw sse object
app.register_blueprint(stream_bp, url_prefix='/api/stream')

# ==============================================================================
# 6. SETUP DATABASE AND INITIAL DATA
# ==============================================================================
with app.app_context():
    db.create_all()
    # CORRECTED: Changed to use the correct class name 'AIModel'
    if AIModel.query.count() == 0:
        print("Seeding database with initial AI models...")
        models = [
            {"id": "gemini-1.5-pro", "display_name": "Gemini 1.5 Pro"},
            {"id": "gpt-4-turbo", "display_name": "GPT-4 Turbo"},
            {"id": "claude-3-opus", "display_name": "Claude 3 Opus"}
        ]
        
        for model_data in models:
            # CORRECTED: Changed to use the correct class name 'AIModel'
            if not AIModel.query.get(model_data["id"]):
                # CORRECTED: Changed to use the correct class name 'AIModel'
                model = AIModel(
                    id=model_data["id"],
                    display_name=model_data["display_name"]
                )
                db.session.add(model)
        
        db.session.commit()
        print("AI models seeded successfully.")

# ==============================================================================
# 7. SERVE FRONTEND (SPA Handling)
# ==============================================================================
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_spa(path):
    """
    Serves the static files for the SPA, including the main index.html for
    client-side routing. This route is designed to ignore API calls.
    """
    if path.startswith("api/"):
        return jsonify(error=f"API endpoint not found for path: {path}"), 404
        
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

@app.errorhandler(404)
def resource_not_found(e):
    """
    Catches all 404 errors. This is a safety net.
    """
    if request.path.startswith('/api/'):
        return jsonify(error="The requested API endpoint was not found."), 404
    
    return send_from_directory(app.static_folder, 'index.html')
