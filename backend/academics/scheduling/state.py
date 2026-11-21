"""Derived session states. Only SCHEDULED, HELD, NOT_HELD and CANCELLED
are stored; the rest are worked out from the clock:

- UNLOGGED: SCHEDULED, ended, and still inside the 24 hour log window.
- MISSED:   SCHEDULED, and the window has closed. Counts as Not held (no
            pay, not used) until an admin logs it.
- MOVED:    CANCELLED because it was moved; a one-off session with
            moved_from pointing here holds the new time."""

from academics.models import SessionStatus

from . import times

UPCOMING = 'SCHEDULED'
UNLOGGED = 'UNLOGGED'
MISSED = 'MISSED'
MOVED = 'MOVED'

DISPLAY_STATUSES = [UPCOMING, UNLOGGED, MISSED, SessionStatus.HELD, SessionStatus.NOT_HELD, SessionStatus.CANCELLED, MOVED]


def is_locked(session, moment=None):
    """SCHEDULED with the tutor's log window closed."""
    moment = moment or times.now()
    return session.status == SessionStatus.SCHEDULED and moment > times.log_deadline(session)


def is_unlogged(session, moment=None):
    moment = moment or times.now()
    return (
        session.status == SessionStatus.SCHEDULED
        and times.session_end(session) <= moment <= times.log_deadline(session)
    )


def has_started(session, moment=None):
    return (moment or times.now()) >= times.session_start(session)


def counts_towards_plan(session, moment=None):
    """Whether this session uses up, or is still expected to use up, one of
    the student subject's planned sessions: Held, or Scheduled and still
    loggable. Not held, missed and cancelled sessions do not."""
    if session.status == SessionStatus.HELD:
        return True
    return session.status == SessionStatus.SCHEDULED and not is_locked(session, moment)


def display_status(session, moment=None, moved_away=None):
    """One of DISPLAY_STATUSES. `moved_away` says whether a later session
    has moved_from=this one; pass it when known to save a query."""
    moment = moment or times.now()
    if session.status == SessionStatus.CANCELLED:
        if moved_away is None:
            moved_away = session.moved_to.exists()
        return MOVED if moved_away else SessionStatus.CANCELLED
    if session.status != SessionStatus.SCHEDULED:
        return session.status
    if moment < times.session_end(session):
        return UPCOMING
    return MISSED if moment > times.log_deadline(session) else UNLOGGED
