import json
from functools import wraps
from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
import base64

# [MODIFIED] Import Provider model and cryptography libraries
from src.database import db
from src.models.user import User
from src.models.service_cost import ServiceCost
from src.models.provider import Provider # <-- NEW
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend
from src.models.provider import ProviderService, Service

from itsdangerous import URLSafeTimedSerializer
from ..tasks import send_invitation_email
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

# Corrected helper function to notify frontend via SSE
def notify_frontend_of_credit_change(user_id, new_credit_balance):
    """
    Publishes a credit update event in a consistent, nested format
    to the user's specific Redis channel.
    """
    try:
        channel = f'user-{user_id}'

        # 1. Create the inner payload that will be stringified.
        #    This is the actual data your frontend needs.
        inner_data = {
            "type": "credits_update",
            "credits": new_credit_balance
        }

        # 2. Create the outer payload which matches the structure of all
        #    other SSE events. The 'data' key holds the stringified JSON.
        outer_payload = {
            "type": "credits_update",
            "data": json.dumps(inner_data)
        }

        # 3. Publish the final, correctly formatted event data.
        #    This payload will now be a JSON string of the 'outer_payload'.
        event_data = json.dumps(outer_payload)
        current_app.redis_client.publish(channel, event_data)

    except Exception as e:
        current_app.logger.error(f"Failed to publish credit update for user {user_id}: {e}")


admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')

@admin_bp.route('/service-costs', methods=['GET'])
@admin_required()
def get_service_costs():
    """Returns a list of all configurable service costs."""
    try:
        costs = ServiceCost.query.order_by(ServiceCost.id).all()
        return jsonify([cost.to_dict() for cost in costs])
    except Exception as e:
        current_app.logger.error(f"Error fetching service costs: {e}")
        return jsonify({"message": "Failed to fetch service costs."}), 500


@admin_bp.route('/service-costs/<int:cost_id>', methods=['PUT'])
@admin_required()
def update_service_cost(cost_id):
    """Updates the cost value for a specific service."""
    data = request.get_json()
    new_cost = data.get('cost')

    if new_cost is None or not isinstance(new_cost, (int, float)) or new_cost < 0:
        return jsonify({"message": "A valid, non-negative cost is required."}), 400

    service_cost = ServiceCost.query.get(cost_id)
    if not service_cost:
        return jsonify({"message": "Service cost configuration not found."}), 404

    try:
        service_cost.cost = new_cost
        db.session.commit()
        return jsonify(service_cost.to_dict())
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating service cost {cost_id}: {e}")
        return jsonify({"message": "Failed to update service cost due to a server error."}), 500
@admin_bp.route('/security/public-key', methods=['GET'])
@admin_required()
def get_public_key():
    """
    Serves the server's public RSA key. The frontend can use this to
    encrypt sensitive data (like API keys) before sending it.
    """
    try:
        # This logic is moved directly from your old models.py route file
        pem_private_key = current_app.config.get('RSA_PRIVATE_KEY')
        if not pem_private_key:
            return jsonify({"message": "Server encryption is not configured."}), 500

        private_key = serialization.load_pem_private_key(pem_private_key.encode(), password=None)
        public_key = private_key.public_key()
        
        pem_public_key = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        
        return jsonify({"public_key": pem_public_key.decode('utf-8')})
    except Exception as e:
        current_app.logger.error(f"Error serving public key: {e}")
        return jsonify({"message": "Could not retrieve encryption key."}), 500


