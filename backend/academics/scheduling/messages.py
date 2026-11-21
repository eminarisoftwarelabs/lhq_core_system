"""Notification texts for the timetable. Each is built only from bounded
pieces (short dates, HH:MM times, names cut to 60 characters), so every
message fits the 255 character limit by design. Long free text such as a
rejection reason is never put in a notification; the link opens the page
that shows it in full."""

from . import times
from .clashes import tutor_name

STAFF_SESSION_REQUESTS_LINK = '/timetable/requests'
TUTOR_TIMETABLE_LINK = '/timetable'
TUTOR_DASHBOARD_LINK = '/'

# At most this many session times are listed in a reminder.
REMINDER_LIST_LIMIT = 4


def when(session):
    return f'{times.fmt_date(session.date)} {times.fmt_time(session.start_time)}'


def _verb(kind):
    return 'move' if kind == 'MOVE' else 'cancel'


def change_requested(tutor, session, kind):
    return f'{tutor_name(tutor)} asked to {_verb(kind)} the {when(session)} session.'


def change_approved(session, kind):
    return f'Your request to {_verb(kind)} the {when(session)} session was approved.'


def change_rejected(session, kind):
    return (
        f'Your request to {_verb(kind)} the {when(session)} session was not approved. '
        'Open My Timetable for the reason.'
    )


def session_moved(original, new):
    return f'Your {when(original)} session was moved to {when(new)}.'


def session_cancelled(session):
    return f'Your {when(session)} session was cancelled.'


def unlogged_reminder(sessions):
    """`sessions` sorted by date and time."""
    count = len(sessions)
    shown = [when(s) for s in sessions[:REMINDER_LIST_LIMIT]]
    listed = ', '.join(shown)
    if count > REMINDER_LIST_LIMIT:
        listed += f' and {count - REMINDER_LIST_LIMIT} more'
    noun = 'session' if count == 1 else 'sessions'
    return (
        f'You have {count} unlogged {noun}: {listed}. '
        'Log each within 24 hours of its end.'
    )
