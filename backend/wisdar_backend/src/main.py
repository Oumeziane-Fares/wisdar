# backend/wisdar_backend/src/main.py
# ADD THESE LINES AT THE VERY TOP OF THE FILE
from gevent import monkey
monkey.patch_all()
import os
import sys
import logging
import redis
from dotenv import load_dotenv
from datetime import timedelta
from flask_migrate import Migrate 

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
from src.models.service_cost import ServiceCost # Import ServiceCost 
from src.models.agent import Agent
# CORRECTED: Changed import to match the class name 'AIModel'
# [MODIFIED] Import the new Provider models
from src.models.provider import Provider, Service, ProviderService
from src.routes.user import auth_bp, init_oauth
from src.routes.chat import chat_bp
from src.routes.stream import stream_bp 
from src.routes.admin import admin_bp # Import new admin blueprint
from src.celery_app import init_celery
from src.routes.providers import providers_bp
from src.routes.team import team_bp
from src.routes.agents import agents_bp

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
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024
app.config['UPLOAD_FOLDER'] = os.path.join(app.static_folder, 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
# Determine if the app is running in a secure context
is_production = os.getenv("PUBLIC_SERVER_URL", "").startswith("https://")
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-super-secret-jwt-key')
app.config["JWT_TOKEN_LOCATION"] = ["cookies"]
app.config["JWT_COOKIE_SECURE"] = is_production
app.config["JWT_COOKIE_CSRF_PROTECT"] = False
app.config["JWT_COOKIE_SAMESITE"] = "None" if is_production else "Lax"
# --- ADD/UPDATE THESE LINES ---
# Set the short lifetime for access tokens (e.g., 15 minutes)
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(minutes=15)

# Set the long lifetime for refresh tokens (e.g., 30 days)
app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)

# Specify the path for the refresh token cookie
app.config["JWT_REFRESH_COOKIE_PATH"] = "/api/auth/"
# --- END OF NEW LINES ---
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
migrate = Migrate(app, db) # <-- ADD THIS LINE
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
# CORRECTED: Registered your custom stream_bp instead of the raw sse object
app.register_blueprint(stream_bp, url_prefix='/api/stream')
app.register_blueprint(admin_bp, url_prefix='/api/admin') # Register the new admin blueprint
# [NEW] Register the new providers blueprint
app.register_blueprint(providers_bp, url_prefix='/api/providers')
app.register_blueprint(team_bp, url_prefix='/api/team') 
app.register_blueprint(agents_bp, url_prefix='/api')

# ==============================================================================
# 6. SETUP DATABASE AND INITIAL DATA
# ==============================================================================
# [NEW] This new function seeds the providers, services, and their links.
def seed_service_costs():
    """
    Seeds the database with a unified list of costs for all billable services,
    including both internal actions and AI service types.
    """
    # This dictionary now defines every possible charge in the system.
    all_services = {
            # --- Internal Application Actions ---
            'internal.new_conversation': {
                'display_name': 'New Conversation',
                'description': 'Flat cost deducted for starting any new chat.',
                'cost': 5, 'unit': 'per_action'
            },
            'internal.create_team_member': {
                'display_name': 'Create Team Member',
                'cost': 500, 'unit': 'per_action'
            },
            'internal.youtube_transcript': { # NEW
                'display_name': 'YouTube Transcript Fetch',
                'description': 'Cost for fetching the transcript from a single YouTube video.',
                'cost': 50, 'unit': 'per_action'
            },

            # Video Processing Workflow
            'video.upload': {
                'display_name': 'Video Upload',
                'description': 'Cost based on the size of the uploaded video file.',
                'cost': 3, 'unit': 'per_mb'
            },
            'video.conversion': {
                'display_name': 'Video to Audio Conversion',
                'description': 'Cost for extracting audio from a video, based on original video size.',
                'cost': 1, 'unit': 'per_mb'
            },
            
            # Audio & Text Processing
            'ai.transcription': {
                'display_name': 'Audio Transcription',
                'description': 'Cost to transcribe one second of any audio file.',
                'cost': 5, 'unit': 'per_second'
            },
            'ai.tts': { # NEW
                'display_name': 'Text-to-Speech',
                'description': 'Cost to convert text into spoken audio, per character.',
                'cost': 0.1, 'unit': 'per_character'
            },
            'ai.chat.input': {
                'display_name': 'AI Chat (Input)',
                'description': 'Cost for sending text to any chat model.',
                'cost': 1, 'unit': 'per_word'
            },
            'ai.chat.output': {
                'display_name': 'AI Chat (Output)',
                'description': 'Cost for receiving text from any chat model.',
                'cost': 2, 'unit': 'per_word'
            },
            
            # Other AI Services
            'ai.web_search.input': {
                'display_name': 'Web Search (Input)',
                'cost': 10, 'unit': 'per_word'
            },
            'ai.web_search.output': {
                'display_name': 'Web Search (Output)',
                'cost': 25, 'unit': 'per_word'
            },
            'ai.image.output': {
                'display_name': 'Image Generation',
                'cost': 100, 'unit': 'per_image'
            },
            # --- START: ADD THESE NEW LINES ---
            'ai.video.text_to_video.output': {
                'display_name': 'Text-to-Video Generation',
                'description': 'Cost per second of generated video from a text prompt.',
                'cost': 50, 'unit': 'per_second'
            },
            'ai.video.image_to_video.output': {
                'display_name': 'Image-to-Video Generation',
                'description': 'Cost per second of generated video from an image prompt.',
                'cost': 60, 'unit': 'per_second'
            },
            'ai.video.video_to_video.output': {
                'display_name': 'Video-to-Video Generation',
                'description': 'Cost per second of generated video from a source video.',
                'cost': 75, 'unit': 'per_second'
            }
            # --- END: ADD THESE NEW LINES ---
        }

    for key, details in all_services.items():
        if not ServiceCost.query.filter_by(service_key=key).first():
            print(f"Adding service cost for: {key}")
            db.session.add(ServiceCost(
                service_key=key,
                display_name=details['display_name'],
                description=details.get('description', ''),
                cost=details['cost'],
                unit=details['unit']
            ))
            
    db.session.commit()
    print("Unified service cost seeding check complete.")

# At the end of main.py, ensure the correct function is called
with app.app_context():
    seed_service_costs() # Make sure this calls the new function

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
