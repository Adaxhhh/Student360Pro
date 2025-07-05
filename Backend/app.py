import os
from flask import Flask, jsonify, request, redirect, url_for, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import requests
from flask_admin import Admin as AdminManager, AdminIndexView, expose
from flask_admin.contrib.sqla import ModelView
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user
from wtforms.fields import TextAreaField, PasswordField
from markupsafe import Markup
import json

# Import the database object and models from models.py
from models import db, Teacher, Student, Parent, Admin, Class, Doubt, Complaint, QuizAttempt

# Load environment variables from .env file
load_dotenv()

# --- App Initialization ---
# The static_folder points to the frontend directory to serve the main website.
# The template_folder is set to '.' to find login.html in the backend directory.
app = Flask(
    __name__,
    static_folder='../frontend',
    template_folder='.'
)

# --- App Configuration ---
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'a_default_secret_key')
database_url = os.environ.get('DATABASE_URL')
if database_url:
    # Render's DATABASE_URL is for postgres, but SQLAlchemy needs postgresql
    database_url = database_url.replace("postgres://", "postgresql://", 1)
    # Use the DATABASE_URL from the environment if it exists, otherwise fall back to SQLite
    database_url = os.environ.get('DATABASE_URL')
    if database_url:
        # Render's DATABASE_URL is for postgres, but SQLAlchemy needs postgresql
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url or 'sqlite:///database.db'
print(app.config['SQLALCHEMY_DATABASE_URI'])
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['FLASK_ADMIN_SWATCH'] = 'cerulean'

# --- Extensions Initialization ---
db.init_app(app)
CORS(app) # Allow all origins for all routes
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'admin.login' # Redirect to admin login

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(Admin, int(user_id))

# --- Admin Views ---
class SecureModelView(ModelView):
    """A secure ModelView that requires authentication."""
    def is_accessible(self):
        return current_user.is_authenticated

    def inaccessible_callback(self, name, **kwargs):
        # Redirect to login page if user is not authenticated
        return redirect(url_for('admin.login'))

class UserManagementView(SecureModelView):
    """A base view for managing models with user credentials."""
    
    # Exclude the password hash from the list view for security
    column_exclude_list = ('password_hash',)
    
    # Exclude the hash field from create/edit forms
    form_excluded_columns = ('password_hash',)

    # Add a temporary 'password' field to the create/edit forms
    form_extra_fields = {
        'password': PasswordField('New Password', description='Enter a new password to update, or leave blank to keep current.')
    }

    def on_model_change(self, form, model, is_created):
        """Handle password hashing when a model is created or updated."""
        if form.password.data:
            model.set_password(form.password.data)

class JSONField(TextAreaField):
    """A custom field to handle JSON data in a TextArea."""
    def _value(self):
        if self.data:
            return json.dumps(self.data, indent=4)
        return ""

    def process_formdata(self, valuelist):
        if valuelist:
            try:
                self.data = json.loads(valuelist[0])
            except json.JSONDecodeError:
                self.data = None
                raise ValueError('Invalid JSON')

class StudentModelView(UserManagementView):
    """A custom ModelView for the Student model to handle JSON and passwords."""
    form_overrides = {
        'marks': JSONField,
        'historical_marks': JSONField
    }
    
    # Increase the height of the text areas for better visibility
    form_widget_args = {
        'marks': {
            'rows': 10,
            'style': 'font-family: monospace;'
        },
        'historical_marks': {
            'rows': 10,
            'style': 'font-family: monospace;'
        }
    }
    # Show the parents in the list view
    column_list = ('id', 'name', 'username', 'class_obj', 'attendance', 'parents')
    # Make the class and parents editable
    form_columns = ('id', 'name', 'username', 'class_obj', 'attendance', 'parents', 'marks', 'historical_marks', 'password')

class TeacherModelView(UserManagementView):
    """A custom ModelView for the Teacher model to manage classes."""
    column_list = ('id', 'name', 'username', 'classes')
    form_columns = ('id', 'name', 'username', 'classes', 'password')

