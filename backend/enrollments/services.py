from datetime import timedelta

from django.utils import timezone

from .models import EnrollmentStatus


def compute_end_date(start_date, duration_weeks):
    if start_date is None or not duration_weeks:
        return None
    return start_date + timedelta(weeks=duration_weeks)


def withdraw(enrollment, reason=''):
    enrollment.status = EnrollmentStatus.WITHDRAWN
    enrollment.withdrawn_at = timezone.now().date()
    enrollment.withdrawal_reason = reason
    enrollment.save()
    return enrollment
