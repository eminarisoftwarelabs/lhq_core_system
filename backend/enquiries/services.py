from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from academics.models import Subject
from clients.models import Guardianship, Parent, Student
from clients.services import generate_student_number
from enrollments.models import Enrollment
from enrollments.services import compute_end_date

from .models import Enquiry, EnquiryStage, EnquiryStageChange

DEFAULT_INVOICE_DUE_DAYS = 14


@transaction.atomic
def create_enquiry(
    parent_data,
    student_name,
    student_grade,
    subject_ids,
    duration_weeks,
    learning_mode,
    desired_start_date,
    created_by,
):
    parent = Parent.objects.create(**parent_data)
    enquiry = Enquiry.objects.create(
        parent=parent,
        student_name=student_name,
        student_grade=student_grade,
        duration_weeks=duration_weeks,
        learning_mode=learning_mode,
        desired_start_date=desired_start_date,
        created_by=created_by,
    )
    enquiry.interested_subjects.set(Subject.objects.filter(id__in=subject_ids))
    EnquiryStageChange.objects.create(
        enquiry=enquiry, from_stage=None, to_stage=EnquiryStage.INITIAL_CALL, changed_by=created_by
    )
    return enquiry


@transaction.atomic
def change_stage(enquiry, new_stage, changed_by, note=''):
    EnquiryStageChange.objects.create(
        enquiry=enquiry, from_stage=enquiry.stage, to_stage=new_stage, changed_by=changed_by, note=note,
    )
    enquiry.stage = new_stage
    enquiry.save(update_fields=['stage', 'updated_at'])
    return enquiry


@transaction.atomic
def generate_invoice(enquiry, changed_by, note=''):
    """Assumes the caller (the view) has already validated that the enquiry
    has interested_subjects and a duration_weeks — see fee calculator's
    contract in billing.services.calculate_fee."""
    from billing.models import Invoice
    from billing.services import calculate_fee

    total = calculate_fee(enquiry.interested_subjects.count(), enquiry.duration_weeks)
    invoice = Invoice.objects.create(
        enquiry=enquiry,
        total=total,
        due_date=timezone.now().date() + timedelta(days=DEFAULT_INVOICE_DUE_DAYS),
    )
    change_stage(enquiry, EnquiryStage.INVOICED, changed_by, note)
    return invoice


@transaction.atomic
def enroll_student(invoice, changed_by):
    """Called only once, on the first payment against an invoice."""
    enquiry = invoice.enquiry

    student = Student.objects.create(
        student_number=generate_student_number(),
        full_name=enquiry.student_name,
        grade=enquiry.student_grade,
    )
    # The enquiry never captures how this parent relates to the student
    # (Enquiry has no such field, and the handover spec's own enroll_student
    # snippet omits it) - GUARDIAN is the generic catch-all choice, used
    # here rather than leaving an empty, not-a-valid-choice string in a
    # required TextChoices field. Staff can correct it via /admin/ once a
    # dedicated edit UI exists.
    Guardianship.objects.create(
        student=student,
        parent=enquiry.parent,
        relationship=Guardianship.Relationship.GUARDIAN,
        is_primary_contact=True,
    )

    enrollment = Enrollment.objects.create(
        student=student,
        start_date=enquiry.desired_start_date,
        end_date=compute_end_date(enquiry.desired_start_date, enquiry.duration_weeks),
        learning_mode=enquiry.learning_mode,
    )
    enrollment.subjects.set(enquiry.interested_subjects.all())

    invoice.enrollment = enrollment
    invoice.save(update_fields=['enrollment'])

    enquiry.enrollment = enrollment
    enquiry.save(update_fields=['enrollment', 'updated_at'])
    change_stage(enquiry, EnquiryStage.ENROLLED, changed_by)

    return enrollment
