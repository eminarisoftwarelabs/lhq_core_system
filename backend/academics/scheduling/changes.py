"""One-off changes to a single session: move it to another date and time,
or cancel it in advance.

Staff change a session directly (move_session, cancel_session). A tutor
asks (request_session_change) and nothing changes until staff approve;
approving runs the same direct change. A move cancels the original
occurrence and creates a one-off session at the new time with
moved_from set, after a clash check."""

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from academics.models import (
    Session,
    SessionAction,
    SessionChangeKind,
    SessionChangeRequest,
    SessionChangeStatus,
    SessionLogEvent,
    SessionStatus,
)
from core.services import notify

from . import clashes, generation, messages, state, times
from .session_log import is_own
from .student_subjects import parse_time, require_staff


def cancel_pending_requests(session, keep=None):
    """A session that was logged, moved or cancelled has nothing left to
    ask for: withdraw its pending request (except `keep`)."""
    qs = SessionChangeRequest.objects.filter(session=session, status=SessionChangeStatus.PENDING)
    if keep is not None:
        qs = qs.exclude(pk=keep.pk)
    return qs.update(status=SessionChangeStatus.CANCELLED)


def _lock(session):
    return (
        Session.objects.select_for_update()
        .select_related('student_subject__tutor__user', 'student_subject__student', 'student_subject__subject__level')
        .get(pk=session.pk)
    )


def _reason(reason, field='reason'):
    reason = (reason or '').strip()
    if not reason:
        raise ValidationError({field: ['Give a reason.']})
    return reason


def parse_new_time(new_date, new_start, new_end):
    if new_date is None:
        raise ValidationError({'new_date': ['Pick the new date.']})
    start = parse_time(new_start, 'new_start_time')
    end = parse_time(new_end, 'new_end_time')
    if start >= end:
        raise ValidationError({'new_end_time': ['Must be after the start time.']})
    return new_date, start, end


def _tutor_user(session):
    return session.student_subject.tutor.user


def _require_scheduled(session, verb):
    if session.status != SessionStatus.SCHEDULED:
        raise ValidationError({'detail': [f'Only a scheduled session can be {verb}.']})


# -- staff, directly ---------------------------------------------------------------------


@transaction.atomic
def move_session(session, actor, new_date, new_start, new_end, reason, allow_clash=False, keep_request=None, tell_tutor=True):
    """Returns (new session, warnings overridden)."""
    require_staff(actor)
    session = _lock(session)
    _require_scheduled(session, 'moved')
    reason = _reason(reason)
    new_date, start, end = parse_new_time(new_date, new_start, new_end)
    if (new_date, start, end) == (session.date, session.start_time, session.end_time):
        raise ValidationError({'new_date': ['That is the session\'s current time.']})
    ss = session.student_subject
    if Session.objects.filter(student_subject=ss, date=new_date, start_time=start).exclude(pk=session.pk).exists():
        raise ValidationError({'new_date': ['This student already has a session of this subject at that time.']})
    warnings = clashes.enforce(
        clashes.session_warnings(ss.tutor, new_date, start, end, exclude_session=session), allow_clash
    )

    session.status = SessionStatus.CANCELLED
    session.save(update_fields=['status'])
    new = Session.objects.create(
        student_subject=ss, slot=None, date=new_date, start_time=start, end_time=end, moved_from=session
    )
    new.planned_topics.set(session.planned_topics.all())
    SessionLogEvent.objects.create(
        session=session,
        action=SessionAction.MOVE,
        actor=actor,
        from_status=SessionStatus.SCHEDULED,
        to_status=SessionStatus.CANCELLED,
        note=f'Moved to {messages.when(new)}. {reason}',
    )
    SessionLogEvent.objects.create(
        session=new,
        action=SessionAction.MOVE,
        actor=actor,
        from_status=SessionStatus.SCHEDULED,
        to_status=SessionStatus.SCHEDULED,
        note=f'Moved from {messages.when(session)}. {reason}',
    )
    cancel_pending_requests(session, keep=keep_request)
    if tell_tutor and _tutor_user(session).pk != actor.pk:
        notify([_tutor_user(session)], messages.session_moved(session, new), messages.TUTOR_TIMETABLE_LINK)
    generation.regenerate(ss)
    return new, warnings


@transaction.atomic
def cancel_session(session, actor, reason, keep_request=None, tell_tutor=True):
    require_staff(actor)
    session = _lock(session)
    _require_scheduled(session, 'cancelled')
    reason = _reason(reason)
    session.status = SessionStatus.CANCELLED
    session.save(update_fields=['status'])
    SessionLogEvent.objects.create(
        session=session,
        action=SessionAction.CANCEL,
        actor=actor,
        from_status=SessionStatus.SCHEDULED,
        to_status=SessionStatus.CANCELLED,
        note=reason,
    )
    cancel_pending_requests(session, keep=keep_request)
    if tell_tutor and _tutor_user(session).pk != actor.pk:
        notify([_tutor_user(session)], messages.session_cancelled(session), messages.TUTOR_TIMETABLE_LINK)
    # A cancelled session does not use up the plan: one more is added at
    # the end.
    generation.regenerate(session.student_subject)
    return session


