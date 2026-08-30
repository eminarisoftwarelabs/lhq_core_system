from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from academics.models import Subject
from accounts.models import Role, User
from billing.models import Invoice, InvoiceStatus
from billing.services import record_payment
from clients.models import Guardianship, Parent
from enquiries.models import Enquiry, EnquiryStage, EnquiryStageChange
from enquiries.services import change_stage, create_enquiry, enroll_student, generate_invoice
from enrollments.models import EnrollmentStatus, LearningMode


def make_staff(email='staff@lhq.test'):
    return User.objects.create_user(email=email, full_name='Staff Member', role=Role.ADMIN)


class CreateEnquiryTests(TestCase):
    def test_creates_parent_and_enquiry_with_initial_stage_history(self):
        staff = make_staff()
        maths = Subject.objects.create(name='Maths')

        enquiry = create_enquiry(
            parent_data={'full_name': 'Jane Doe', 'phone': '0999111222'},
            student_name='Jimmy Doe',
            student_grade='7',
            subject_ids=[maths.id],
            duration_weeks=12,
            learning_mode=LearningMode.IN_PERSON,
            desired_start_date=date(2026, 2, 1),
            created_by=staff,
        )

        self.assertEqual(enquiry.parent.full_name, 'Jane Doe')
        self.assertEqual(enquiry.stage, EnquiryStage.INITIAL_CALL)
        self.assertIn(maths, enquiry.interested_subjects.all())
        history = list(enquiry.stage_history.all())
        self.assertEqual(len(history), 1)
        self.assertIsNone(history[0].from_stage)
        self.assertEqual(history[0].to_stage, EnquiryStage.INITIAL_CALL)


class ChangeStageTests(TestCase):
    def setUp(self):
        self.staff = make_staff()
        parent = Parent.objects.create(full_name='Jane Doe', phone='0999')
        self.enquiry = Enquiry.objects.create(parent=parent, student_name='Jimmy', student_grade='7')

    def test_records_history_and_updates_stage(self):
        change_stage(self.enquiry, EnquiryStage.MEETING_SET, self.staff, note='Called back')

        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.stage, EnquiryStage.MEETING_SET)
        change = self.enquiry.stage_history.latest('changed_at')
        self.assertEqual(change.from_stage, EnquiryStage.INITIAL_CALL)
        self.assertEqual(change.to_stage, EnquiryStage.MEETING_SET)
        self.assertEqual(change.note, 'Called back')


class GenerateInvoiceTests(TestCase):
    def setUp(self):
        self.staff = make_staff()
        parent = Parent.objects.create(full_name='Jane Doe', phone='0999')
        self.enquiry = Enquiry.objects.create(
            parent=parent, student_name='Jimmy', student_grade='7', duration_weeks=12
        )
        self.enquiry.interested_subjects.set([Subject.objects.create(name='Maths')])

    def test_creates_invoice_and_moves_to_invoiced(self):
        invoice = generate_invoice(self.enquiry, self.staff)

        self.assertEqual(invoice.enquiry, self.enquiry)
        self.assertGreater(invoice.total, 0)
        self.assertEqual(invoice.status, InvoiceStatus.SENT)
        self.assertEqual(invoice.due_date, timezone.now().date() + timedelta(days=14))
        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.stage, EnquiryStage.INVOICED)


class EnrollStudentTests(TestCase):
    def setUp(self):
        self.staff = make_staff()
        self.parent = Parent.objects.create(full_name='Jane Doe', phone='0999')
        self.subject = Subject.objects.create(name='Maths')
        self.enquiry = Enquiry.objects.create(
            parent=self.parent,
            student_name='Jimmy Doe',
            student_grade='7',
            duration_weeks=12,
            learning_mode=LearningMode.IN_PERSON,
            desired_start_date=date(2026, 2, 1),
        )
        self.enquiry.interested_subjects.set([self.subject])
        self.invoice = Invoice.objects.create(
            enquiry=self.enquiry, total=Decimal('500.00'), due_date=date(2026, 2, 15)
        )

    def test_first_payment_creates_student_guardianship_and_enrollment(self):
        record_payment(self.invoice, Decimal('100.00'), self.staff)

        self.invoice.refresh_from_db()
        self.enquiry.refresh_from_db()

        self.assertIsNotNone(self.invoice.enrollment)
        enrollment = self.invoice.enrollment
        self.assertEqual(enrollment.student.full_name, 'Jimmy Doe')
        self.assertEqual(enrollment.status, EnrollmentStatus.ACTIVE)
        self.assertIn(self.subject, enrollment.subjects.all())

        guardianship = enrollment.student.guardianships.get()
        self.assertEqual(guardianship.parent, self.parent)
        self.assertTrue(guardianship.is_primary_contact)
        # Regression guard: the enquiry never captures how the parent
        # relates to the student, so this must not be left as an empty,
        # not-a-valid-choice string.
        self.assertIn(guardianship.relationship, Guardianship.Relationship.values)

        self.assertEqual(self.enquiry.stage, EnquiryStage.ENROLLED)
        self.assertEqual(self.enquiry.enrollment, enrollment)

    def test_enrollment_happens_on_first_payment_even_if_balance_remains(self):
        record_payment(self.invoice, Decimal('100.00'), self.staff)
        self.invoice.refresh_from_db()
        self.assertGreater(self.invoice.balance_due, 0)
        self.assertIsNotNone(self.invoice.enrollment)
        self.assertEqual(self.invoice.status, InvoiceStatus.PARTIALLY_PAID)

    def test_second_payment_does_not_re_enroll(self):
        record_payment(self.invoice, Decimal('100.00'), self.staff)
        first_enrollment_id = Invoice.objects.get(pk=self.invoice.pk).enrollment_id

        record_payment(self.invoice, Decimal('400.00'), self.staff)
        self.invoice.refresh_from_db()

        self.assertEqual(self.invoice.enrollment_id, first_enrollment_id)
        self.assertEqual(self.invoice.status, InvoiceStatus.PAID)

    def test_enroll_student_called_directly_is_idempotent_guard_not_needed_twice(self):
        # enroll_student itself doesn't guard re-entry - record_payment is
        # the only caller and it guards via `invoice.enrollment is None`.
        enrollment = enroll_student(self.invoice, self.staff)
        self.assertEqual(enrollment.student.student_number, 'STU-000001')
