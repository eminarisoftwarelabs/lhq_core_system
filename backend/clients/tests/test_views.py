from datetime import date

from rest_framework.test import APITestCase

from academics.models import Subject, TimetableSlot
from accounts.models import Role, TutorProfile, User
from clients.models import Guardianship, Parent, Student
from enrollments.models import Enrollment, EnrollmentStatus, LearningMode


def make_user(role, email=None, **kwargs):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(
        email=email, full_name=kwargs.pop('full_name', role.title()), role=role, **kwargs
    )


class StudentSearchTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor = make_user(Role.TUTOR)
        self.alice = Student.objects.create(student_number='STU-000001', full_name='Alice Wang', grade='7')
        self.bob = Student.objects.create(student_number='STU-000002', full_name='Bob Chen', grade='8')

    def test_search_by_name(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/?q=alice')
        self.assertEqual(resp.status_code, 200)
        names = {row['full_name'] for row in resp.data['results']}
        self.assertEqual(names, {'Alice Wang'})

    def test_search_by_student_number(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/?q=000002')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['full_name'], 'Bob Chen')

    def test_search_alias_path(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/search/?q=alice')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)

    def test_no_query_returns_everyone(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/')
        self.assertEqual(resp.data['count'], 2)

    def test_tutor_forbidden(self):
        self.client.force_authenticate(self.tutor)
        resp = self.client.get('/api/students/')
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_unauthorized(self):
        resp = self.client.get('/api/students/')
        self.assertEqual(resp.status_code, 401)


class StudentDetailTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.student = Student.objects.create(student_number='STU-000001', full_name='Alice Wang', grade='7')
        parent = Parent.objects.create(full_name='Wanjiru Wang', phone='0999')
        Guardianship.objects.create(student=self.student, parent=parent, is_primary_contact=True)

    def test_detail_includes_guardianships(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/students/{self.student.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['guardianships']), 1)
        self.assertEqual(resp.data['guardianships'][0]['parent']['full_name'], 'Wanjiru Wang')
        self.assertTrue(resp.data['guardianships'][0]['is_primary_contact'])


class StudentTimetableTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.student = Student.objects.create(student_number='STU-000001', full_name='Alice Wang', grade='7')
        self.subject = Subject.objects.create(name='Maths')
        TimetableSlot.objects.create(subject=self.subject, day_of_week=2, start_time='15:00', end_time='16:00')

    def test_active_enrollment_subject_appears_in_timetable(self):
        enrollment = Enrollment.objects.create(
            student=self.student,
            start_date=date(2026, 1, 5),
            end_date=date(2026, 4, 5),
            learning_mode=LearningMode.IN_PERSON,
            status=EnrollmentStatus.ACTIVE,
        )
        enrollment.subjects.set([self.subject])

        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/students/{self.student.id}/timetable/')

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['subject_name'], 'Maths')
        self.assertEqual(resp.data[0]['day_of_week'], 2)

    def test_withdrawn_enrollment_excluded(self):
        enrollment = Enrollment.objects.create(
            student=self.student,
            start_date=date(2026, 1, 5),
            end_date=date(2026, 4, 5),
            learning_mode=LearningMode.IN_PERSON,
            status=EnrollmentStatus.WITHDRAWN,
        )
        enrollment.subjects.set([self.subject])

        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/students/{self.student.id}/timetable/')

        self.assertEqual(resp.data, [])


class SubjectRosterTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor_user = make_user(Role.TUTOR)
        self.tutor_profile = TutorProfile.objects.create(user=self.tutor_user)
        self.other_tutor_user = make_user(Role.TUTOR, email='other@lhq.test')
        self.other_tutor_profile = TutorProfile.objects.create(user=self.other_tutor_user)

        self.subject = Subject.objects.create(name='Maths', tutor=self.tutor_profile)
        self.student = Student.objects.create(student_number='STU-000001', full_name='Alice Wang', grade='7')

        enrollment = Enrollment.objects.create(
            student=self.student,
            start_date=date(2026, 1, 5),
            end_date=date(2026, 4, 5),
            learning_mode=LearningMode.IN_PERSON,
            status=EnrollmentStatus.ACTIVE,
        )
        enrollment.subjects.set([self.subject])

    def test_staff_sees_roster(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/subjects/{self.subject.id}/students/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['full_name'], 'Alice Wang')

    def test_owning_tutor_sees_roster(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get(f'/api/subjects/{self.subject.id}/students/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_non_owning_tutor_gets_404(self):
        self.client.force_authenticate(self.other_tutor_user)
        resp = self.client.get(f'/api/subjects/{self.subject.id}/students/')
        self.assertEqual(resp.status_code, 404)

    def test_withdrawn_student_excluded_from_roster(self):
        Enrollment.objects.filter(student=self.student).update(status=EnrollmentStatus.WITHDRAWN)
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/subjects/{self.subject.id}/students/')
        self.assertEqual(resp.data, [])
