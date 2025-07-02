import os
from flask import Flask, jsonify, request, redirect, url_for, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import requests
from flask_admin import Admin as AdminManager, AdminIndexView, expose
from flask_admin.contrib.sqla import ModelView
from flask_migrate import Migrate
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user
from wtforms.fields import TextAreaField, PasswordField
from markupsafe import Markup
import json
import datetime

# Import the database object and models from models.py
from models import db, Teacher, Student, Parent, Admin, Class, Doubt, Complaint, QuizAttempt

# Load environment variables from .env file (for local development)
load_dotenv()

# --- App Initialization & Configuration ---
# Correctly configure the static folder to serve the frontend.
# static_url_path='' makes files available from the root URL (e.g., /styles.css)
app = Flask(
    __name__,
    static_folder='Frontend',
    static_url_path='' 
)

app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'a_default_secret_key')
# This line is crucial for Render: It will use the DATABASE_URL from the environment.
database_url = os.environ.get('DATABASE_URL', 'sqlite:///database.db')
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['FLASK_ADMIN_SWATCH'] = 'cerulean'

# --- Extensions Initialization ---
db.init_app(app)
migrate = Migrate(app, db) # <--- ADD THIS LINE to initialize Flask-Migrate
CORS(app, resources={r"/api/*": {"origins": "*"}}) # Limit CORS to API routes
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'admin.login' # Redirect to admin login


# --- NEW: MERGED SEEDING LOGIC ---
# The logic from seed.py is now here to avoid circular imports.

def seed_data():
    """A function to seed the database. This can be called from anywhere."""
    with app.app_context():
        print("Dropping all tables...")
        db.drop_all()
        print("Creating all tables...")
        db.create_all()

        mock_data = {
            'classes': [
                {'name': '10A'}, {'name': '10B'}, {'name': '11A'}
            ],
            'students': [
                {'id': 'S001', 'name': 'Alice Johnson', 'username': 'alice.j', 'password': 'student123', 'class_name': '10A', 'attendance': 88, 'marks': {'Math': 85, 'Science': 72, 'English': 90, 'History': 78, 'Arts': 95}, 'historical_marks': {'Math': [75, 80, 85], 'Science': [68, 70, 72], 'English': [85, 88, 90], 'History': [70, 75, 78], 'Arts': [90, 92, 95]}, 'parentIds': ['P001']},
                {'id': 'S002', 'name': 'Bob Smith', 'username': 'bob.s', 'password': 'student123', 'class_name': '10A', 'attendance': 70, 'marks': {'Math': 60, 'Science': 55, 'English': 70, 'History': 65, 'Arts': 80}, 'historical_marks': {'Math': [80, 70, 60], 'Science': [70, 60, 55], 'English': [75, 72, 70], 'History': [70, 68, 65], 'Arts': [85, 82, 80]}, 'parentIds': ['P002']},
                {'id': 'S003', 'name': 'Charlie Brown', 'username': 'charlie.b', 'password': 'student123', 'class_name': '10B', 'attendance': 98, 'marks': {'Math': 95, 'Science': 92, 'English': 98, 'History': 90, 'Arts': 99}, 'historical_marks': {'Math': [90, 93, 95], 'Science': [88, 90, 92], 'English': [95, 96, 98], 'History': [85, 88, 90], 'Arts': [95, 97, 99]}, 'parentIds': ['P003']},
                {'id': 'S004', 'name': 'Diana Prince', 'username': 'diana.p', 'password': 'student123', 'class_name': '10B', 'attendance': 80, 'marks': {'Math': 70, 'Science': 88, 'English': 75, 'History': 60, 'Arts': 85}, 'historical_marks': {'Math': [85, 78, 70], 'Science': [80, 85, 88], 'English': [70, 72, 75], 'History': [75, 68, 60], 'Arts': [80, 82, 85]}, 'parentIds': ['P001']},
                {'id': 'S005', 'name': 'Ethan Hunt', 'username': 'ethan.h', 'password': 'student123', 'class_name': '11A', 'attendance': 95, 'marks': {'Math': 78, 'Science': 82, 'English': 85, 'History': 88, 'Arts': 90}, 'historical_marks': {'Math': [70, 75, 78], 'Science': [80, 81, 82], 'English': [82, 84, 85], 'History': [85, 86, 88], 'Arts': [88, 89, 90]}, 'parentIds': ['P002']}
            ],
            'teachers': [
                {'id': 'T001', 'name': 'Mr. David Lee', 'username': 'david.l', 'password': 'teacher123', 'class_names': ['10A', '10B']},
                {'id': 'T002', 'name': 'Ms. Sarah Chen', 'username': 'sarah.c', 'password': 'teacher456', 'class_names': ['11A']}
            ],
            'parents': [
                {'id': 'P001', 'name': 'Mrs. Johnson', 'username': 'mrs.j', 'password': 'parent123', 'children_ids': ['S001', 'S004']},
                {'id': 'P002', 'name': 'Mr. Smith', 'username': 'mr.s', 'password': 'parent123', 'children_ids': ['S002', 'S005']},
                {'id': 'P003', 'name': 'Mrs. Brown', 'username': 'mrs.b', 'password': 'parent123', 'children_ids': ['S003']}
            ]
        }
        
        # ... (paste the entire contents of the old seed_data function here) ...
        # Seeding classes... teachers... parents... students... admin...
        print("Seeding classes...")
        class_map = {}
        for c_data in mock_data['classes']:
            new_class = Class(name=c_data['name'])
            db.session.add(new_class)
            class_map[c_data['name']] = new_class
        db.session.commit()

        print("Seeding teachers and linking classes...")
        for t_data in mock_data['teachers']:
            teacher = Teacher(id=t_data['id'], name=t_data['name'], username=t_data['username'])
            teacher.set_password(t_data['password'])
            for class_name in t_data.get('class_names', []):
                if class_name in class_map:
                    teacher.classes.append(class_map[class_name])
            db.session.add(teacher)

        print("Seeding parents...")
        parents_map = {}
        for p in mock_data['parents']:
            parent = Parent(id=p['id'], name=p['name'], username=p['username'])
            parent.set_password(p['password'])
            db.session.add(parent)
            parents_map[p['id']] = parent

        print("Seeding students and linking parents...")
        for s in mock_data['students']:
            student = Student(
                id=s['id'], name=s['name'], username=s['username'],
                class_id=class_map[s['class_name']].id,
                attendance=s['attendance'],
                marks=s['marks'], historical_marks=s['historical_marks']
            )
            student.set_password(s['password'])
            for parent_id in s.get('parentIds', []):
                if parent_id in parents_map:
                    student.parents.append(parents_map[parent_id])
            db.session.add(student)

        admin_user = Admin(username='admin')
        admin_user.set_password('admin')
        db.session.add(admin_user)
        
        db.session.commit()
        print("Database has been seeded successfully!")