class ParentModelView(UserManagementView):
    """A custom ModelView for the Parent model to show children."""
    column_list = ('id', 'name', 'username', 'children')
    form_columns = ('id', 'name', 'username', 'children', 'password')

class ClassModelView(SecureModelView):
    """A custom ModelView for the Class model."""
    column_list = ('name', 'teachers', 'students')
    form_columns = ('name', 'teachers', 'students')

class QuizAttemptModelView(SecureModelView):
    """A custom ModelView for the QuizAttempt model."""
    can_create = False
    can_edit = False
    column_list = ('student', 'subject', 'score', 'total_questions', 'accuracy', 'attempted_at')
    form_overrides = {'details': JSONField}
    form_widget_args = {'details': {'rows': 20, 'style': 'font-family: monospace;'}}


class SecureAdminIndexView(AdminIndexView):
    """A secure AdminIndexView that requires authentication."""
    @expose('/')
    def index(self):
        if not current_user.is_authenticated:
            return redirect(url_for('.login'))
        return super(SecureAdminIndexView, self).index()

    @expose('/login', methods=['GET', 'POST'])
    def login(self):
        if current_user.is_authenticated:
            return redirect(url_for('.index'))
        if request.method == 'POST':
            username = request.form['username']
            password = request.form['password']
            user = db.session.scalar(db.select(Admin).where(Admin.username == username))
            if user and user.check_password(password):
                login_user(user)
                return redirect(url_for('.index'))
        return self.render('login.html')

    @expose('/logout')
    def logout(self):
        logout_user()
        return redirect(url_for('.login'))

# Initialize Flask-Admin
# The url='/admin' sets the base URL for the admin interface.
admin = AdminManager(
    app,
    name='Student360 Admin',
    template_mode='bootstrap3',
    index_view=SecureAdminIndexView(url='/admin')
)

# Add secure model views with password management
admin.add_view(TeacherModelView(Teacher, db.session))
admin.add_view(StudentModelView(Student, db.session))
admin.add_view(ParentModelView(Parent, db.session))
admin.add_view(UserManagementView(Admin, db.session, endpoint='admin_users'))
admin.add_view(ClassModelView(Class, db.session))
admin.add_view(SecureModelView(Complaint, db.session))
admin.add_view(QuizAttemptModelView(QuizAttempt, db.session))


# --- Helper Functions ---
def get_student_details(student):
    """A helper to get full student details, including calculated fields."""
    student_dict = student.to_dict()
    marks = student_dict.get('marks', {})
    
    if marks:
        overall_avg = sum(marks.values()) / len(marks) if marks else 0
        student_dict['overallAverage'] = f"{overall_avg:.1f}"
        lowest_subject = min(marks, key=marks.get)
        highest_subject = max(marks, key=marks.get)
        student_dict['lowestSubject'] = {"subject": lowest_subject, "score": marks[lowest_subject]}
        student_dict['highestSubject'] = {"subject": highest_subject, "score": marks[highest_subject]}
    else:
        student_dict['overallAverage'] = "0.0"
        student_dict['lowestSubject'] = {"subject": "N/A", "score": 0}
        student_dict['highestSubject'] = {"subject": "N/A", "score": 0}
        
    # Get the number of quizzes taken
    student_dict['quizzesTaken'] = student.quiz_attempts.count()

    return student_dict

# --- API Endpoints ---
# All API endpoints are prefixed with /api to distinguish them from frontend routes.
@app.route('/api/login', methods=['POST'])
def login_api():
    """Handles login for all roles."""
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    role = data.get('role')

    user_model = None
    if role == 'teacher':
        user_model = Teacher
    elif role == 'student':
        user_model = Student
    elif role == 'parent':
        user_model = Parent
    else:
        return jsonify({"success": False, "message": "Invalid role specified"}), 400

    user = db.session.scalar(db.select(user_model).where(user_model.username == username))

    if user and user.check_password(password):
        user_data = user.to_dict()
        if role == 'student':
            user_data = get_student_details(user)
        return jsonify({"success": True, "user": user_data})
    
    return jsonify({"success": False, "message": "Invalid username or password"}), 401

