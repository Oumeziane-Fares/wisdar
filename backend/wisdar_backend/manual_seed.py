# manual_seed.py
# This script will manually trigger the provider seeding function.

from src.main import app, seed_providers_and_services

print("--- Manual Seeding Script Started ---")

# The app.app_context() is necessary to access the database
with app.app_context():
    print("Flask app context created. Calling the seeder function...")
    seed_providers_and_services()

print("--- Manual Seeding Script Finished ---")
