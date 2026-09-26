from datetime import date, datetime, timezone as dt_timezone
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


class InvoiceListIssuedDateFilterTests(APITestCase):
    """?issued_from / ?issued_to filter on created_at (the issue date).
    issued_from is inclusive, issued_to exclusive, so a client can send two
    local midnights for "this month" without an off-by-one at either end."""

    def setUp(self):
        self.admin = make_user(Role.ADMIN)
        self.july = self._invoice_issued_at(datetime(2026, 7, 31, 21, 59, tzinfo=dt_timezone.utc))
        self.aug_start = self._invoice_issued_at(datetime(2026, 7, 31, 22, 0, tzinfo=dt_timezone.utc))
        self.aug_end = self._invoice_issued_at(datetime(2026, 8, 31, 21, 59, tzinfo=dt_timezone.utc))
        self.september = self._invoice_issued_at(datetime(2026, 8, 31, 22, 0, tzinfo=dt_timezone.utc))
        self.client.force_authenticate(self.admin)

    def _invoice_issued_at(self, moment):
        invoice = Invoice.objects.create(enquiry=make_enquiry(), total=Decimal('100.00'), due_date=date(2026, 9, 30))
        # created_at is auto_now_add, so it can only be backdated via update().
        Invoice.objects.filter(pk=invoice.pk).update(created_at=moment)
        return invoice

    def _ids(self, query):
        resp = self.client.get(f'/api/invoices/?{query}')
        self.assertEqual(resp.status_code, 200, resp.data)
        return {row['id'] for row in resp.data['results']}

    def test_local_month_window_with_offset_is_exact_at_both_edges(self):
        # August in Malawi (UTC+2): Aug 1 00:00 +02:00 up to Sep 1 00:00 +02:00.
        ids = self._ids('issued_from=2026-08-01T00:00:00%2B02:00&issued_to=2026-09-01T00:00:00%2B02:00')
        self.assertEqual(ids, {self.aug_start.id, self.aug_end.id})

    def test_utc_z_timestamps_are_accepted(self):
        ids = self._ids('issued_from=2026-07-31T22:00:00Z&issued_to=2026-08-31T22:00:00Z')
        self.assertEqual(ids, {self.aug_start.id, self.aug_end.id})

    def test_open_ended_from(self):
        ids = self._ids('issued_from=2026-08-31T22:00:00Z')
        self.assertEqual(ids, {self.september.id})

    def test_open_ended_to(self):
        ids = self._ids('issued_to=2026-07-31T22:00:00Z')
        self.assertEqual(ids, {self.july.id})

    def test_combines_with_outstanding_filter(self):
        record_payment(self.aug_end, Decimal('100.00'), self.admin)
        ids = self._ids('balance_due__gt=0&issued_from=2026-07-31T22:00:00Z&issued_to=2026-08-31T22:00:00Z')
        self.assertEqual(ids, {self.aug_start.id})

    def test_count_reflects_the_filtered_set(self):
        resp = self.client.get('/api/invoices/?issued_from=2026-07-31T22:00:00Z')
        self.assertEqual(resp.data['count'], 3)

    def test_malformed_value_is_a_400_not_a_500(self):
        resp = self.client.get('/api/invoices/?issued_from=last-month')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('issued_from', resp.data)

    def test_from_after_to_is_rejected(self):
        resp = self.client.get('/api/invoices/?issued_from=2026-09-01T00:00:00Z&issued_to=2026-08-01T00:00:00Z')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('issued_to', resp.data)

    def test_blank_values_are_ignored(self):
        resp = self.client.get('/api/invoices/?issued_from=&issued_to=')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 4)