# --- ONE-TIME DATABASE SEEDING ENDPOINT ---
# This endpoint now calls the function defined directly above it.
@app.route('/api/seed-database/<secret_key>')
def trigger_seed_data(secret_key):
    SEEDING_SECRET = os.environ.get('SEEDING_SECRET')
    if SEEDING_SECRET is None:
        return jsonify({"success": False, "message": "Seeding key is not configured on the server."}), 500
    if secret_key != SEEDING_SECRET:
        return jsonify({"success": False, "message": "Invalid secret key provided."}), 403

    try:
        print("SEEDING: Database seeding initiated via secret URL...")
        seed_data() # <-- This now calls the function in the same file
        print("SEEDING: Database seeding completed successfully.")
        return jsonify({"success": True, "message": "Database has been seeded successfully!"})
    except Exception as e:
        print(f"SEEDING: An error occurred during seeding: {e}")
        return jsonify({"success": False, "message": f"An error occurred: {e}"}), 500


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(Admin, int(user_id))

# --- Admin Views ---
# (Your Admin views remain unchanged)
class SecureModelView(ModelView):
    def is_accessible(self):
        return current_user.is_authenticated
    def inaccessible_callback(self, name, **kwargs):
        return redirect(url_for('admin.login'))

class UserManagementView(SecureModelView):
    column_exclude_list = ('password_hash',)
    form_excluded_columns = ('password_hash',)
    form_extra_fields = {'password': PasswordField('New Password', description='Enter a new password to update, or leave blank to keep current.')}
    def on_model_change(self, form, model, is_created):
        if form.password.data:
            model.set_password(form.password.data)

class JSONField(TextAreaField):
    def _value(self):
        if self.data: return json.dumps(self.data, indent=4)
        return ""
    def process_formdata(self, valuelist):
        if valuelist:
            try: self.data = json.loads(valuelist[0])
            except json.JSONDecodeError:
                self.data = None
                raise ValueError('Invalid JSON')

class StudentModelView(UserManagementView):
    form_overrides = {'marks': JSONField, 'historical_marks': JSONField}
    form_widget_args = {'marks': {'rows': 10, 'style': 'font-family: monospace;'}, 'historical_marks': {'rows': 10, 'style': 'font-family: monospace;'}}
    column_list = ('id', 'name', 'username', 'class_obj', 'attendance', 'parents')
    form_columns = ('id', 'name', 'username', 'class_obj', 'attendance', 'parents', 'marks', 'historical_marks', 'password')

