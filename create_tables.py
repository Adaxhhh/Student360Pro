# create_tables.py
import os
from app import app
from models import db

# This check prevents the script from running in a local debug environment
# if you were to accidentally import it.
if __name__ == '__main__':
    with app.app_context():
        print("Attempting to create all database tables...")
        
        # The following line is crucial for Render's PostgreSQL
        # It handles the URL format difference automatically.
        database_url = os.environ.get('DATABASE_URL')
        if database_url and database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
            app.config['SQLALCHEMY_DATABASE_URI'] = database_url

        try:
            db.create_all()
            print("Database tables created successfully (or already exist).")
        except Exception as e:
            print(f"An error occurred during table creation: {e}")
