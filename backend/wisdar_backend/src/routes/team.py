# src/routes/team.py

from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from functools import wraps

from src.database import db
from sqlalchemy import func
from src.models.user import User
from src.models.provider import ProviderService
from src.models.service_permission import user_service_permissions # Import the association table
# --- NEW: Import itsdangerous for token generation ---
from itsdangerous import URLSafeTimedSerializer
# --- NEW: Import the Celery task we are about to create ---
from ..tasks import send_invitation_email
from src.models.credit_transaction import CreditTransaction
from src.models.provider import ProviderService, Service
from src.models.transaction_log import TransactionLog
from src.models.service_cost import ServiceCost

# --- Placeholder for a future Celery task ---
# from ..tasks import send_invitation_email

team_bp = Blueprint('team', __name__)

# --- NEW: Decorator to protect routes for team admins only ---
def team_admin_required():
    def wrapper(fn):
        @wraps(fn)
        @jwt_required()
        def decorator(*args, **kwargs):
            current_user_id = get_jwt_identity()
            user = User.query.get(current_user_id)
            if user and user.role == 'team_admin':
                return fn(*args, **kwargs)
            else:
                return jsonify(message="Team admin access required."), 403
        return decorator
    return wrapper

# --- Endpoint to list all sub-accounts for the team admin ---
@team_bp.route('/sub_accounts', methods=['GET'])
@team_admin_required()
def get_sub_accounts():
    """
    Returns a list of all sub-accounts managed by the logged-in team admin.
    """
    team_admin_id = get_jwt_identity()
    team_admin = User.query.get(team_admin_id)
    
    # The 'sub_accounts' relationship makes this query simple and efficient
    sub_accounts_list = [user.to_dict() for user in team_admin.sub_accounts]
    
    return jsonify(sub_accounts_list)

