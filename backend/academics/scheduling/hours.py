"""A tutor's held hours for a month, and what that would pay."""

from decimal import ROUND_HALF_UP, Decimal

from academics.models import Session, SessionStatus

from . import times


def tutor_hours(tutor, month_first):
    """Held sessions in the month starting at `month_first`, their total
    time, and an estimated amount at the tutor's hourly_rate. The amount
    is an estimate: per-subject rates are not built, and it is None when
    the tutor has no rate set."""
    first, last = times.month_bounds(month_first)
    held = list(
        Session.objects.filter(
            student_subject__tutor=tutor, status=SessionStatus.HELD, date__gte=first, date__lte=last
        )
        .select_related('student_subject__student', 'student_subject__subject__level')
        .order_by('date', 'start_time')
    )
    minutes = sum(times.minutes_between(s.start_time, s.end_time) for s in held)
    hours = (Decimal(minutes) / Decimal(60)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    rate = Decimal(str(tutor.hourly_rate)) if tutor.hourly_rate is not None else None
    estimate = None
    if rate is not None:
        estimate = (Decimal(minutes) * rate / Decimal(60)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return {
        'month': first.strftime('%Y-%m'),
        'sessions_held': len(held),
        'minutes': minutes,
        'hours': hours,
        'hourly_rate': rate,
        'estimated_amount': estimate,
        'is_estimate': True,
        'sessions': [
            {
                'id': s.pk,
                'date': s.date,
                'start_time': times.fmt_time(s.start_time),
                'end_time': times.fmt_time(s.end_time),
                'minutes': times.minutes_between(s.start_time, s.end_time),
                'student_name': s.student_subject.student.full_name,
                'subject_name': s.student_subject.subject.display_name,
            }
            for s in held
        ],
    }
