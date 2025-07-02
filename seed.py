# seed.py
from app import app
from models import db, Teacher, Student, Parent, Admin, Class

def seed_data():
    """A function to seed the database. This can be called from anywhere."""
    # The 'with app.app_context()' is crucial for SQLAlchemy to know about the app
    with app.app_context():
        # This is a destructive operation. Be careful in production.
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

# This block allows you to still run `python seed.py` locally if you want.
if __name__ == '__main__':
    seed_data()
