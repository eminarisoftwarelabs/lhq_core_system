import io

from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, TutorProfile, TutorSubject, User, WorkingHours
from academics.models import Subject, TimetableSlot
from billing.models import Invoice, InvoiceStatus, Payment
from clients.models import Guardianship, Parent, Student
from enquiries.models import Enquiry, EnquiryStage
from enrollments.models import Enrollment


class HealthCheckTests(APITestCase):
    def test_returns_ok_status(self):
        response = self.client.get(reverse('health-check'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'ok')

    def test_response_is_json(self):
        response = self.client.get(reverse('health-check'))

        self.assertEqual(response['Content-Type'], 'application/json')

    def test_does_not_require_authentication(self):
        response = self.client.get(reverse('health-check'))

        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)


def _seed():
    call_command('seed_dummy_data', stdout=io.StringIO())


class SeedDummyDataCommandTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        _seed()

    def test_creates_admin_and_tutors_with_profiles(self):
        admin = User.objects.get(email='admin.demo@lhq.test')
        self.assertEqual(admin.role, Role.ADMIN)

        tutors = User.objects.filter(role=Role.TUTOR, email__endswith='@lhq.test')
        self.assertEqual(tutors.count(), 4)
        self.assertTrue(tutors.filter(email='tutor@lhq.test').exists())
        for tutor in tutors:
            self.assertTrue(hasattr(tutor, 'tutor_profile'))

    def test_creates_subjects_with_timetable_slots_and_tutors(self):
        expected = {'Mathematics', 'English Language', 'Physics', 'Chemistry', 'Biology'}
        subjects = Subject.objects.filter(name__in=expected)
        self.assertEqual({s.name for s in subjects}, expected)

        for subject in subjects:
            self.assertEqual(subject.level.name, 'IGCSE')
            self.assertTrue(subject.tutor_links.exists(), f'{subject.name} has no tutor')
            self.assertTrue(TimetableSlot.objects.filter(subject=subject).exists())
        self.assertEqual(
            {s.name for s in subjects if s.has_paper}, {'Mathematics', 'Physics', 'Chemistry', 'Biology'}
        )

        slots = TimetableSlot.objects.filter(subject__in=subjects)
        days = {slot.day_of_week for slot in slots}
        self.assertGreater(len(days), 1, 'timetable slots should be spread across different days')

    def test_tutors_get_working_hours_except_the_one_left_to_show_the_warning(self):
        hours = {
            u.email: u.tutor_profile.working_hours.count()
            for u in User.objects.filter(role=Role.TUTOR, email__endswith='@lhq.test')
        }
        self.assertEqual(hours['thandiwe.mvula@lhq.test'], 0)
        self.assertEqual(hours['chisomo.phiri@lhq.test'], 5)
        chisomo = User.objects.get(email='chisomo.phiri@lhq.test').tutor_profile
        self.assertEqual(chisomo.working_hours.filter(weekday=0).count(), 2)  # split Monday
        self.assertTrue(chisomo.working_hours.filter(weekday=5).exists())  # Saturday is allowed

    def test_creates_parents_and_students_with_guardianships(self):
        chikondi = Parent.objects.get(full_name='Chikondi Banda')
        loveness = Parent.objects.get(full_name='Loveness Chirwa')
        yamikani = Parent.objects.get(full_name='Yamikani Gondwe')

        self.assertEqual(Guardianship.objects.filter(parent=chikondi).count(), 2)
        self.assertEqual(Guardianship.objects.filter(parent=loveness).count(), 2)
        self.assertEqual(Guardianship.objects.filter(parent=yamikani).count(), 1)

        for full_name in ['Takondwa Banda', 'Chisomo Banda', 'Dalitso Chirwa', 'Grace Chirwa', 'Ethel Gondwe']:
            self.assertTrue(Student.objects.filter(full_name=full_name).exists(), full_name)

    def test_every_student_has_an_enrollment_with_at_least_one_subject(self):
        # Regression test: clients.models.Student's own docstring says a
        # Student row shouldn't exist until enrollment, so every seeded
        # student must have a real Enrollment linked to at least one
        # Subject, not just a bare Student + Guardianship.
        for student in Student.objects.all():
            enrollment = student.enrollments.first()
            self.assertIsNotNone(enrollment, f'{student.full_name} has no Enrollment')
            self.assertGreater(
                enrollment.subjects.count(), 0, f'{student.full_name} has an Enrollment with no subjects'
            )

    def test_enquiries_cover_every_stage(self):
        expected_stages = {
            'Mphatso Kachingwe': EnquiryStage.INITIAL_CALL,
            'Wongani Msiska': EnquiryStage.MEETING_SET,
            'Blessings Nkhoma': EnquiryStage.INVOICED,
            'Precious Zulu': EnquiryStage.ENROLLED,
            'Isaac Kanyenda': EnquiryStage.ENROLLED,
        }
        for student_name, stage in expected_stages.items():
            enquiry = Enquiry.objects.get(student_name=student_name)
            self.assertEqual(enquiry.stage, stage, student_name)

        meeting_set = Enquiry.objects.get(student_name='Wongani Msiska')
        self.assertIsNotNone(meeting_set.meeting_datetime)

    def test_enrolled_enquiries_get_enrollment_invoice_and_payments(self):
        fully_paid_enquiry = Enquiry.objects.get(student_name='Precious Zulu')
        partially_paid_enquiry = Enquiry.objects.get(student_name='Isaac Kanyenda')

        self.assertIsNotNone(fully_paid_enquiry.enrollment_id)
        self.assertIsNotNone(partially_paid_enquiry.enrollment_id)
        self.assertTrue(Enrollment.objects.filter(pk=fully_paid_enquiry.enrollment_id).exists())
        self.assertTrue(Enrollment.objects.filter(pk=partially_paid_enquiry.enrollment_id).exists())

        fully_paid_invoice = Invoice.objects.get(enquiry=fully_paid_enquiry)
        partially_paid_invoice = Invoice.objects.get(enquiry=partially_paid_enquiry)

        self.assertEqual(fully_paid_invoice.status, InvoiceStatus.PAID)
        self.assertEqual(fully_paid_invoice.balance_due, 0)

        self.assertEqual(partially_paid_invoice.status, InvoiceStatus.PARTIALLY_PAID)
        self.assertGreater(partially_paid_invoice.balance_due, 0)
        self.assertGreaterEqual(Payment.objects.filter(invoice=partially_paid_invoice).count(), 2)

    def test_invoiced_only_enquiry_has_no_enrollment(self):
        invoiced = Enquiry.objects.get(student_name='Blessings Nkhoma')
        self.assertIsNone(invoiced.enrollment_id)
        self.assertTrue(Invoice.objects.filter(enquiry=invoiced).exists())

    def test_running_twice_is_idempotent(self):
        counts_after_first_run = {
            'users': User.objects.count(),
            'parents': Parent.objects.count(),
            'students': Student.objects.count(),
            'enquiries': Enquiry.objects.count(),
            'invoices': Invoice.objects.count(),
            'payments': Payment.objects.count(),
            'enrollments': Enrollment.objects.count(),
            'subjects': Subject.objects.count(),
            'timetable_slots': TimetableSlot.objects.count(),
            'tutor_profiles': TutorProfile.objects.count(),
            'guardianships': Guardianship.objects.count(),
            'tutor_subjects': TutorSubject.objects.count(),
            'working_hours': WorkingHours.objects.count(),
        }

        _seed()

        counts_after_second_run = {
            'users': User.objects.count(),
            'parents': Parent.objects.count(),
            'students': Student.objects.count(),
            'enquiries': Enquiry.objects.count(),
            'invoices': Invoice.objects.count(),
            'payments': Payment.objects.count(),
            'enrollments': Enrollment.objects.count(),
            'subjects': Subject.objects.count(),
            'timetable_slots': TimetableSlot.objects.count(),
            'tutor_profiles': TutorProfile.objects.count(),
            'guardianships': Guardianship.objects.count(),
            'tutor_subjects': TutorSubject.objects.count(),
            'working_hours': WorkingHours.objects.count(),
        }

        self.assertEqual(counts_after_first_run, counts_after_second_run)

    def test_does_not_touch_pre_existing_sys_admin_or_owner_accounts(self):
        sys_admin = User.objects.create_user(
            email='real.sysadmin@lhq.test',
            password='irrelevant',
            full_name='Real Sys Admin',
            role=Role.SYS_ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        owner = User.objects.create_user(
            email='real.owner@lhq.test',
            password='irrelevant',
            full_name='Real Owner',
            role=Role.OWNER,
        )

        _seed()

        sys_admin.refresh_from_db()
        owner.refresh_from_db()
        self.assertEqual(sys_admin.full_name, 'Real Sys Admin')
        self.assertEqual(sys_admin.role, Role.SYS_ADMIN)
        self.assertEqual(owner.full_name, 'Real Owner')
        self.assertEqual(owner.role, Role.OWNER)


class NotificationApiTests(APITestCase):
    def setUp(self):
        from core.services import notify

        self.me = User.objects.create_user(email='me@lhq.test', full_name='Me', role=Role.TUTOR)
        self.someone = User.objects.create_user(email='else@lhq.test', full_name='Else', role=Role.TUTOR)
        notify([self.me], 'First', '/me')
        notify([self.me, self.me], 'Second (deduped)', '/me')
        notify([self.someone], 'Not yours', '/me')
        self.client.force_authenticate(self.me)

    def test_lists_only_my_notifications_newest_first_with_unread_count(self):
        resp = self.client.get('/api/notifications/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['unread_count'], 2)
        self.assertEqual([n['message'] for n in resp.data['results']], ['Second (deduped)', 'First'])
        self.assertEqual(resp.data['results'][0]['link'], '/me')
        self.assertFalse(resp.data['results'][0]['is_read'])

    def test_mark_read_is_idempotent_and_lowers_the_count(self):
        from core.models import Notification

        note = Notification.objects.filter(recipient=self.me).last()
        first = self.client.post(f'/api/notifications/{note.id}/read/')
        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.data['is_read'])
        second = self.client.post(f'/api/notifications/{note.id}/read/')
        self.assertEqual(second.data['read_at'], first.data['read_at'])
        self.assertEqual(self.client.get('/api/notifications/').data['unread_count'], 1)

    def test_cannot_read_someone_elses(self):
        from core.models import Notification

        theirs = Notification.objects.get(recipient=self.someone)
        self.assertEqual(self.client.post(f'/api/notifications/{theirs.id}/read/').status_code, 404)
        theirs.refresh_from_db()
        self.assertIsNone(theirs.read_at)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/notifications/').status_code, 401)
