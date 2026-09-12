from datetime import date
from decimal import Decimal

from rest_framework.test import APITestCase

from accounts.models import Role, User
from billing.models import Invoice, InvoiceStatus
from billing.services import record_payment
from clients.models import Parent
from enquiries.models import Enquiry, EnquiryStage
from enrollments.models import LearningMode


def make_user(role, email=None, **kwargs):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(
        email=email, full_name=kwargs.pop('full_name', role.title()), role=role, **kwargs
    )


def make_enquiry():
    parent = Parent.objects.create(full_name='Jane Doe', phone='0999')
    return Enquiry.objects.create(
        parent=parent,
        student_name='Jimmy',
        student_grade='7',
        duration_weeks=12,
        learning_mode=LearningMode.IN_PERSON,
        desired_start_date=date(2026, 2, 1),
    )


class RecordPaymentViewTests(APITestCase):
    def setUp(self):
        self.admin = make_user(Role.ADMIN)
        self.enquiry = make_enquiry()
        self.invoice = Invoice.objects.create(
            enquiry=self.enquiry, total=Decimal('500.00'), due_date=date(2026, 2, 15)
        )

    def test_first_payment_triggers_enrollment_and_returns_updated_invoice(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(
            f'/api/invoices/{self.invoice.id}/record-payment/', {'amount': '100.00'}, format='json'
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIsNotNone(resp.data['enrollment'])
        self.assertEqual(resp.data['status'], InvoiceStatus.PARTIALLY_PAID)
        self.assertEqual(len(resp.data['payments']), 1)

        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.stage, EnquiryStage.ENROLLED)

    def test_full_payment_marks_paid(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(
            f'/api/invoices/{self.invoice.id}/record-payment/', {'amount': '500.00'}, format='json'
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['status'], InvoiceStatus.PAID)
        self.assertEqual(resp.data['balance_due'], '0.00')

    def test_negative_amount_rejected(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(
            f'/api/invoices/{self.invoice.id}/record-payment/', {'amount': '-10.00'}, format='json'
        )
        self.assertEqual(resp.status_code, 400)

    def test_amount_exceeding_balance_due_rejected(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(
            f'/api/invoices/{self.invoice.id}/record-payment/', {'amount': '500.01'}, format='json'
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('amount', resp.data)
        self.assertEqual(self.invoice.payments.count(), 0)

    def test_partial_then_overpaying_the_remaining_balance_rejected(self):
        self.client.force_authenticate(self.admin)
        self.client.post(f'/api/invoices/{self.invoice.id}/record-payment/', {'amount': '400.00'}, format='json')

        resp = self.client.post(
            f'/api/invoices/{self.invoice.id}/record-payment/', {'amount': '100.01'}, format='json'
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('amount', resp.data)
        self.assertEqual(self.invoice.payments.count(), 1)

    def test_payment_against_an_already_fully_paid_invoice_rejected(self):
        self.client.force_authenticate(self.admin)
        self.client.post(f'/api/invoices/{self.invoice.id}/record-payment/', {'amount': '500.00'}, format='json')

        resp = self.client.post(
            f'/api/invoices/{self.invoice.id}/record-payment/', {'amount': '50.00'}, format='json'
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('amount', resp.data)
        self.assertEqual(self.invoice.payments.count(), 1)

    def test_missing_desired_start_date_rejected_instead_of_crashing(self):
        # desired_start_date could be cleared via PATCH /enquiries/{id}/
        # after the invoice was generated - this must 400, not 500.
        self.enquiry.desired_start_date = None
        self.enquiry.save()
        self.client.force_authenticate(self.admin)
        resp = self.client.post(
            f'/api/invoices/{self.invoice.id}/record-payment/', {'amount': '100.00'}, format='json'
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('detail', resp.data)

    def test_tutor_forbidden(self):
        tutor = make_user(Role.TUTOR)
        self.client.force_authenticate(tutor)
        resp = self.client.post(
            f'/api/invoices/{self.invoice.id}/record-payment/', {'amount': '100.00'}, format='json'
        )
        self.assertEqual(resp.status_code, 403)


class InvoiceListViewTests(APITestCase):
    def setUp(self):
        self.admin = make_user(Role.ADMIN)
        # balance_due is derived from actual Payment rows, never from
        # `status` directly - record a real payment covering the full
        # total so this invoice is genuinely, not just nominally, paid.
        self.paid_invoice = Invoice.objects.create(
            enquiry=make_enquiry(), total=Decimal('100.00'), due_date=date(2026, 2, 15)
        )
        record_payment(self.paid_invoice, Decimal('100.00'), self.admin)

        self.outstanding_invoice = Invoice.objects.create(
            enquiry=make_enquiry(), total=Decimal('300.00'), due_date=date(2026, 2, 15)
        )

    def test_balance_due_filter_returns_only_outstanding(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get('/api/invoices/?balance_due__gt=0')
        self.assertEqual(resp.status_code, 200)
        ids = {row['id'] for row in resp.data['results']}
        self.assertEqual(ids, {self.outstanding_invoice.id})

    def test_unfiltered_returns_all(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get('/api/invoices/')
        self.assertEqual(resp.data['count'], 2)

    def test_filter_by_enquiry(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(f'/api/invoices/?enquiry={self.outstanding_invoice.enquiry_id}')
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['id'], self.outstanding_invoice.id)