@app.route('/api/teacher/dashboard', methods=['GET'])
def get_teacher_dashboard():
    """Provides all data needed for the teacher dashboard."""
    students = db.session.scalars(db.select(Student)).all()
    students_data = [get_student_details(s) for s in students]
    return jsonify(students_data)

@app.route('/api/parent/children/<parent_id>', methods=['GET'])
def get_parent_children(parent_id):
    """Provides data for all children linked to a parent."""
    parent = db.session.get(Parent, parent_id)
    if not parent:
        return jsonify({"message": "Parent not found"}), 404
        
    children_data = [get_student_details(child) for child in parent.children]
    all_students = db.session.scalars(db.select(Student)).all()
    topper = max(all_students, key=lambda s: float(get_student_details(s).get('overallAverage', 0)))
    
    return jsonify({ "children": children_data, "topper": get_student_details(topper) })

@app.route('/api/student/ask-doubt', methods=['POST'])
def ask_doubt():
    data = request.get_json()
    student_id = data.get('student_id')
    question_text = data.get('question_text')
    teacher_id = data.get('teacher_id')

    if not all([student_id, question_text]):
        return jsonify({"success": False, "message": "Missing student ID or question text."}), 400

    student = db.session.get(Student, student_id)
    if not student:
        return jsonify({"success": False, "message": "Student not found."}), 404
        
    new_doubt = Doubt(
        student_id=student_id,
        question_text=question_text,
        teacher_id=teacher_id
    )
    db.session.add(new_doubt)
    db.session.commit()

    return jsonify({"success": True, "message": "Your doubt has been submitted successfully!"})

@app.route('/api/teacher/doubts/<teacher_id>', methods=['GET'])
def get_teacher_doubts(teacher_id):
    teacher = db.session.get(Teacher, teacher_id)
    if not teacher:
        return jsonify({"success": False, "message": "Teacher not found."}), 404
    
    # Fetch unresolved doubts for this teacher or doubts with no assigned teacher
    doubts = db.session.query(Doubt).filter(
        (Doubt.teacher_id == teacher_id) | (Doubt.teacher_id == None),
        Doubt.is_resolved == False
    ).all()
    
    return jsonify({"success": True, "doubts": [d.to_dict() for d in doubts]})

@app.route('/api/doubts/resolve/<int:doubt_id>', methods=['POST'])
def resolve_doubt(doubt_id):
    doubt = db.session.get(Doubt, doubt_id)
    if not doubt:
        return jsonify({"success": False, "message": "Doubt not found."}), 404
    
    doubt.is_resolved = True
    db.session.commit()
    
    return jsonify({"success": True, "message": "Doubt marked as resolved."})

@app.route('/api/doubts/answer/<int:doubt_id>', methods=['POST'])
def answer_doubt(doubt_id):
    doubt = db.session.get(Doubt, doubt_id)
    if not doubt:
        return jsonify({"success": False, "message": "Doubt not found."}), 404
        
    data = request.get_json()
    answer_text = data.get('answer_text')
    
    if not answer_text:
        return jsonify({"success": False, "message": "Answer text is required."}), 400
        
    doubt.answer_text = answer_text
    doubt.is_resolved = True
    db.session.commit()
    
    return jsonify({"success": True, "message": "Doubt answered successfully."})

@app.route('/api/student/doubts/<student_id>', methods=['GET'])
def get_student_doubts(student_id):
    student = db.session.get(Student, student_id)
    if not student:
        return jsonify({"success": False, "message": "Student not found."}), 404
        
    doubts = db.session.query(Doubt).filter(Doubt.student_id == student_id).all()
    return jsonify({"success": True, "doubts": [d.to_dict() for d in doubts]})

@app.route('/api/student/teachers', methods=['GET'])
def get_student_teachers():
    if not current_user or not isinstance(current_user, Student):
        # This is a placeholder for a more robust session check
        # In a real app, you'd get the logged-in student from the session
        # For now, let's assume student 'S001' is logged in for testing
        student = db.session.get(Student, 'S001')
    else:
        student = current_user

    if not student or not student.class_obj:
        return jsonify({"success": False, "message": "Student or class not found."}), 404
        
    teachers = student.class_obj.teachers
    return jsonify({"success": True, "teachers": [t.to_dict() for t in teachers]})

