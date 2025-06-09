from flask import Blueprint, jsonify, request
from src.models.user import User, db
from flask_jwt_extended import create_access_token

# This blueprint handles authentication and user management routes.
auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register_user():
    """
    Handles new user registration.
    Expects 'full_name', 'email', and 'password' in the request JSON.
    """
    data = request.json
    full_name = data.get('full_name')
    email = data.get('email')
    password = data.get('password')

    # Validate that all required fields are present
    if not full_name or not email or not password:
        return jsonify({"message": "Full name, email, and password are required"}), 400

    # Check if the email already exists in the database
    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already exists"}), 409 # 409 Conflict

    # Create a new user instance and set the hashed password
    new_user = User(full_name=full_name, email=email)
    new_user.set_password(password)  # This uses the method from your User model to hash the password
    
    db.session.add(new_user)
    db.session.commit()

    # Return the newly created user's data (without the password hash)
    return jsonify(new_user.to_dict()), 201


@auth_bp.route('/login', methods=['POST'])
def login_user():
    """
    Handles user login.
    Expects 'email' and 'password'.
    """
    data = request.json
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"message": "Email and password are required"}), 400

    # Find the user by email
    user = User.query.filter_by(email=email).first()

    # Check if the user exists and if the password is correct
    if user and user.check_password(password):
        # If credentials are valid, create a JWT access token
        access_token = create_access_token(identity=str(user.id))
        # Return the token and user info to the frontend
        return jsonify(access_token=access_token, user=user.to_dict())
    
    # If credentials are not valid, return an error
    return jsonify({"message": "Invalid credentials"}), 401


# --- The following routes are for general user management ---
# In a production app, these should be protected so only admins can use them.

@auth_bp.route('/users', methods=['GET'])
def get_users():
    """Returns a list of all users."""
    users = User.query.all()
    return jsonify([user.to_dict() for user in users])

@auth_bp.route('/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    """Returns a single user by their ID."""
    user = User.query.get_or_404(user_id)
    return jsonify(user.to_dict())

@auth_bp.route('/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    """Updates a user's details (full_name, email)."""
    user = User.query.get_or_404(user_id)
    data = request.json
    # Note: This doesn't handle password updates. That would require a separate, more secure process.
    user.full_name = data.get('full_name', user.full_name)
    user.email = data.get('email', user.email)
    db.session.commit()
    return jsonify(user.to_dict())

@auth_bp.route('/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    """Deletes a user."""
    user = User.query.get_or_404(user_id)
    db.session.delete(user)
    db.session.commit()
    return '', 204