from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import os
from app import models  # Ensure models are imported here

app = Flask(__name__)
CORS(app)

# Configure SQLAlchemy to use a proper SQLite URI with an absolute path
base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
db_path = os.path.join(base_dir, "tasks.db").replace("\\", "/")
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize SQLAlchemy
db = SQLAlchemy(app)

# Import models to register with SQLAlchemy (already done above)
with app.app_context():
    try:
        print(f"Attempting to create tables in {db_path}...")
        db.create_all()
        print(f"Tables created successfully in {db_path}.")
    except Exception as e:
        print(f"Error creating tables in {db_path}: {e}")
        raise

# Import and register routes after app initialization
from app.main import read_root, create_task, read_tasks, read_task, update_task, delete_task, get_pending_reminders, get_task_statistics

# Register routes
app.route("/", methods=["GET"])(read_root)
app.route("/tasks/", methods=["POST"])(create_task)
app.route("/tasks/", methods=["GET"])(read_tasks)
app.route("/tasks/<int:task_id>", methods=["GET"])(read_task)
app.route("/tasks/<int:task_id>", methods=["PUT"])(update_task)
app.route("/tasks/<int:task_id>", methods=["DELETE"])(delete_task)
app.route("/reminders/pending", methods=["GET"])(get_pending_reminders)
app.route("/tasks/statistics", methods=["GET"])(get_task_statistics)