import os
import sys
import logging

# DON'T CHANGE THIS !!!
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv() # Load environment variables FIRST

# The pydub configuration is no longer needed.
# We will now use librosa and soundfile, which do not require this setup.

from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from src.database import db
from src.models.user import User
from src.models.ai_model import AIModel
from src.models.chat import Conversation, Message, Attachment
from src.routes.user import auth_bp
from src.routes.chat import chat_bp

app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), 'static'))

# --- CORRECT CORS CONFIGURATION ---
CORS(app, origins=["http://localhost:5173"])

# --- App Configuration ---
app.config['SECRET_KEY'] = 'asdf#FGSgvasgf$5$WGT'
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-super-secret-jwt-key')
app.config['SQLALCHEMY_DATABASE_URI'] = f"mysql+pymysql://{os.getenv('DB_USERNAME')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Define the path for the upload folder
app.config['UPLOAD_FOLDER'] = os.path.join(app.static_folder, 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True) # Ensure the folder exists

# This will now correctly load your Speechmatics key
app.config["SPEECHMATICS_API_KEY"] = os.getenv("SPEECHMATICS_API_KEY")

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

# --- Register Blueprints ---
app.register_blueprint(auth_bp, url_prefix='/api')
app.register_blueprint(chat_bp, url_prefix='/api')

# --- Create Database Tables and Seed Initial Data ---
with app.app_context():
    db.create_all()
    if AIModel.query.count() == 0:
        print("Seeding database with initial AI models...")
        models_to_seed = [
            {'id': 'gemini-2.5-pro', 'display_name': 'Gemini 2.5 Pro', 'api_key': 'key_not_set'},
            {'id': 'claude-3-opus', 'display_name': 'Claude 3 Opus', 'api_key': 'key_not_set'},
            {'id': 'gpt-4-turbo', 'display_name': 'ChatGPT 4 Turbo', 'api_key': 'key_not_set'}
        ]
        for model_data in models_to_seed:
            new_model = AIModel(id=model_data['id'], display_name=model_data['display_name'])
            new_model.set_api_key(model_data['api_key'])
            db.session.add(new_model)
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
