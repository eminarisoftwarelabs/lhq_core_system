from decimal import Decimal

from django.db import transaction

from .models import InvoiceStatus, Payment

# LHQ runs a fixed weekly timetable of 5 sessions/week regardless of subject
# count - subject count only selects which per-session rate tier applies
# (more subjects sharing the same weekly slots costs less per session).
# Longer commitments earn a duration discount.
SESSIONS_PER_WEEK = 5


def _rate_for_subjects(num_subjects: int) -> Decimal:
    if num_subjects == 1:
        return Decimal('25000')
    elif num_subjects <= 3:
        return Decimal('20000')
    return Decimal('15000')


def _discount_for_duration(duration_weeks: int) -> Decimal:
    if duration_weeks <= 3:
        return Decimal('0')
    elif duration_weeks == 4:
        return Decimal('0.10')
    return Decimal('0.20')


def calculate_fee(num_subjects: int, duration_weeks: int) -> Decimal:
    """Per-session rate by subject-count tier, times a fixed 5
    sessions/week, times duration_weeks, less a duration discount.

    Pure function - no request or database access - so the full tier x
    discount matrix is unit tested directly against it. Always use Decimal
    for the inputs/output here, never float: this feeds straight into
    Invoice.total, a DecimalField, and float would introduce rounding drift.
    """
    rate = _rate_for_subjects(num_subjects)
    discount = _discount_for_duration(duration_weeks)
    total = rate * SESSIONS_PER_WEEK * duration_weeks * (Decimal('1') - discount)
    return total.quantize(Decimal('0.01'))


def invoice_line_items(num_subjects: int, duration_weeks: int) -> list[dict]:
    """The visible breakdown behind calculate_fee()'s total, for display on
    the invoice and its PDF/print view. The discount line is computed as
    (subtotal - calculate_fee(...)) rather than independently re-applying
    the discount fraction, so the line items always sum to exactly the
    invoice total even after quantization."""
    rate = _rate_for_subjects(num_subjects)
    subtotal = (rate * SESSIONS_PER_WEEK * duration_weeks).quantize(Decimal('0.01'))
    total = calculate_fee(num_subjects, duration_weeks)

    items = [
        {
            'description': (
                f'Tuition — {num_subjects} subject{"s" if num_subjects != 1 else ""}, '
                f'{SESSIONS_PER_WEEK} sessions/week × {duration_weeks} '
                f'week{"s" if duration_weeks != 1 else ""} @ {rate:,.2f}/session'
            ),
            'amount': subtotal,
        }
    ]
    discount_amount = subtotal - total
    if discount_amount:
        pct = _discount_for_duration(duration_weeks) * 100
        items.append({'description': f'Duration discount ({pct:.0f}%)', 'amount': -discount_amount})
    return items


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
