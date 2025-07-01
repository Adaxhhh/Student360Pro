from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.types import JSON
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
import datetime

db = SQLAlchemy()

# Association Table for the many-to-many relationship between Teacher and Class
teacher_class_link = db.Table('teacher_class_link',
    db.Column('teacher_id', db.String(10), db.ForeignKey('teacher.id'), primary_key=True),
    db.Column('class_id', db.Integer, db.ForeignKey('class.id'), primary_key=True)
)

# Association Table for the many-to-many relationship between Parent and Student
parent_student_link = db.Table('parent_student_link',
    db.Column('parent_id', db.String(10), db.ForeignKey('parent.id'), primary_key=True),
    db.Column('student_id', db.String(10), db.ForeignKey('student.id'), primary_key=True)
)

class Class(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(20), unique=True, nullable=False)
    students = db.relationship('Student', back_populates='class_obj', lazy=True)
    teachers = db.relationship('Teacher', secondary=teacher_class_link, back_populates='classes')

    def __str__(self):
        return self.name

    def to_dict(self):
        return {"id": self.id, "name": self.name}

class Teacher(db.Model):
    id = db.Column(db.String(10), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    classes = db.relationship('Class', secondary=teacher_class_link, back_populates='teachers')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "username": self.username, "classes": [c.name for c in self.classes]}

    def __str__(self):
        return self.name

class Student(db.Model):
    id = db.Column(db.String(10), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    class_id = db.Column(db.Integer, db.ForeignKey('class.id'), nullable=False)
    attendance = db.Column(db.Integer)
    marks = db.Column(JSON)
    historical_marks = db.Column(JSON)
    class_obj = db.relationship('Class', back_populates='students')
    parents = db.relationship('Parent', secondary='parent_student_link', back_populates='children')
    doubts = db.relationship('Doubt', back_populates='student', cascade='all, delete-orphan')
    quiz_attempts = db.relationship('QuizAttempt', back_populates='student', lazy='dynamic', cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "username": self.username,
            "class_name": self.class_obj.name if self.class_obj else None,
            "attendance": self.attendance,
            "marks": self.marks, "historicalMarks": self.historical_marks,
            "parentIds": [p.id for p in self.parents]
        }

    def __str__(self):
        return self.name

class Parent(db.Model):
    id = db.Column(db.String(10), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    children = db.relationship('Student', secondary='parent_student_link', back_populates='parents')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        return {"id": self.id, "name": self.name, "username": self.username, "children": [s.id for s in self.children]}

    def __str__(self):
        return self.name

class Admin(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Doubt(db.Model):
    __tablename__ = 'doubts'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.String(10), db.ForeignKey('student.id'), nullable=False)
    teacher_id = db.Column(db.String(10), db.ForeignKey('teacher.id'), nullable=True)
    question_text = db.Column(db.String, nullable=False)
    answer_text = db.Column(db.String, nullable=True)
    is_resolved = db.Column(db.Boolean, default=False, nullable=False)
    student = db.relationship('Student', back_populates='doubts')
    teacher = db.relationship('Teacher')

    def to_dict(self):
        return {
            "id": self.id,
            "student_id": self.student_id,
            "student_name": self.student.name,
            "teacher_id": self.teacher_id,
            "question_text": self.question_text,
            "answer_text": self.answer_text,
            "is_resolved": self.is_resolved
        }

class Complaint(db.Model):
    __tablename__ = 'complaints'
    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.String(10), db.ForeignKey('teacher.id'), nullable=False)
    student_id = db.Column(db.String(10), db.ForeignKey('student.id'), nullable=False)
    parent_id = db.Column(db.String(10), db.ForeignKey('parent.id'), nullable=False)
    report_content = db.Column(JSON, nullable=False)
    teacher_remark = db.Column(db.String, nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    teacher = db.relationship('Teacher')
    student = db.relationship('Student')
    parent = db.relationship('Parent')

    def to_dict(self):
        return {
            "id": self.id,
            "teacher_id": self.teacher_id,
            "teacher_name": self.teacher.name,
            "student_id": self.student_id,
            "student_name": self.student.name,
            "parent_id": self.parent_id,
            "report_content": self.report_content,
            "teacher_remark": self.teacher_remark,
            "created_at": self.created_at.isoformat()
        }

class QuizAttempt(db.Model):
    __tablename__ = 'quiz_attempts'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.String(10), db.ForeignKey('student.id'), nullable=False)
    subject = db.Column(db.String(50), nullable=False)
    score = db.Column(db.Integer, nullable=False)
    total_questions = db.Column(db.Integer, nullable=False)
    accuracy = db.Column(db.Float, nullable=False)
    time_taken_seconds = db.Column(db.Integer, nullable=False)
    details = db.Column(JSON, nullable=False) # Store questions, answers, topics etc.
    attempted_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    
    student = db.relationship('Student', back_populates='quiz_attempts')

    def to_dict(self):
        return {
            "id": self.id,
            "student_id": self.student_id,
            "subject": self.subject,
            "score": self.score,
            "total_questions": self.total_questions,
            "accuracy": self.accuracy,
            "time_taken_seconds": self.time_taken_seconds,
            "details": self.details,
            "attempted_at": self.attempted_at.isoformat()
        }