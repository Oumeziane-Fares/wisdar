import os
from flask import Blueprint, jsonify, request, redirect, url_for, current_app
from src.models.user import User, db
from flask_jwt_extended import create_access_token
from authlib.integrations.flask_client import OAuth

# This blueprint handles authentication and user management routes.
auth_bp = Blueprint('auth', __name__)
oauth = OAuth()

def init_oauth(app):
    """
    Initializes the OAuth providers with credentials from environment variables.
    This function should be called from your main app factory.
    """
    oauth.init_app(app)
    oauth.register(
        name='google',
        client_id=os.getenv('GOOGLE_CLIENT_ID'),
        client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile'}
    )
    oauth.register(
        name='twitter',
        client_id=os.getenv('TWITTER_CLIENT_ID'),
        client_secret=os.getenv('TWITTER_CLIENT_SECRET'),
        api_base_url='https://api.twitter.com/2/',
        request_token_url=None, # Not used for OAuth 2.0
        access_token_url='https://api.twitter.com/2/oauth2/token',
        authorize_url='https://twitter.com/i/oauth2/authorize',
        userinfo_endpoint='users/me?user.fields=id,name,username', # Twitter OAuth 2 doesn't provide email
        client_kwargs={'scope': 'users.read tweet.read'}
    )


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

    if not full_name or not email or not password:
        return jsonify({"message": "Full name, email, and password are required"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already exists"}), 409

    new_user = User(full_name=full_name, email=email)
    new_user.set_password(password)
    
    db.session.add(new_user)
    db.session.commit()

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

    user = User.query.filter_by(email=email).first()

    if user and user.check_password(password):
        access_token = create_access_token(identity=str(user.id))
        return jsonify(access_token=access_token, user=user.to_dict())
    
    return jsonify({"message": "Invalid credentials"}), 401

# --- NEW OAUTH ROUTES ---

@auth_bp.route('/<provider>/login')
def oauth_login(provider):
    """
    Redirects the user to the OAuth provider's login page.
    This is the first step of the social login flow.
    """
    redirect_uri = url_for('auth.oauth_callback', provider=provider, _external=True)
    return oauth.create_client(provider).authorize_redirect(redirect_uri)

@auth_bp.route('/<provider>/callback')
def oauth_callback(provider):
    """
    Handles the callback from the OAuth provider after the user has authenticated.
    """
    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
    try:
        token = oauth.create_client(provider).authorize_access_token()
        # The way to get user info differs between providers
        if provider == 'google':
            user_info = token.get('userinfo')
        elif provider == 'twitter':
            # Note: Twitter OAuth 2.0 does not reliably provide an email address.
            # This is a known limitation. We'll use the username or ID as a fallback.
            resp = oauth.twitter.get('users/me', token=token)
            resp.raise_for_status()
            user_info = resp.json().get('data', {})
            # Synthesize an email if not present, for compatibility with our User model
            user_info['email'] = f"{user_info.get('username', user_info.get('id'))}@twitter.user.not.real.email"
            user_info['name'] = user_info.get('name', user_info.get('username'))
        else:
            return redirect(f"{frontend_url}/?error=unsupported_provider")

    except Exception as e:
        current_app.logger.error(f"OAuth error with {provider}: {e}")
        return redirect(f"{frontend_url}/?error=oauth_failed")

    email = user_info.get('email')
    full_name = user_info.get('name')

    if not email:
        return redirect(f"{frontend_url}/?error=email_not_provided")

    # Find or create the user
    user = User.query.filter_by(email=email).first()
    if not user:
        user = User(full_name=full_name, email=email)
        # For social logins, we set a secure, unusable password
        random_password = os.urandom(16).hex()
        user.set_password(random_password)
        db.session.add(user)
        db.session.commit()
    
    # Generate JWT for the user
    access_token = create_access_token(identity=str(user.id))
    
    # Redirect to a dedicated frontend route that will store the token
    # This is more secure than putting the token in the URL bar permanently
    return redirect(f"{frontend_url}/auth/callback?token={access_token}")


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