@admin_bp.route('/providers/<string:provider_id>/api-key', methods=['PUT'])
@admin_required()
def update_provider_api_key(provider_id):
    """
    Receives an RSA-encrypted API key, decrypts it with the server's private key,
    and saves it securely to the specified provider.
    """
    data = request.get_json()
    encrypted_key_b64 = data.get('encrypted_api_key')

    if not encrypted_key_b64:
        return jsonify({"message": "Encrypted API key is required"}), 400

    # [MODIFIED] We now query the Provider model
    provider = Provider.query.get(provider_id)
    if not provider:
        return jsonify({"message": "Provider not found"}), 404

    try:
        # Decryption logic is the same as your old file, which is excellent.
        pem_private_key = current_app.config.get('RSA_PRIVATE_KEY')
        private_key = serialization.load_pem_private_key(pem_private_key.encode(), password=None)
        encrypted_key = base64.b64decode(encrypted_key_b64)

        decrypted_api_key = private_key.decrypt(
            encrypted_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        ).decode('utf-8')

        # [MODIFIED] We call set_api_key on the provider object now.
        provider.set_api_key(decrypted_api_key)
        db.session.commit()
        return jsonify({"message": f"API key for {provider.name} updated securely."})

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Failed to decrypt or save API key for provider {provider_id}: {e}")
        return jsonify({"message": f"Failed to update API key due to a security or server error."}), 500
    



@admin_bp.route('/provider-services', methods=['GET'])
@admin_required()
def get_all_provider_services():
    """
    Gets a detailed list of all provider services, including inactive ones,
    for the admin management panel.
    """
    try:
        services = ProviderService.query.join(Provider).join(Service).options(
            db.joinedload(ProviderService.provider),
            db.joinedload(ProviderService.service)
        ).all()
        
        # Create a detailed dictionary for the admin UI
        data = [{
            "id": ps.id,
            "provider_name": ps.provider.name,
            "service_name": ps.service.name,
            "model_api_id": ps.model_api_id,
            "display_name": ps.display_name or ps.model_api_id,
            "is_active": ps.is_active,
        } for ps in services]
        
        return jsonify(data)
    except Exception as e:
        current_app.logger.error(f"Error fetching provider services for admin: {e}", exc_info=True)
        return jsonify({"message": "Failed to fetch provider services."}), 500


@admin_bp.route('/provider-services', methods=['POST'])
@admin_required()
def create_provider_service():
    """
    Creates a new AI model/service entry.
    """
    data = request.get_json()
    # Basic validation
    required_fields = ['provider_id', 'service_id', 'model_api_id', 'display_name']
    if not all(field in data for field in required_fields):
        return jsonify({"message": "Missing required fields."}), 400

    try:
        new_service = ProviderService(
            provider_id=data['provider_id'],
            service_id=data['service_id'],
            model_api_id=data['model_api_id'],
            display_name=data['display_name'],
            is_active=data.get('is_active', True),
        )
        db.session.add(new_service)
        db.session.commit()
        return jsonify({"message": "Service created successfully.", "id": new_service.id}), 201
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating provider service: {e}", exc_info=True)
        return jsonify({"message": "Failed to create service due to a server error."}), 500


@admin_bp.route('/provider-services/<int:service_id>', methods=['PUT'])
@admin_required()
def update_provider_service(service_id):
    """
    Updates an existing AI model/service entry, including its active status.
    """
    service = ProviderService.query.get_or_404(service_id)
    data = request.get_json()

    try:
        # Update any fields that are provided in the request
        for key, value in data.items():
            if hasattr(service, key):
                setattr(service, key, value)
        
        db.session.commit()
        return jsonify({"message": "Service updated successfully."})
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating provider service {service_id}: {e}", exc_info=True)
        return jsonify({"message": "Failed to update service due to a server error."}), 500


@admin_bp.route('/provider-services/<int:service_id>', methods=['DELETE'])
@admin_required()
def delete_provider_service(service_id):
    """
    Deletes an AI model/service entry.
    """
    service = ProviderService.query.get_or_404(service_id)
    try:
        db.session.delete(service)
        db.session.commit()
        return jsonify({"message": "Service deleted successfully."})
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting provider service {service_id}: {e}", exc_info=True)
        return jsonify({"message": "Failed to delete service due to a server error."}), 500