class TeacherModelView(UserManagementView):
    column_list = ('id', 'name', 'username', 'classes')
    form_columns = ('id', 'name', 'username', 'classes', 'password')

class ParentModelView(UserManagementView):
    column_list = ('id', 'name', 'username', 'children')
    form_columns = ('id', 'name', 'username', 'children', 'password')

class ClassModelView(SecureModelView):
    column_list = ('name', 'teachers', 'students')
    form_columns = ('name', 'teachers', 'students')

class QuizAttemptModelView(SecureModelView):
    can_create = False
    can_edit = False
    column_list = ('student', 'subject', 'score', 'total_questions', 'accuracy', 'attempted_at')
    form_overrides = {'details': JSONField}
    form_widget_args = {'details': {'rows': 20, 'style': 'font-family: monospace;'}}

class SecureAdminIndexView(AdminIndexView):
    @expose('/')
    def index(self):
        if not current_user.is_authenticated: return redirect(url_for('.login'))
        return super(SecureAdminIndexView, self).index()
    @expose('/login', methods=['GET', 'POST'])
    def login(self):
        if current_user.is_authenticated: return redirect(url_for('.index'))
        if request.method == 'POST':
            username, password = request.form['username'], request.form['password']
            user = db.session.scalar(db.select(Admin).where(Admin.username == username))
            if user and user.check_password(password):
                login_user(user)
                return redirect(url_for('.index'))
        # This now correctly uses the 'login.html' from the project's root template_folder
        # We need to set template_folder in the Flask constructor for this to work.
        # For simplicity, we assume login.html is in a 'templates' folder.
        # So we'll adjust the Flask constructor: template_folder='templates'
        return self.render('login.html')
    @expose('/logout')
    def logout(self):
        logout_user()
        return redirect(url_for('.login'))

# Re-adjust Flask constructor to include templates for the admin login
app.template_folder = '.' # Assuming login.html is in the root

admin = AdminManager(app, name='Student360 Admin', template_mode='bootstrap3', index_view=SecureAdminIndexView(url='/admin'))
admin.add_view(TeacherModelView(Teacher, db.session))
admin.add_view(StudentModelView(Student, db.session))
admin.add_view(ParentModelView(Parent, db.session))
admin.add_view(UserManagementView(Admin, db.session, endpoint='admin_users'))
admin.add_view(ClassModelView(Class, db.session))
admin.add_view(SecureModelView(Complaint, db.session))
admin.add_view(QuizAttemptModelView(QuizAttempt, db.session))


# --- API Endpoints ---
# (Your API endpoints remain unchanged)
@app.route('/api/login', methods=['POST'])
def login_api():
    """Handles login for all roles."""
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    role = data.get('role')

    user_model = None
    if role == 'teacher': user_model = Teacher
    elif role == 'student': user_model = Student
    elif role == 'parent': user_model = Parent
    else: return jsonify({"success": False, "message": "Invalid role specified"}), 400

    user = db.session.scalar(db.select(user_model).where(user_model.username == username))

    if user and user.check_password(password):
        user_data = user.to_dict()
        if role == 'student':
             student_dict = user.to_dict()
             marks = student_dict.get('marks', {})
             if marks:
                 overall_avg = sum(marks.values()) / len(marks)
                 student_dict['overallAverage'] = f"{overall_avg:.1f}"
             else:
                 student_dict['overallAverage'] = "0.0"
             student_dict['quizzesTaken'] = user.quiz_attempts.count()
             user_data = student_dict
        return jsonify({"success": True, "user": user_data})
    
    return jsonify({"success": False, "message": "Invalid username or password"}), 401
# (Keep all other API routes as they are)
# ... all your other API routes ...
@app.route('/api/student/quiz/history/<student_id>', methods=['GET'])
def get_quiz_history(student_id):
    student = db.session.get(Student, student_id)
    if not student:
        return jsonify({"success": False, "message": "Student not found."}), 404

    attempts = student.quiz_attempts.order_by(QuizAttempt.attempted_at.desc()).all()
    return jsonify({"success": True, "history": [attempt.to_dict() for attempt in attempts]})


# --- Catch-all Route for Frontend ---
# This serves your frontend's index.html for any path not handled by the API or Admin.
# It's the key to making a Single Page Application (SPA) work with Flask.
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    # If the path points to an existing file in the static folder, serve it.
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    # Otherwise, serve the main index.html file.
    else:
        return send_from_directory(app.static_folder, 'index.html')

# --- Main Execution ---
# The check below is important for Gunicorn.
# The duplicate app initialization was removed from here.
if __name__ == '__main__':
    app.run(debug=True) # Runs in debug mode for local testing
