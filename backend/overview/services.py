"""The numbers behind the Owner dashboard. Read-only aggregates over the
other apps' tables - this app owns no data of its own.

Every function takes `today` rather than reading the clock, so the same
inputs always give the same answer and the tests can pin a date."""

from datetime import date, datetime, time
from decimal import Decimal

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone

from academics.models import Subject
from accounts.models import TutorProfile
from billing.models import Invoice, Payment
from clients.models import Student
from enquiries.models import Enquiry, EnquiryStage
from enrollments.models import Enrollment, EnrollmentStatus

PERIODS = ('this_month', 'last_month', 'this_year')
DEFAULT_PERIOD = 'this_month'
TREND_MONTHS = 6
ZERO = Decimal('0.00')


def _add_months(first_of_month, months):
    index = first_of_month.year * 12 + (first_of_month.month - 1) + months
    return date(index // 12, index % 12 + 1, 1)


def period_bounds(period, today):
    """[start, end) as calendar dates - `end` is the first day after."""
    this_month = today.replace(day=1)
    if period == 'this_month':
        return this_month, _add_months(this_month, 1)
    if period == 'last_month':
        return _add_months(this_month, -1), this_month
    if period == 'this_year':
        return date(today.year, 1, 1), date(today.year + 1, 1, 1)
    raise ValueError(f'Unknown period: {period}')


def _midnight(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def company_counts():
    return {
        # Distinct students with an active enrollment - not every Student
        # row ever created, which also holds everyone who has since left.
        'active_students': Student.objects.filter(enrollments__status=EnrollmentStatus.ACTIVE).distinct().count(),
        'tutors': TutorProfile.objects.filter(user__is_active=True).count(),
        'active_subjects': Subject.objects.filter(is_active=True).count(),
        'open_enquiries': Enquiry.objects.exclude(stage=EnquiryStage.ENROLLED).count(),
    }


def money(start, end, today):
    """`invoiced` and `collected` are what happened inside [start, end).
    `outstanding` and `overdue` are where things stand today, whatever the
    period - money still owed doesn't stop being owed when the month
    turns."""
    window = (_midnight(start), _midnight(end))
    invoiced = Invoice.objects.filter(created_at__gte=window[0], created_at__lt=window[1]).aggregate(
        total=Coalesce(Sum('total'), ZERO)
    )['total']
    collected = Payment.objects.filter(paid_at__gte=window[0], paid_at__lt=window[1]).aggregate(
        total=Coalesce(Sum('amount'), ZERO)
    )['total']

    owing = Invoice.objects.annotate(balance=F('total') - Coalesce(Sum('payments__amount'), ZERO)).filter(
        balance__gt=0
    )
    outstanding = sum((invoice.balance for invoice in owing), ZERO)
    overdue = [invoice.balance for invoice in owing if invoice.due_date < today]

    return {
        'invoiced': invoiced,
        'collected': collected,
        'outstanding': outstanding,
        'overdue_amount': sum(overdue, ZERO),
        'overdue_count': len(overdue),
    }


def enrollment_trend(today, months=TREND_MONTHS):
    """One row per calendar month, oldest first, ending with the current
    month; months with nothing still appear, as zeroes."""
    first = _add_months(today.replace(day=1), -(months - 1))
    end = _add_months(today.replace(day=1), 1)

    enrolled = {
        row['month'].date(): row['n']
        for row in Enrollment.objects.filter(created_at__gte=_midnight(first), created_at__lt=_midnight(end))
        .annotate(month=TruncMonth('created_at'))
        .values('month')
        .annotate(n=Count('id'))
    }
    withdrawn = {
        row['month']: row['n']
        for row in Enrollment.objects.filter(withdrawn_at__gte=first, withdrawn_at__lt=end)
        .annotate(month=TruncMonth('withdrawn_at'))
        .values('month')
        .annotate(n=Count('id'))
    }

    rows = []
    for offset in range(months):
        month = _add_months(first, offset)
        rows.append(
            {
                'month': month.strftime('%Y-%m'),
                'enrolled': enrolled.get(month, 0),
                'withdrawn': withdrawn.get(month, 0),
            }
        )
    return rows


def onboarding_funnel():
    """Where every enquiry stands right now, in pipeline order, plus the
    share of all enquiries that have ended in an enrollment."""
    by_stage = dict(Enquiry.objects.values_list('stage').annotate(n=Count('id')))
    stages = [
        {'stage': stage.value, 'label': stage.label, 'count': by_stage.get(stage.value, 0)}
        for stage in EnquiryStage
    ]
    total = sum(row['count'] for row in stages)
    enrolled = by_stage.get(EnquiryStage.ENROLLED.value, 0)
    return {
        'stages': stages,
        'total': total,
        'enrolled': enrolled,
        # None, not 0, with no enquiries: there is nothing to convert yet.
        'conversion_rate': round(enrolled / total, 4) if total else None,
    }


def build_overview(period=DEFAULT_PERIOD, today=None):
    today = today or timezone.localdate()
    start, end = period_bounds(period, today)
    return {
        'period': {'key': period, 'start': start, 'end': end},
        'counts': company_counts(),
        'money': money(start, end, today),
        'enrollment_trend': enrollment_trend(today),
        'funnel': onboarding_funnel(),
    }
