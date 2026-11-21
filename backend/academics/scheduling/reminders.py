"""End-of-day reminder to each tutor about sessions they have not logged
yet while they still can."""

from datetime import time, timedelta

from core.models import Notification
from core.services import notify

from academics.models import Session, SessionStatus

from . import messages, state, times


def unlogged_by_tutor(moment=None):
    """{TutorProfile: [sessions]} for every SCHEDULED session that has
    ended and is still inside its 24 hour log window, sorted by time."""
    moment = moment or times.now()
    # The window is 24 hours, so only today's and yesterday's sessions
    # can still be unlogged.
    candidates = (
        Session.objects.filter(
            status=SessionStatus.SCHEDULED,
            date__gte=moment.date() - timedelta(days=1),
            date__lte=moment.date(),
        )
        .select_related('student_subject__tutor__user')
        .order_by('date', 'start_time')
    )
    grouped = {}
    for session in candidates:
        if state.is_unlogged(session, moment):
            grouped.setdefault(session.student_subject.tutor, []).append(session)
    return grouped


def remind_unlogged_sessions(moment=None):
    """Sends each tutor one notification listing their unlogged sessions.
    Safe to run more than once a day: a tutor who already has today's
    identical reminder is skipped. Returns how many tutors were reminded."""
    moment = moment or times.now()
    day_start = times.at(moment.date(), time(0, 0))
    sent = 0
    for tutor, sessions in unlogged_by_tutor(moment).items():
        user = tutor.user
        if not user.is_active:
            continue
        message = messages.unlogged_reminder(sessions)
        already = Notification.objects.filter(recipient=user, message=message, created_at__gte=day_start).exists()
        if already:
            continue
        notify([user], message, messages.TUTOR_DASHBOARD_LINK)
        sent += 1
    return sent