# -- tutor asks, staff decide ------------------------------------------------------------------


@transaction.atomic
def request_session_change(session, actor, kind, reason, new_date=None, new_start=None, new_end=None):
    """The session's tutor asks to move or cancel it. Nothing on the
    timetable changes until staff approve. A move that clashes is refused
    here (tutors cannot override a clash; staff can at approval)."""
    from accounts.services import reviewers_for

    if not is_own(session, actor):
        raise PermissionDenied('You can only ask to change your own sessions.')
    session = _lock(session)
    if kind not in SessionChangeKind.values:
        raise ValidationError({'kind': ['Must be MOVE or CANCEL.']})
    moment = times.now()
    if session.status != SessionStatus.SCHEDULED or state.has_started(session, moment):
        raise ValidationError({'detail': ['You can only ask to change a session that has not started yet.']})
    reason = _reason(reason)
    if SessionChangeRequest.objects.filter(session=session, status=SessionChangeStatus.PENDING).exists():
        raise ValidationError({'detail': ['There is already a pending request for this session.']})

    fields = {}
    if kind == SessionChangeKind.MOVE:
        day, start, end = parse_new_time(new_date, new_start, new_end)
        if (day, start, end) == (session.date, session.start_time, session.end_time):
            raise ValidationError({'new_date': ['That is the session\'s current time.']})
        if times.at(day, start) <= moment:
            raise ValidationError({'new_date': ['The new time must be in the future.']})
        tutor = session.student_subject.tutor
        clashes.enforce(clashes.session_warnings(tutor, day, start, end, exclude_session=session), allow=False)
        fields = {'new_date': day, 'new_start_time': start, 'new_end_time': end}

    change = SessionChangeRequest.objects.create(
        session=session, kind=kind, reason=reason, requested_by=actor, **fields
    )
    tutor = session.student_subject.tutor
    notify(reviewers_for(tutor), messages.change_requested(tutor, session, kind), messages.STAFF_SESSION_REQUESTS_LINK)
    return change


def _lock_pending(change):
    locked = (
        SessionChangeRequest.objects.select_for_update()
        .select_related('session__student_subject__tutor__user')
        .get(pk=change.pk)
    )
    if locked.status != SessionChangeStatus.PENDING:
        raise ValidationError({'detail': [f'This request is already {locked.get_status_display().lower()}.']})
    return locked


def _reviewed(change, actor, status, reject_reason=''):
    change.status = status
    change.reviewed_by = actor
    change.reviewed_at = timezone.now()
    change.reject_reason = reject_reason
    change.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'reject_reason'])


@transaction.atomic
def approve_session_change(change, actor, allow_clash=False):
    """Applies the request. A move is clash-checked again now (the
    timetable may have changed since the tutor asked)."""
    require_staff(actor)
    change = _lock_pending(change)
    session = change.session
    if session.status != SessionStatus.SCHEDULED:
        raise ValidationError({'detail': ['This session is no longer scheduled, so the request cannot be applied.']})
    if change.kind == SessionChangeKind.MOVE:
        move_session(
            session,
            actor,
            change.new_date,
            change.new_start_time,
            change.new_end_time,
            change.reason,
            allow_clash=allow_clash,
            keep_request=change,
            tell_tutor=False,
        )
    else:
        cancel_session(session, actor, change.reason, keep_request=change, tell_tutor=False)
    _reviewed(change, actor, SessionChangeStatus.APPROVED)
    notify([_tutor_user(session)], messages.change_approved(session, change.kind), messages.TUTOR_TIMETABLE_LINK)
    return change


@transaction.atomic
def reject_session_change(change, actor, reason):
    """Live data is untouched. The tutor is told briefly; the full reason
    is shown on the session in My Timetable."""
    require_staff(actor)
    reason = _reason(reason)
    change = _lock_pending(change)
    _reviewed(change, actor, SessionChangeStatus.REJECTED, reason)
    notify([_tutor_user(change.session)], messages.change_rejected(change.session, change.kind), messages.TUTOR_TIMETABLE_LINK)
    return change


@transaction.atomic
def withdraw_session_change(change, actor):
    """The tutor takes back their own pending request."""
    if not is_own(change.session, actor):
        raise PermissionDenied('You can only withdraw your own requests.')
    change = _lock_pending(change)
    change.status = SessionChangeStatus.CANCELLED
    change.save(update_fields=['status'])
    return change
