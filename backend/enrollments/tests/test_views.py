from datetime import date

from rest_framework.test import APITestCase

from academics.models import Subject
from accounts.models import Role, User
from clients.models import Student
from enrollments.models import Enrollment, EnrollmentStatus, LearningMode


def make_user(role, email=None, **kwargs):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(
        email=email, full_name=kwargs.pop('full_name', role.title()), role=role, **kwargs
    )


class EnrollmentCreateTests(APITestCase):
    """Covers the "returning student renewal" path: no Enquiry involved."""

    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.student = Student.objects.create(student_number='STU-000001', full_name='Alice', grade='7')
        self.subject = Subject.objects.create(name='Maths')

    def test_create_with_explicit_end_date(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            '/api/enrollments/',
            {
                'student': self.student.id,
                'subjects': [self.subject.id],
                'start_date': '2026-01-05',
                'end_date': '2026-04-05',
                'learning_mode': LearningMode.IN_PERSON,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['status'], EnrollmentStatus.ACTIVE)
        self.assertEqual(resp.data['student_name'], 'Alice')

    def test_create_with_duration_weeks_derives_end_date(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            '/api/enrollments/',
            {
                'student': self.student.id,
                'subjects': [self.subject.id],
                'start_date': '2026-01-05',
                'duration_weeks': 12,
                'learning_mode': LearningMode.ONLINE,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['end_date'], '2026-03-30')

    def test_requires_end_date_or_duration_weeks(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            '/api/enrollments/',
            {
                'student': self.student.id,
                'subjects': [self.subject.id],
                'start_date': '2026-01-05',
                'learning_mode': LearningMode.ONLINE,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_requires_at_least_one_subject(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            '/api/enrollments/',
            {
                'student': self.student.id,
                'subjects': [],
                'start_date': '2026-01-05',
                'duration_weeks': 4,
                'learning_mode': LearningMode.ONLINE,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_tutor_forbidden(self):
        tutor = make_user(Role.TUTOR)
        self.client.force_authenticate(tutor)
        resp = self.client.post(
            '/api/enrollments/',
            {
                'student': self.student.id,
                'subjects': [self.subject.id],
                'start_date': '2026-01-05',
                'duration_weeks': 4,
                'learning_mode': LearningMode.ONLINE,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 403)


class EnrollmentListTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.student_a = Student.objects.create(student_number='STU-000001', full_name='Alice', grade='7')
        self.student_b = Student.objects.create(student_number='STU-000002', full_name='Bob', grade='8')
        for student in (self.student_a, self.student_b):
            Enrollment.objects.create(
                student=student,
                start_date=date(2026, 1, 5),
                end_date=date(2026, 4, 5),
                learning_mode=LearningMode.IN_PERSON,
            )

    def test_filter_by_student(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/enrollments/?student={self.student_a.id}')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['student_name'], 'Alice')

    def test_unfiltered_returns_all(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/enrollments/')
        self.assertEqual(resp.data['count'], 2)


class WithdrawEnrollmentViewTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        student = Student.objects.create(student_number='STU-000001', full_name='Alice', grade='7')
        self.enrollment = Enrollment.objects.create(
            student=student,
            start_date=date(2026, 1, 5),
            end_date=date(2026, 4, 5),
            learning_mode=LearningMode.IN_PERSON,
        )

    def test_withdraw_sets_status_and_reason(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            f'/api/enrollments/{self.enrollment.id}/withdraw/', {'reason': 'Moved away'}, format='json'
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['status'], EnrollmentStatus.WITHDRAWN)
        self.assertEqual(resp.data['withdrawal_reason'], 'Moved away')

    def test_tutor_forbidden(self):
        tutor = make_user(Role.TUTOR)
        self.client.force_authenticate(tutor)
        resp = self.client.post(f'/api/enrollments/{self.enrollment.id}/withdraw/', {}, format='json')
        self.assertEqual(resp.status_code, 403)
