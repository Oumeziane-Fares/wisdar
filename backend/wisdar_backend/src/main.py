import os
import sys
import logging
import redis  # <-- Import redis

# DON'T CHANGE THIS !!!
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv() # Load environment variables FIRST

from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from src.database import db
from src.models.user import User
from src.models.ai_model import AIModel
from src.routes.user import auth_bp, init_oauth
from src.routes.chat import chat_bp
from src.routes.stream import stream_bp
from src.routes.models import models_bp

app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), 'static'))

# --- NEW: Create a single, unified Redis client for the entire app ---
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
app.redis_client = redis.from_url(redis_url)
# --------------------------------------------------------------------

# --- **THE FINAL, ROBUST CORS FIX** ---
# This configuration uses regular expressions to allow requests from
# your local development server AND your tunnel URL, fixing the preflight error.
CORS(
    app,
    origins=[
        r"http://localhost:5173",
        r"https://.*\.loca\.lt",
        r"http://192\.168\..*"  # Allows any IP on the 192.168.x.x network
    ],
    supports_credentials=True
)
# ----------------------------


# --- **CRITICAL NGROK CONFIGURATION** ---
# This allows url_for() to generate the correct external webhook URL.
# Use an environment variable for flexibility.
NGROK_URL = os.getenv('NGROK_URL')
if NGROK_URL:
    app.config['SERVER_NAME'] = NGROK_URL
# ----------------------------------------

# --- App Configuration ---
app.config['SECRET_KEY'] = 'asdf#FGSgvasgf$5$WGT'
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-super-secret-jwt-key')
db_uri = (
    f"mysql+pymysql://{os.getenv('DB_USERNAME')}:{os.getenv('DB_PASSWORD')}"
    f"@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
    f"?charset=utf8mb4"
)
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JSON_AS_ASCII'] = False
app.config["JWT_TOKEN_LOCATION"] = ["headers", "query_string"]
app.config["JWT_QUERY_STRING_NAME"] = "token"
app.config['UPLOAD_FOLDER'] = os.path.join(app.static_folder, 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
app.config["SPEECHMATICS_API_KEY"] = os.getenv("SPEECHMATICS_API_KEY")

rsa_key_from_env = os.getenv("RSA_PRIVATE_KEY")
if not rsa_key_from_env:
    raise ValueError("RSA_PRIVATE_KEY is not set in the .env file. Please generate one.")
cleaned_key = rsa_key_from_env.strip().strip('"').strip("'")
formatted_key = cleaned_key.replace('\\n', '\n')
app.config["RSA_PRIVATE_KEY"] = formatted_key

# --- Configure Logging ---
if not app.debug:
    app.logger.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    app.logger.addHandler(handler)

# --- Initialize Extensions ---
db.init_app(app)
jwt = JWTManager(app)
init_oauth(app) 

# --- User Lookup Loader for JWT ---
@jwt.user_lookup_loader
def user_lookup_callback(_jwt_header, jwt_data):
    identity = jwt_data["sub"]
    return User.query.filter_by(id=identity).one_or_none()

# --- Register Blueprints ---
app.register_blueprint(auth_bp, url_prefix='/api')
app.register_blueprint(chat_bp, url_prefix='/api')
app.register_blueprint(models_bp, url_prefix='/api/models')
app.register_blueprint(stream_bp, url_prefix='/api/stream')

# --- Create Database Tables and Seed Data ---
with app.app_context():
    db.create_all()
    if AIModel.query.count() == 0:
        print("Seeding database with initial AI models...")
        # ... (seeding logic remains the same)
        db.session.commit()
        print("AI models seeded successfully.")
# --- Serve Frontend Route ---
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    static_folder_path = app.static_folder
    if static_folder_path is None:
        return "Static folder not configured", 404
    if path != "" and os.path.exists(os.path.join(static_folder_path, path)):
        return send_from_directory(static_folder_path, path)
    else:
        index_path = os.path.join(static_folder_path, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(static_folder_path, 'index.html')
        else:
            return "index.html not found", 404

# --- NOTE: We will use run.py to start the server ---
