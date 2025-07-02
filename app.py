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
