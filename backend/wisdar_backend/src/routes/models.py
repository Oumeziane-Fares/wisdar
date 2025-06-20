from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from src.database import db
from src.models.ai_model import AIModel
from src.models.user import User
from functools import wraps
import os
import base64

# Import cryptography libraries
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend

# A simple decorator to protect routes for admin users only
def admin_required():
    def wrapper(fn):
        @wraps(fn)
        @jwt_required()
        def decorator(*args, **kwargs):
            current_user_id = get_jwt_identity()
            user = User.query.get(current_user_id)
            if user and user.role == 'admin':
                return fn(*args, **kwargs)
            else:
                return jsonify(message="Admins only! Access denied."), 403
        return decorator
    return wrapper

models_bp = Blueprint('models', __name__)

@models_bp.route('/security/public-key', methods=['GET'])
@admin_required()
def get_public_key():
    try:
        pem_private_key = current_app.config.get('RSA_PRIVATE_KEY')
        if not pem_private_key:
            return jsonify({"message": "Server encryption is not configured."}), 500

        private_key = serialization.load_pem_private_key(
            pem_private_key.encode(),
            password=None,
            backend=default_backend()
        )
        
        public_key = private_key.public_key()
        
        pem_public_key = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        
        return jsonify({"public_key": pem_public_key.decode('utf-8')})
    except Exception as e:
        current_app.logger.error(f"Error serving public key: {e}")
        return jsonify({"message": "Could not retrieve encryption key."}), 500

@models_bp.route('', methods=['GET'])
@admin_required()
def get_all_models():
    try:
        models = AIModel.query.all()
        models_data = [
            {
                "id": model.id,
                "display_name": model.display_name,
                "is_active": model.is_active,
            }
            for model in models
        ]
        return jsonify(models_data)
    except Exception as e:
        return jsonify({"message": f"Error fetching models: {e}"}), 500

@models_bp.route('/<string:model_id>/api-key', methods=['PUT'])
@admin_required()
def update_model_key(model_id):
    data = request.get_json()
    encrypted_key_b64 = data.get('encrypted_api_key')

    if not encrypted_key_b64:
        return jsonify({"message": "Encrypted API key is required"}), 400

    model = AIModel.query.get(model_id)
    if not model:
        return jsonify({"message": "Model not found"}), 404

    try:
        pem_private_key = current_app.config.get('RSA_PRIVATE_KEY')
        if not pem_private_key:
            return jsonify({"message": "Server decryption key not found."}), 500

        private_key = serialization.load_pem_private_key(
            pem_private_key.encode(),
            password=None,
            backend=default_backend()
        )

        encrypted_key = base64.b64decode(encrypted_key_b64)

        # --- MODIFIED: Use SHA256 for decryption ---
        decrypted_api_key = private_key.decrypt(
            encrypted_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        ).decode('utf-8')
        # -------------------------------------------

        model.set_api_key(decrypted_api_key)
        db.session.commit()
        return jsonify({"message": f"API key for {model.display_name} updated securely."})

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Failed to decrypt or save API key: {e}")
        return jsonify({"message": f"Failed to update API key due to a security or server error."}), 500
