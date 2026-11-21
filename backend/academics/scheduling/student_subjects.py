"""Creating and changing student subjects and their weekly slots (staff
only), and ending them. Every change regenerates the affected future
sessions; past and logged sessions are never touched."""

from datetime import time

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction

from academics.models import (
    SessionStatus,
    StudentSubject,
    StudentSubjectStatus,
    TimetableSlot,
    Topic,
)
from accounts.models import TutorSubject

from . import clashes, generation, times

MAX_PLANNED_SESSIONS = 1000
MAX_ADD_SESSIONS = 200
MAX_SESSION_MINUTES = 8 * 60


def require_staff(actor):
    if not (actor and actor.is_authenticated and actor.is_staff_level):
        raise PermissionDenied('Only staff can change the timetable.')


# -- validation ---------------------------------------------------------------------


def parse_time(value, field):
    if isinstance(value, time):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = time.fromisoformat(value)
        except ValueError:
            raise ValidationError({field: [f'"{value}" is not a time (use HH:MM).']})
    else:
        raise ValidationError({field: ['Must be a time in HH:MM.']})
    if parsed.second or parsed.microsecond or parsed.tzinfo:
        raise ValidationError({field: ['Use whole minutes (HH:MM).']})
    return parsed


def normalise_slot(raw, label='slots'):
    """{weekday, start_time, end_time} with times parsed. Raises
    ValidationError({label: [...]})."""
    if not isinstance(raw, dict):
        raise ValidationError({label: ['Each slot needs weekday, start_time and end_time.']})
    weekday = raw.get('weekday')
    if not isinstance(weekday, int) or isinstance(weekday, bool) or not 0 <= weekday <= 6:
        raise ValidationError({label: ['weekday must be 0 (Monday) to 6 (Sunday).']})
    start = parse_time(raw.get('start_time'), label)
    end = parse_time(raw.get('end_time'), label)
    if start >= end:
        raise ValidationError({label: [f'{times.WEEKDAY_NAMES[weekday]}: the start must be before the end.']})
    return {'weekday': weekday, 'start_time': start, 'end_time': end}


def _describe(slot):
    return f"{times.WEEKDAY_NAMES[slot['weekday']]} {times.fmt_range(slot['start_time'], slot['end_time'])}"


def check_own_overlaps(slots, label='slots'):
    """A student subject's own slots may not overlap each other."""
    ordered = sorted(slots, key=lambda s: (s['weekday'], s['start_time']))
    for a, b in zip(ordered, ordered[1:]):
        if a['weekday'] == b['weekday'] and b['start_time'] < a['end_time']:
            raise ValidationError({label: [f'{_describe(b)} overlaps {_describe(a)}.']})


def validate_topics(subject, topic_ids):
    """The subject's topics with these ids. None means all of them."""
    topics = Topic.objects.filter(subject=subject)
    if topic_ids is None:
        return list(topics)
    if not isinstance(topic_ids, list) or any(not isinstance(i, int) or isinstance(i, bool) for i in topic_ids):
        raise ValidationError({'topic_ids': ['Must be a list of topic ids.']})
    found = list(topics.filter(pk__in=topic_ids))
    if len(found) != len(set(topic_ids)):
        raise ValidationError({'topic_ids': ['Every topic must belong to this subject.']})
    return found


def validate_planned(value, field='planned_sessions', maximum=MAX_PLANNED_SESSIONS):
    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= maximum:
        raise ValidationError({field: [f'Must be a whole number from 1 to {maximum}.']})
    return value


def validate_minutes(value):
    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= MAX_SESSION_MINUTES:
        raise ValidationError({'session_minutes': [f'Must be from 1 to {MAX_SESSION_MINUTES} minutes.']})
    return value


def require_teaches(tutor, subject):
    if not TutorSubject.objects.filter(tutor=tutor, subject=subject).exists():
        name = clashes.tutor_name(tutor)
        raise ValidationError({'tutor': [f'{name} does not teach {clashes.subject_name(subject)}.']})


def require_no_other_active(student, subject, exclude=None):
    qs = StudentSubject.objects.filter(student=student, subject=subject, status=StudentSubjectStatus.ACTIVE)
    if exclude is not None:
        qs = qs.exclude(pk=exclude.pk)
    if qs.exists():
        raise ValidationError(
            {'subject': [f'{clashes.student_name(student)} already has an active {clashes.subject_name(subject)}.']}
        )


def _slot_warnings(tutor, slots, from_date, exclude_ss=None, exclude_slot=None):
    warnings = []
    for slot in slots:
        warnings += clashes.slot_warnings(
            tutor,
            slot['weekday'],
            slot['start_time'],
            slot['end_time'],
            exclude_slot=exclude_slot,
            from_date=from_date,
            exclude_student_subject=exclude_ss,
        )
    return warnings


