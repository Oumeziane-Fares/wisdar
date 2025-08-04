# src/services/credit_service.py

from flask import current_app
from src.database import db
from src.models.user import User
from src.models.service_cost import ServiceCost
from src.models.transaction_log import TransactionLog

def get_cost_for_service(service_key):
    """Fetches a service cost object from the database."""
    return ServiceCost.query.filter_by(service_key=service_key).first()

def deduct_credits(user_id: int, service_key: str, quantity: float = 1.0):
    """
    The single, unified function for deducting credits and logging the transaction.
    This is team-aware and should be called from all tasks and API routes.
    """
    user = User.query.get(user_id)
    if not user:
        return False, "User not found."

    service = get_cost_for_service(service_key)
    if not service:
        # Fail safely if a service cost hasn't been configured by the admin
        current_app.logger.error(f"FATAL: Service cost for key '{service_key}' is not configured.")
        return False, f"Service '{service_key}' is not a billable action."

    total_cost = service.cost * quantity
    if total_cost <= 0:
        return True, "Action has no cost."

    # Determine which account to charge (the team's parent account or the user's own)
    account_to_charge = user.parent if user.parent_id else user
    
    # Check if the account has enough credits
    if account_to_charge.credits < total_cost:
        return False, "Insufficient credits."

    try:
        # 1. Deduct credits from the account
        account_to_charge.credits -= total_cost
        
        # 2. Create a detailed log of the transaction
        log_entry = TransactionLog(
            user_id=user.id,
            team_id=account_to_charge.id,
            service_cost_id=service.id,
            units_consumed=quantity,
            cost_deducted=total_cost
        )
        db.session.add(log_entry)
        db.session.commit()

        # TODO: Notify frontend of credit change
        # from src.routes.admin import notify_frontend_of_credit_change
        # notify_frontend_of_credit_change(user.id, user.credits)
        # if user.parent_id:
        #     notify_frontend_of_credit_change(account_to_charge.id, account_to_charge.credits)
        
        return True, "Credits deducted successfully."
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error in deduct_credits for service '{service_key}': {e}", exc_info=True)
        return False, "A database error occurred during credit deduction."