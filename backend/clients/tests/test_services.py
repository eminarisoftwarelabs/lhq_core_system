from django.test import TestCase

from clients.models import Student
from clients.services import generate_student_number


class GenerateStudentNumberTests(TestCase):
    def test_first_student_gets_seq_one(self):
        self.assertEqual(generate_student_number(), 'STU-000001')

    def test_increments_from_the_highest_existing_number(self):
        Student.objects.create(student_number='STU-000001', full_name='A', grade='5')
        Student.objects.create(student_number='STU-000007', full_name='B', grade='6')
        self.assertEqual(generate_student_number(), 'STU-000008')

    def test_skips_past_a_collision(self):
        Student.objects.create(student_number='STU-000001', full_name='A', grade='5')
        # Out-of-band row (e.g. created via /admin/) sitting past the
        # would-be next sequence number - generate_student_number must not
        # hand back a number that already exists.
        Student.objects.create(student_number='STU-000002', full_name='B', grade='6')
        self.assertEqual(generate_student_number(), 'STU-000003')

    def test_ignores_non_numeric_suffix_gracefully(self):
        Student.objects.create(student_number='STU-LEGACY', full_name='Legacy', grade='7')
        # Falls back to seq 1 rather than crashing on a non-digit suffix.
        number = generate_student_number()
        self.assertTrue(number.startswith('STU-'))
        self.assertNotEqual(number, 'STU-LEGACY')