@app.route('/api/gemini-proxy', methods=['POST'])
def gemini_proxy():
    """A secure proxy for the Gemini API."""
    gemini_api_key = os.environ.get('GEMINI_API_KEY')
    if not gemini_api_key:
        return jsonify({"error": "API key not configured on the server."}), 500

    data = request.get_json()
    prompt = data.get('prompt')
    if not prompt:
        return jsonify({"error": "No prompt provided."}), 400

    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
    payload = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        response = requests.post(api_url, json=payload)
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        print(f"Error calling Gemini API: {e}")
        error_details = "An unknown error occurred."
        try:
            error_details = e.response.json()
        except (ValueError, AttributeError):
            pass
        return jsonify({"error": "Failed to communicate with the AI service.", "details": error_details}), 502

@app.route('/api/parent/complaints/<parent_id>', methods=['GET'])
def get_parent_complaints(parent_id):
    parent = db.session.get(Parent, parent_id)
    if not parent:
        return jsonify({"success": False, "message": "Parent not found."}), 404
        
    complaints = db.session.query(Complaint).filter(Complaint.parent_id == parent_id).order_by(Complaint.created_at.desc()).all()
    return jsonify({"success": True, "complaints": [c.to_dict() for c in complaints]})

@app.route('/api/teacher/complaint', methods=['POST'])
def create_complaint():
    data = request.get_json()
    teacher_id = data.get('teacher_id')
    student_id = data.get('student_id')
    remark = data.get('remark')

    if not all([teacher_id, student_id, remark]):
        return jsonify({"success": False, "message": "Missing required fields."}), 400

    student = db.session.get(Student, student_id)
    if not student or not student.parents:
        return jsonify({"success": False, "message": "Student or linked parent not found."}), 404
        
    # For simplicity, we send the complaint to the first linked parent.
    # A real-world app might handle multiple parents differently.
    parent_id = student.parents[0].id
    
    # Generate the performance report content
    report_content = get_student_details(student)

    new_complaint = Complaint(
        teacher_id=teacher_id,
        student_id=student_id,
        parent_id=parent_id,
        report_content=report_content,
        teacher_remark=remark
    )
    db.session.add(new_complaint)
    db.session.commit()

    return jsonify({"success": True, "message": "Complaint sent to parent successfully."})

@app.route('/api/student/quiz/attempt', methods=['POST'])
def save_quiz_attempt():
    data = request.get_json()
    student_id = data.get('student_id')
    student = db.session.get(Student, student_id)
    if not student:
        return jsonify({"success": False, "message": "Student not found."}), 404

    # Basic validation
    required_fields = ['subject', 'score', 'total_questions', 'accuracy', 'time_taken_seconds', 'details']
    if not all(field in data for field in required_fields):
        return jsonify({"success": False, "message": "Missing required fields for quiz attempt."}), 400

    new_attempt = QuizAttempt(
        student_id=student_id,
        subject=data['subject'],
        score=data['score'],
        total_questions=data['total_questions'],
        accuracy=data['accuracy'],
        time_taken_seconds=data['time_taken_seconds'],
        details=data['details']
    )
    db.session.add(new_attempt)
    db.session.commit()

    return jsonify({"success": True, "message": "Quiz attempt saved successfully."}), 201

@app.route('/api/student/quiz/history/<student_id>', methods=['GET'])
def get_quiz_history(student_id):
    student = db.session.get(Student, student_id)
    if not student:
        return jsonify({"success": False, "message": "Student not found."}), 404

    attempts = student.quiz_attempts.order_by(QuizAttempt.attempted_at.desc()).all()
    return jsonify({"success": True, "history": [attempt.to_dict() for attempt in attempts]})

# --- Catch-all route for Frontend ---
# This route serves the frontend's index.html for any path not handled by the API or Admin panel.
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

# --- Main Execution ---
if __name__ == '__main__':
    with app.app_context():
        # This ensures the database is created if it doesn't exist
        db.create_all()
    app.run(debug=True, port=8000)
