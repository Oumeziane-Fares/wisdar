# src/routes/providers.py

from flask import Blueprint, jsonify, current_app
from flask_jwt_extended import jwt_required

# Import the new Provider model
from src.models.provider import Provider

# Create a new Blueprint
providers_bp = Blueprint('providers', __name__)

@providers_bp.route('/', methods=['GET'])
@jwt_required()
def get_all_providers():
    """
    Fetches all active providers and their services from the database
    and returns them in a JSON format suitable for the frontend.
    """
    try:
        # Query all providers. The to_dict() method will handle nesting the services.
        providers = Provider.query.all()
        
        # Convert the list of Provider objects to a list of dictionaries
        providers_data = [provider.to_dict() for provider in providers]
        
        return jsonify(providers_data)
    except Exception as e:
        # Log the error for debugging
        current_app.logger.error(f"Failed to fetch providers: {e}", exc_info=True)
        return jsonify({"message": "Error fetching provider data."}), 500