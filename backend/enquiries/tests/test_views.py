from rest_framework.test import APITestCase

from academics.models import Subject
from accounts.models import Role, User
from clients.models import Parent
from enquiries.models import Enquiry, EnquiryStage


def make_user(role, email=None, **kwargs):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(
        email=email, full_name=kwargs.pop('full_name', role.title()), role=role, **kwargs
    )


class EnquiryCreateTests(APITestCase):
    def setUp(self):
        self.admin = make_user(Role.ADMIN)
        self.subject = Subject.objects.create(name='Maths')

    def test_creates_enquiry_with_new_parent(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(
            '/api/enquiries/',
            {
                'parent': {'full_name': 'Jane Doe', 'phone': '0999111222'},
                'student_name': 'Jimmy Doe',
                'student_grade': '7',
                'subject_ids': [self.subject.id],
                'duration_weeks': 12,
                'learning_mode': 'IN_PERSON',
                'desired_start_date': '2026-02-01',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['stage'], EnquiryStage.INITIAL_CALL)
        self.assertEqual(resp.data['parent']['full_name'], 'Jane Doe')
        self.assertEqual(len(resp.data['stage_history']), 1)

    def test_tutor_forbidden(self):
        tutor = make_user(Role.TUTOR)
        self.client.force_authenticate(tutor)
        resp = self.client.post(
            '/api/enquiries/',
            {
                'parent': {'full_name': 'Jane Doe', 'phone': '0999'},
                'student_name': 'Jimmy',
                'student_grade': '7',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_missing_required_field_400(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post('/api/enquiries/', {'parent': {'full_name': 'Jane Doe', 'phone': '0999'}}, format='json')
        self.assertEqual(resp.status_code, 400)


class EnquiryListTests(APITestCase):
    def setUp(self):
        self.admin = make_user(Role.ADMIN)
        parent = Parent.objects.create(full_name='Jane Doe', phone='0999')
        self.initial = Enquiry.objects.create(parent=parent, student_name='A', student_grade='7')
        self.meeting_set = Enquiry.objects.create(
            parent=parent, student_name='B', student_grade='8', stage=EnquiryStage.MEETING_SET
        )

    def test_lists_all(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get('/api/enquiries/')
        self.assertEqual(resp.data['count'], 2)

    def test_filters_by_stage(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get('/api/enquiries/?stage=MEETING_SET')
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['student_name'], 'B')


class EnquiryDetailAndPatchTests(APITestCase):
    def setUp(self):
        self.admin = make_user(Role.ADMIN)
        parent = Parent.objects.create(full_name='Jane Doe', phone='0999')
        self.enquiry = Enquiry.objects.create(parent=parent, student_name='Jimmy', student_grade='7')

    def test_get_detail(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(f'/api/enquiries/{self.enquiry.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['student_name'], 'Jimmy')

    def test_patch_updates_editable_fields(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.patch(
            f'/api/enquiries/{self.enquiry.id}/', {'notes': 'Wants Saturday slot'}, format='json'
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.notes, 'Wants Saturday slot')

    def test_patch_rejects_direct_stage_write(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.patch(
            f'/api/enquiries/{self.enquiry.id}/', {'stage': EnquiryStage.INVOICED}, format='json'
        )
        self.assertEqual(resp.status_code, 400)
        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.stage, EnquiryStage.INITIAL_CALL)


class EnquiryStageEndpointTests(APITestCase):
    def setUp(self):
        self.admin = make_user(Role.ADMIN)
        parent = Parent.objects.create(full_name='Jane Doe', phone='0999')
        self.enquiry = Enquiry.objects.create(parent=parent, student_name='Jimmy', student_grade='7')

    def test_transitions_stage_and_records_note(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.patch(
            f'/api/enquiries/{self.enquiry.id}/stage/',
            {'new_stage': EnquiryStage.MEETING_SET, 'note': 'Booked for Tuesday'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], EnquiryStage.MEETING_SET)
        self.assertEqual(resp.data['stage_history'][-1]['note'], 'Booked for Tuesday')

    def test_cannot_manually_set_enrolled(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.patch(
            f'/api/enquiries/{self.enquiry.id}/stage/', {'new_stage': EnquiryStage.ENROLLED}, format='json'
        )
        self.assertEqual(resp.status_code, 400)


class GenerateInvoiceEndpointTests(APITestCase):
    def setUp(self):
        self.admin = make_user(Role.ADMIN)
        self.subject = Subject.objects.create(name='Maths')
        parent = Parent.objects.create(full_name='Jane Doe', phone='0999')
        self.enquiry = Enquiry.objects.create(
            parent=parent,
            student_name='Jimmy',
            student_grade='7',
            duration_weeks=12,
            desired_start_date='2026-02-01',
        )
        self.enquiry.interested_subjects.set([self.subject])

    def test_generates_invoice_and_moves_stage(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(f'/api/enquiries/{self.enquiry.id}/generate-invoice/')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['enquiry'], self.enquiry.id)
        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.stage, EnquiryStage.INVOICED)

    def test_missing_duration_weeks_rejected(self):
        self.enquiry.duration_weeks = None
        self.enquiry.save()
        self.client.force_authenticate(self.admin)
        resp = self.client.post(f'/api/enquiries/{self.enquiry.id}/generate-invoice/')
        self.assertEqual(resp.status_code, 400)

    def test_missing_desired_start_date_rejected(self):
        # Regression guard: enroll_student needs this for the Enrollment it
        # creates on first payment - generate-invoice is the last checkpoint
        # to catch a missing one before it becomes an unhandled 500 later.
        self.enquiry.desired_start_date = None
        self.enquiry.save()
        self.client.force_authenticate(self.admin)
        resp = self.client.post(f'/api/enquiries/{self.enquiry.id}/generate-invoice/')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('desired_start_date', resp.data)

    def test_no_interested_subjects_rejected(self):
        self.enquiry.interested_subjects.clear()
        self.client.force_authenticate(self.admin)
        resp = self.client.post(f'/api/enquiries/{self.enquiry.id}/generate-invoice/')
        self.assertEqual(resp.status_code, 400)
