"""Logging a session as Held or Not held, and planning its topics.

The tutor's rules: only their own session, only once it has started,
only while it is still SCHEDULED, and only until 24 hours after its end.
After that the session counts as Not held (missed log) and only staff
can log it. Staff can log or correct any session at any time, with a
note, and every log and correction is recorded in SessionLogEvent."""

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction

from academics.models import Session, SessionAction, SessionLogEvent, SessionStatus

from . import generation, state, times

WINDOW_CLOSED = 'The logging window closed 24 hours after the session. Ask admin to log it.'
NOT_STARTED = 'You can log this session once it has started.'
ALREADY_LOGGED = 'This session is already logged. Ask admin to correct it.'
CANCELLED = 'A cancelled session cannot be logged.'
NOT_YOURS = 'You can only log your own sessions.'


def is_own(session, user):
    profile = getattr(user, 'tutor_profile', None)
    return profile is not None and session.student_subject.tutor_id == profile.pk


def tutor_refusal(session, user, moment=None):
    """Why `user` may not log `session` as its tutor right now, or None if
    they may."""
    moment = moment or times.now()
    if not is_own(session, user):
        return NOT_YOURS
    if session.status == SessionStatus.CANCELLED:
        return CANCELLED
    if session.status != SessionStatus.SCHEDULED:
        return ALREADY_LOGGED
    if not state.has_started(session, moment):
        return NOT_STARTED
    if state.is_locked(session, moment):
        return WINDOW_CLOSED
    return None


def can_log(session, user, moment=None):
    """Whether the Held / Not held buttons should be offered to `user`."""
    if session.status == SessionStatus.CANCELLED:
        return False
    if user.is_staff_level:
        return True
    return tutor_refusal(session, user, moment) is None


def _topics_for(session, topic_ids):
    if topic_ids is None:
        return []
    if not isinstance(topic_ids, list) or any(not isinstance(i, int) or isinstance(i, bool) for i in topic_ids):
        raise ValidationError({'topic_ids': ['Must be a list of topic ids.']})
    allowed = session.student_subject.topics.filter(pk__in=topic_ids)
    if allowed.count() != len(set(topic_ids)):
        raise ValidationError({'topic_ids': ["Every topic must be one of this student's topics for the subject."]})
    return list(allowed)


@transaction.atomic
def log_session(session, actor, held, reason='', topic_ids=None, admin_note=''):
    """Marks the session HELD or NOT_HELD. Returns the session.

    The row is locked first (select_for_update), so two submits at the
    same moment run one after the other and the second is judged against
    the first's result (for a tutor: "already logged")."""
    session = (
        Session.objects.select_for_update()
        .select_related('student_subject__tutor__user')
        .get(pk=session.pk)
    )
    moment = times.now()
    reason = (reason or '').strip()
    admin_note = (admin_note or '').strip()

    refusal = tutor_refusal(session, actor, moment)
    as_tutor = refusal is None
    if not as_tutor:
        if not actor.is_staff_level:
            if refusal == NOT_YOURS:
                raise PermissionDenied(NOT_YOURS)
            raise ValidationError({'detail': [refusal]})
        if session.status == SessionStatus.CANCELLED:
            raise ValidationError({'detail': [CANCELLED]})
        if not admin_note:
            raise ValidationError({'admin_note': ['Add a note saying why admin is logging or correcting this session.']})

    if not isinstance(held, bool):
        raise ValidationError({'held': ['Must be true (held) or false (not held).']})
    if not held and not reason:
        raise ValidationError({'reason': ['Say why the session did not happen.']})
    topics = _topics_for(session, topic_ids) if held else []

    previous = session.status
    session.status = SessionStatus.HELD if held else SessionStatus.NOT_HELD
    session.not_held_reason = '' if held else reason
    session.logged_by = actor
    session.logged_at = moment
    if not as_tutor:
        session.admin_note = admin_note
    session.save(update_fields=['status', 'not_held_reason', 'logged_by', 'logged_at', 'admin_note'])
    session.topics_covered.set(topics)

    SessionLogEvent.objects.create(
        session=session,
        action=SessionAction.LOG if previous == SessionStatus.SCHEDULED else SessionAction.CORRECT,
        actor=actor,
        from_status=previous,
        to_status=session.status,
        note=admin_note if not as_tutor else reason,
    )
    from .changes import cancel_pending_requests

    cancel_pending_requests(session)
    # A Not held session frees a place in the plan (one more at the end);
    # a correction to Held may remove one.
    generation.regenerate(session.student_subject)
    return session


@transaction.atomic
def set_plan(session, actor, topic_ids):
    """Replaces the session's planned topics. The session's tutor or staff,
    and only while the session is still SCHEDULED."""
    session = Session.objects.select_for_update().select_related('student_subject').get(pk=session.pk)
    if not (actor.is_staff_level or is_own(session, actor)):
        raise PermissionDenied('You can only plan your own sessions.')
    if session.status != SessionStatus.SCHEDULED:
        raise ValidationError({'detail': ['Only a scheduled session can be planned.']})
    session.planned_topics.set(_topics_for(session, topic_ids))
    return session