# -- student subjects ------------------------------------------------------------------


@transaction.atomic
def create_student_subject(
    actor,
    *,
    student,
    subject,
    tutor,
    planned_sessions,
    start_date,
    session_minutes=60,
    mode='IN_PERSON',
    topic_ids=None,
    slots=(),
    allow_clash=False,
):
    """Creates the student subject and its weekly slots, then generates
    its sessions. Returns (student_subject, warnings overridden)."""
    require_staff(actor)
    validate_planned(planned_sessions)
    validate_minutes(session_minutes)
    require_teaches(tutor, subject)
    require_no_other_active(student, subject)
    topics = validate_topics(subject, topic_ids)
    slots = [normalise_slot(s) for s in slots]
    check_own_overlaps(slots)
    warnings = clashes.enforce(_slot_warnings(tutor, slots, start_date), allow_clash)

    ss = StudentSubject.objects.create(
        student=student,
        subject=subject,
        tutor=tutor,
        planned_sessions=planned_sessions,
        session_minutes=session_minutes,
        mode=mode,
        start_date=start_date,
        created_by=actor,
    )
    ss.topics.set(topics)
    TimetableSlot.objects.bulk_create([TimetableSlot(student_subject=ss, **s) for s in slots])
    generation.regenerate(ss)
    return ss, warnings


def _logged_count(ss):
    return ss.sessions.filter(status__in=[SessionStatus.HELD, SessionStatus.NOT_HELD]).count()


@transaction.atomic
def update_student_subject(ss, actor, changes, allow_clash=False):
    """Applies a partial update. Allowed keys: tutor, topic_ids,
    planned_sessions, session_minutes, mode, start_date, status (only to
    CANCELLED). Returns the warnings that were overridden."""
    require_staff(actor)
    ss = StudentSubject.objects.select_for_update().get(pk=ss.pk)
    warnings = []

    if 'status' in changes:
        if changes['status'] != StudentSubjectStatus.CANCELLED:
            raise ValidationError(
                {'status': ['Only CANCELLED can be set here. Use confirm end to end a student subject.']}
            )
        if ss.status != StudentSubjectStatus.ACTIVE:
            raise ValidationError({'status': [f'This student subject is already {ss.get_status_display().lower()}.']})
        ss.status = StudentSubjectStatus.CANCELLED
        ss.save(update_fields=['status'])
        # Nothing ahead of now happens any more, one-offs included.
        ss.sessions.filter(generation.future_q(times.now()), status=SessionStatus.SCHEDULED).delete()
        return warnings

    if ss.status != StudentSubjectStatus.ACTIVE:
        raise ValidationError({'detail': [f'This student subject is {ss.get_status_display().lower()}.']})

    fields = []
    if 'planned_sessions' in changes:
        planned = validate_planned(changes['planned_sessions'])
        held = ss.sessions.filter(status=SessionStatus.HELD).count()
        if planned < held:
            raise ValidationError({'planned_sessions': [f'{held} sessions are already held.']})
        ss.planned_sessions = planned
        fields.append('planned_sessions')
    if 'session_minutes' in changes:
        ss.session_minutes = validate_minutes(changes['session_minutes'])
        fields.append('session_minutes')
    if 'mode' in changes:
        ss.mode = changes['mode']
        fields.append('mode')

    pattern_changed = False
    if 'start_date' in changes and changes['start_date'] != ss.start_date:
        ss.start_date = changes['start_date']
        fields.append('start_date')
        pattern_changed = True

    if 'tutor' in changes and changes['tutor'].pk != ss.tutor_id:
        tutor = changes['tutor']
        if _logged_count(ss):
            raise ValidationError(
                {
                    'tutor': [
                        'Sessions have already been logged with the current tutor. '
                        'End this student subject and create a new one with the new tutor.'
                    ]
                }
            )
        require_teaches(tutor, ss.subject)
        slots = [
            {'weekday': s.weekday, 'start_time': s.start_time, 'end_time': s.end_time} for s in ss.slots.all()
        ]
        warnings = clashes.enforce(_slot_warnings(tutor, slots, ss.start_date, exclude_ss=ss), allow_clash)
        ss.tutor = tutor
        fields.append('tutor')
        # Pending requests were the old tutor's; they no longer apply.
        from .changes import cancel_pending_requests

        for session in ss.sessions.filter(status=SessionStatus.SCHEDULED):
            cancel_pending_requests(session)

    if fields:
        ss.save(update_fields=fields)
    if 'topic_ids' in changes:
        ss.topics.set(validate_topics(ss.subject, changes['topic_ids']))
    if pattern_changed:
        generation.clear_future(ss)
    generation.regenerate(ss)
    return warnings


