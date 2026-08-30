from decimal import Decimal

from django.db import transaction

from .models import InvoiceStatus, Payment

# Placeholder fee calculator. The real tiered-rate + duration-discount table
# is specced separately (see onboarding_apps_handover.md, "Explicitly out of
# scope") and should replace this — kept here so invoice generation has
# something real to call rather than leaving the endpoint stubbed out.
# One TimetableSlot per Subject means one session/week per interested
# subject, so sessions/week == subject_count.
SUBJECT_RATE_TIERS = {
    1: Decimal('25.00'),
    2: Decimal('22.00'),
    3: Decimal('20.00'),
}
DEFAULT_SUBJECT_RATE = Decimal('18.00')  # 4+ subjects

# (minimum duration_weeks, discount fraction), checked longest-first.
DURATION_DISCOUNTS = [
    (12, Decimal('0.10')),
    (8, Decimal('0.05')),
]


def calculate_fee(subject_count, duration_weeks):
    """Per-session rate by subject-count tier, times sessions/week, times
    duration_weeks, with a duration discount applied. Placeholder — see
    module docstring."""
    if subject_count <= 0 or duration_weeks <= 0:
        return Decimal('0.00')

    rate = SUBJECT_RATE_TIERS.get(subject_count, DEFAULT_SUBJECT_RATE)
    total = rate * subject_count * duration_weeks

    discount = Decimal('0')
    for min_weeks, pct in DURATION_DISCOUNTS:
        if duration_weeks >= min_weeks:
            discount = pct
            break

    return (total * (Decimal('1') - discount)).quantize(Decimal('0.01'))


@transaction.atomic
def record_payment(invoice, amount, recorded_by):
    from enquiries.services import enroll_student

    Payment.objects.create(invoice=invoice, amount=amount, recorded_by=recorded_by)
    invoice.status = InvoiceStatus.PAID if invoice.balance_due <= 0 else InvoiceStatus.PARTIALLY_PAID
    invoice.save(update_fields=['status'])

    is_first_payment = invoice.payments.count() == 1
    if is_first_payment and invoice.enrollment is None:
        enroll_student(invoice, recorded_by)

    return invoice
