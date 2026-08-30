from datetime import date

from django.test import TestCase

from academics.models import Subject
from clients.models import Student
from enrollments.models import Enrollment, EnrollmentStatus, LearningMode
from enrollments.services import compute_end_date, withdraw


class ComputeEndDateTests(TestCase):
    def test_adds_duration_in_weeks(self):
        self.assertEqual(compute_end_date(date(2026, 1, 5), 12), date(2026, 3, 30))

    def test_none_start_date_returns_none(self):
        self.assertIsNone(compute_end_date(None, 12))

    def test_none_duration_returns_none(self):
        self.assertIsNone(compute_end_date(date(2026, 1, 5), None))

    def test_zero_duration_returns_none(self):
        self.assertIsNone(compute_end_date(date(2026, 1, 5), 0))


class WithdrawTests(TestCase):
    def test_withdraw_sets_status_date_and_reason(self):
        student = Student.objects.create(student_number='STU-000001', full_name='Alice', grade='7')
        subject = Subject.objects.create(name='Maths')
        enrollment = Enrollment.objects.create(
            student=student,
            start_date=date(2026, 1, 5),
            end_date=date(2026, 4, 5),
            learning_mode=LearningMode.IN_PERSON,
        )
        enrollment.subjects.set([subject])

        withdraw(enrollment, reason='Moved away')

        enrollment.refresh_from_db()
        self.assertEqual(enrollment.status, EnrollmentStatus.WITHDRAWN)
        self.assertIsNotNone(enrollment.withdrawn_at)
        self.assertEqual(enrollment.withdrawal_reason, 'Moved away')