@admin_bp.route('/team/<int:team_admin_id>/sub_accounts', methods=['GET'])
@admin_required()
def get_team_sub_accounts(team_admin_id):
    """
    Fetches all sub-accounts for a specific team admin.
    """
    team_admin = User.query.get_or_404(team_admin_id)

    if team_admin.role != 'team_admin':
        return jsonify({"message": "This user is not a team admin."}), 400

    # The 'sub_accounts' relationship makes this query simple and efficient
    sub_accounts_list = [user.to_dict() for user in team_admin.sub_accounts]
    
    return jsonify(sub_accounts_list)



# Add this new endpoint at the end of the file
@admin_bp.route('/users', methods=['POST'])
@admin_required()
def create_top_level_user():
    """
    Creates a new top-level user (user or team_admin) and sends an invitation email.
    """
    data = request.get_json()
    email = data.get('email')
    full_name = data.get('full_name')
    role = data.get('role')

    if not all([email, full_name, role]):
        return jsonify({"message": "Email, full name, and role are required."}), 400

    if role not in ['user', 'team_admin']:
        return jsonify({"message": "Role must be either 'user' or 'team_admin'."}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "A user with this email already exists."}), 409

    try:
        # Create the user with no parent_id
        new_user = User(
            full_name=full_name,
            email=email,
            role=role,
            is_active=False # User is not active until they accept the invitation
        )
        db.session.add(new_user)
        db.session.commit()

        # Generate a secure, timed invitation token (reusing the same logic)
        serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
        token = serializer.dumps(new_user.email, salt='email-invitation-salt')

        # Trigger the Celery task to send the email
        send_invitation_email.delay(new_user.email, token)
        
        current_app.logger.info(f"Admin created new user {new_user.email}. Invitation email task triggered.")
        
        return jsonify(new_user.to_dict()), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Admin error creating user: {e}", exc_info=True)
        return jsonify({"message": "Failed to create user due to a server error."}), 500
    



# Add this new endpoint at the end of the file
@admin_bp.route('/users/<int:user_id>/role', methods=['PUT'])
@admin_required()
def update_user_role(user_id):
    """
    Updates the role for a specific user.
    """
    data = request.get_json()
    new_role = data.get('role')
    admin_id = get_jwt_identity()

    if not new_role or new_role not in ['user', 'team_admin', 'admin']:
        return jsonify({"message": "A valid role is required."}), 400

    # Security check: Prevent an admin from changing their own role
    if int(admin_id) == user_id:
        return jsonify({"message": "Administrators cannot change their own role."}), 403

    target_user = User.query.get_or_404(user_id)

    # Security check: Prevent demoting the last admin in the system
    if target_user.role == 'admin' and new_role != 'admin':
        admin_count = User.query.filter_by(role='admin').count()
        if admin_count <= 1:
            return jsonify({"message": "Cannot remove the last administrator."}), 403

    try:
        target_user.role = new_role
        db.session.commit()
        return jsonify(target_user.to_dict())
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating role for user {user_id}: {e}", exc_info=True)
        return jsonify({"message": "Failed to update role due to a server error."}), 500
    

# Add this new endpoint at the end of the file
@admin_bp.route('/users/<int:user_id>/resend-invitation', methods=['POST'])
@admin_required()
def resend_invitation(user_id):
    """
    Resends an invitation email to a user who is still in a pending state.
    """
    user = User.query.get_or_404(user_id)

    # Security check: Only send to inactive (pending) users
    if user.is_active:
        return jsonify({"message": "This user's account is already active."}), 400

    try:
        # Reuse the exact same token generation and email sending logic
        serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
        token = serializer.dumps(user.email, salt='email-invitation-salt')
        send_invitation_email.delay(user.email, token)
        
        return jsonify({"message": f"Invitation resent successfully to {user.email}."})

    except Exception as e:
        current_app.logger.error(f"Failed to resend invitation for user {user.id}: {e}", exc_info=True)
        return jsonify({"message": "Failed to resend invitation due to a server error."}), 500