# --- Endpoint to create a new sub-account and send an invitation ---
@team_bp.route('/sub_accounts', methods=['POST'])
@team_admin_required()
def create_sub_account():
    """
    Creates a new sub-account in a 'pending' state and triggers an invitation email.
    """
    data = request.get_json()
    team_admin_id = get_jwt_identity()

    email = data.get('email')
    full_name = data.get('full_name')
    credit_limit = data.get('credit_limit') # Can be a number or null
    allowed_service_ids = data.get('allowed_service_ids', []) # List of provider_service IDs

    if not email or not full_name:
        return jsonify({"message": "Email and full name are required."}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "A user with this email already exists."}), 409

    # Create the user but don't set a password yet
    new_sub_account = User(
        full_name=full_name,
        email=email,
        parent_id=team_admin_id,
        credit_limit=credit_limit,
        is_active=False, # User is not active until they set their password
        role='user'
    )

    # Assign permissions
    if allowed_service_ids:
        services = ProviderService.query.filter(ProviderService.id.in_(allowed_service_ids)).all()
        new_sub_account.allowed_services = services

  # The user is created and permissions are assigned as before.
    # The following logic now generates a token and triggers the email task.
    try:
        db.session.add(new_sub_account)
        db.session.commit()

        # --- NEW: Generate a secure, timed invitation token ---
        serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
        token = serializer.dumps(new_sub_account.email, salt='email-invitation-salt')

        # Trigger the Celery task to send the email in the background
        send_invitation_email.delay(new_sub_account.email, token)
        
        current_app.logger.info(f"Sub-account {new_sub_account.email} created. Invitation email task triggered.")
        
        return jsonify(new_sub_account.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating sub-account: {e}", exc_info=True)
        return jsonify({"message": "Failed to create sub-account due to a server error."}), 500

# --- Endpoint to update a sub-account's details and permissions ---
@team_bp.route('/sub_accounts/<int:user_id>', methods=['PUT'])
@team_admin_required()
def update_sub_account(user_id):
    team_admin_id = get_jwt_identity()
    user_to_update = User.query.get_or_404(user_id)

    # Security check: ensure the user being updated belongs to the team admin
    if user_to_update.parent_id != int(team_admin_id):
        return jsonify({"message": "You are not authorized to modify this user."}), 403

    data = request.get_json()
    user_to_update.full_name = data.get('full_name', user_to_update.full_name)
    user_to_update.credit_limit = data.get('credit_limit', user_to_update.credit_limit)
    
    # Update permissions
    allowed_service_ids = data.get('allowed_service_ids')
    if allowed_service_ids is not None: # Check for None to allow sending an empty list
        user_to_update.allowed_services.clear() # Remove old permissions
        services = ProviderService.query.filter(ProviderService.id.in_(allowed_service_ids)).all()
        user_to_update.allowed_services = services

    db.session.commit()

    return jsonify(user_to_update.to_dict())


# --- Endpoint to delete a sub-account ---
@team_bp.route('/sub_accounts/<int:user_id>', methods=['DELETE'])
@team_admin_required()
def delete_sub_account(user_id):
    team_admin_id = get_jwt_identity()
    user_to_delete = User.query.get_or_404(user_id)

    # Security check: ensure the user being deleted belongs to the team admin
    if user_to_delete.parent_id != int(team_admin_id):
        return jsonify({"message": "You are not authorized to delete this user."}), 403

    db.session.delete(user_to_delete)
    db.session.commit()

    return jsonify({"message": "Sub-account deleted successfully."}), 200


@team_bp.route('/report/general', methods=['GET'])
@team_admin_required()
def get_general_report():
    """
    Provides an aggregated summary report for the entire team, using the new TransactionLog table.
    """
    team_admin_id = get_jwt_identity()
    try:
        total_spend = db.session.query(func.sum(TransactionLog.cost_deducted)).filter_by(team_id=team_admin_id).scalar() or 0

        # --- START MODIFICATION: Add User.id to the query ---
        spend_by_user = db.session.query(
            User.id,
            User.email,
            func.sum(TransactionLog.cost_deducted)
        ).join(User, TransactionLog.user_id == User.id).filter(
            TransactionLog.team_id == team_admin_id
        ).group_by(User.id, User.email).all()
        # --- END MODIFICATION ---

        spend_by_service = db.session.query(
            ServiceCost.display_name,
            func.sum(TransactionLog.cost_deducted)
        ).join(ServiceCost, TransactionLog.service_cost_id == ServiceCost.id).filter(
            TransactionLog.team_id == team_admin_id
        ).group_by(ServiceCost.display_name).all()

        report = {
            "total_spend": total_spend,
            # --- START MODIFICATION: Add user_id to the response dictionary ---
            "spend_by_user": [{"user_id": user_id, "email": email, "total": spend} for user_id, email, spend in spend_by_user],
            # --- END MODIFICATION ---
            "spend_by_service": [{"service": name, "total": spend} for name, spend in spend_by_service]
        }
        return jsonify(report)
    except Exception as e:
        current_app.logger.error(f"Error generating general report for team {team_admin_id}: {e}", exc_info=True)
        return jsonify({"message": "Failed to generate report due to a server error."}), 500


@team_bp.route('/report/user/<int:user_id>', methods=['GET'])
@team_admin_required()
def get_user_transaction_report(user_id):
    """
    Provides a detailed, paginated list of all credit transactions for a specific user,
    using the new TransactionLog table and formatting the response for the frontend.
    """
    team_admin_id = get_jwt_identity()
    user = User.query.get_or_404(user_id)
    
    # --- START MODIFICATION: Corrected security check ---
    # A team admin is authorized if they are viewing their own report OR a sub-account's report.
    is_their_own_report = int(user.id) == int(team_admin_id)
    is_their_sub_account = user.parent_id == int(team_admin_id)

    if not (is_their_own_report or is_their_sub_account):
    # --- END MODIFICATION ---
        return jsonify({"message": "You are not authorized to view this user's report."}), 403

    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)

        transactions_query = TransactionLog.query.filter_by(
            user_id=user_id
        ).order_by(
            TransactionLog.timestamp.desc()
        )
        paginated_transactions = transactions_query.paginate(page=page, per_page=per_page, error_out=False)
        
        transactions_list = []
        for t in paginated_transactions.items:
            service_key = t.service_cost.service_key
            model_name = "N/A"
            if service_key.startswith('ai.'):
                model_name = service_key.split('.')[1]
            
            transactions_list.append({
                'id': t.id,
                'user_email': t.user.email,
                'service_name': t.service_cost.display_name,
                'model_name': model_name,
                'cost_deducted': t.cost_deducted,
                'transaction_time': t.timestamp.isoformat()
            })

        response = {
            "transactions": transactions_list,
            "total_pages": paginated_transactions.pages,
            "current_page": paginated_transactions.page,
            "has_next": paginated_transactions.has_next,
            "has_prev": paginated_transactions.has_prev
        }

        return jsonify(response)
    except Exception as e:
        current_app.logger.error(f"Error generating transaction report for user {user_id}: {e}", exc_info=True)
        return jsonify({"message": "Failed to generate transaction report due to a server error."}), 500