@transaction.atomic
def add_slot(ss, actor, raw, allow_clash=False):
    require_staff(actor)
    ss = StudentSubject.objects.select_for_update().get(pk=ss.pk)
    if ss.status != StudentSubjectStatus.ACTIVE:
        raise ValidationError({'detail': [f'This student subject is {ss.get_status_display().lower()}.']})
    slot = normalise_slot(raw, 'detail')
    existing = [{'weekday': s.weekday, 'start_time': s.start_time, 'end_time': s.end_time} for s in ss.slots.all()]
    check_own_overlaps(existing + [slot], 'detail')
    warnings = clashes.enforce(_slot_warnings(ss.tutor, [slot], ss.start_date, exclude_ss=ss), allow_clash)
    created = TimetableSlot.objects.create(student_subject=ss, **slot)
    generation.regenerate(ss)
    return created, warnings


@transaction.atomic
def update_slot(slot, actor, raw, allow_clash=False):
    """Changes a weekly slot. Its future scheduled sessions are cleared and
    regenerated at the new time (their planned topics go with them)."""
    require_staff(actor)
    slot = TimetableSlot.objects.select_for_update().select_related('student_subject__tutor').get(pk=slot.pk)
    ss = slot.student_subject
    if ss.status != StudentSubjectStatus.ACTIVE:
        raise ValidationError({'detail': [f'This student subject is {ss.get_status_display().lower()}.']})
    merged = {
        'weekday': raw.get('weekday', slot.weekday),
        'start_time': raw.get('start_time', slot.start_time),
        'end_time': raw.get('end_time', slot.end_time),
    }
    new = normalise_slot(merged, 'detail')
    others = [
        {'weekday': s.weekday, 'start_time': s.start_time, 'end_time': s.end_time}
        for s in ss.slots.exclude(pk=slot.pk)
    ]
    check_own_overlaps(others + [new], 'detail')
    warnings = clashes.enforce(_slot_warnings(ss.tutor, [new], ss.start_date, exclude_ss=ss), allow_clash)
    for attr, value in new.items():
        setattr(slot, attr, value)
    slot.save()
    generation.clear_future(ss, slot=slot)
    generation.regenerate(ss)
    return slot, warnings


@transaction.atomic
def delete_slot(slot, actor):
    require_staff(actor)
    ss = slot.student_subject
    generation.clear_future(ss, slot=slot)
    slot.delete()
    generation.regenerate(ss)


# -- ending ---------------------------------------------------------------------------------


@transaction.atomic
def confirm_end(ss, last_date, actor):
    """Admin confirms the date of the last session. Scheduled sessions
    after it are removed and none are generated past it; the student
    subject becomes ENDED once that date has passed, which frees the
    tutor's time."""
    require_staff(actor)
    ss = StudentSubject.objects.select_for_update().get(pk=ss.pk)
    if ss.status != StudentSubjectStatus.ACTIVE:
        raise ValidationError({'detail': [f'This student subject is {ss.get_status_display().lower()}.']})
    if last_date < ss.start_date:
        raise ValidationError({'last_date': ['Must be on or after the start date.']})
    last_held = (
        ss.sessions.filter(status=SessionStatus.HELD).order_by('-date').values_list('date', flat=True).first()
    )
    if last_held and last_date < last_held:
        raise ValidationError({'last_date': [f'A session was held on {times.fmt_date(last_held)}, after that date.']})

    ss.sessions.filter(status=SessionStatus.SCHEDULED, date__gt=last_date).delete()
    ss.confirmed_end_date = last_date
    fields = ['confirmed_end_date']
    if last_date < times.today():
        ss.status = StudentSubjectStatus.ENDED
        fields.append('status')
    ss.save(update_fields=fields)
    generation.regenerate(ss)
    return ss


@transaction.atomic
def add_sessions(ss, count, actor):
    """Adds `count` planned sessions. Clears a confirmed end (re-opening an
    ENDED student subject) so sessions are generated again."""
    require_staff(actor)
    validate_planned(count, 'count', MAX_ADD_SESSIONS)
    ss = StudentSubject.objects.select_for_update().get(pk=ss.pk)
    if ss.status == StudentSubjectStatus.CANCELLED:
        raise ValidationError({'detail': ['This student subject was cancelled.']})
    if ss.status == StudentSubjectStatus.ENDED:
        require_no_other_active(ss.student, ss.subject, exclude=ss)
    ss.planned_sessions += count
    ss.confirmed_end_date = None
    ss.status = StudentSubjectStatus.ACTIVE
    ss.save(update_fields=['planned_sessions', 'confirmed_end_date', 'status'])
    generation.regenerate(ss)
    return ss


