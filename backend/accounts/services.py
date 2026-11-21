"""Business rules for a tutor's subjects and working hours.

Two ways to change them:
- staff edit directly: set_tutor_subjects / set_working_hours, applied now.
- a tutor proposes: submit_change creates a PENDING TutorChangeRequest; the
  live rows stay as they are until approve_change applies the proposal.

Both paths run the same validators, so a proposal that would be refused as
a direct edit is refused at submit time too, and again at approval (the
catalog may have changed in between)."""

from datetime import time

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from academics.models import Subject
from core.services import notify

from .models import (
    WEEKDAY_CHOICES,
    ChangeKind,
    ChangeStatus,
    TutorChangeRequest,
    TutorProfile,
    TutorSubject,
    User,
    WorkingHours,
)
from .permissions import has_staff_scope_over

WEEKDAY_NAMES = dict(WEEKDAY_CHOICES)
STAFF_CHANGE_REQUESTS_LINK = '/users/change-requests'
TUTOR_PROFILE_LINK = '/me'


# -- validation ---------------------------------------------------------------


def validate_subject_ids(subject_ids):
    """Returns the ids, de-duplicated and sorted. Every id must be an
    active Subject. Raises ValidationError({'subjects': [...]})."""
    if not isinstance(subject_ids, list):
        raise ValidationError({'subjects': ['Must be a list of subject ids.']})
    # bool is an int subclass; True must not sneak through as subject 1.
    if any(not isinstance(i, int) or isinstance(i, bool) for i in subject_ids):
        raise ValidationError({'subjects': ['Every subject id must be a whole number.']})
    ids = sorted(set(subject_ids))
    found = set(Subject.objects.filter(id__in=ids, is_active=True).values_list('id', flat=True))
    missing = [i for i in ids if i not in found]
    if missing:
        listed = ', '.join(str(i) for i in missing)
        raise ValidationError({'subjects': [f'Unknown or inactive subject id: {listed}.']})
    return ids


def _parse_time(value, label):
    if isinstance(value, time):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = time.fromisoformat(value)
        except ValueError:
            raise ValidationError({'working_hours': [f'{label}: "{value}" is not a time (use HH:MM).']})
    else:
        raise ValidationError({'working_hours': [f'{label}: must be a time in HH:MM.']})
    if parsed.second or parsed.microsecond or parsed.tzinfo:
        raise ValidationError({'working_hours': [f'{label}: use whole minutes (HH:MM).']})
    return parsed


def _fmt(t):
    return t.strftime('%H:%M')


def describe_block(block):
    return f"{WEEKDAY_NAMES[block['weekday']]} {_fmt(block['start_time'])} to {_fmt(block['end_time'])}"


def validate_working_hours(blocks):
    """Validates a whole week of working hours and returns it normalised:
    a list of {weekday, start_time: time, end_time: time}, sorted by day
    then start. Rules: weekday 0 (Monday) to 6 (Sunday), start before end,
    and no two blocks on the same day overlap. Blocks that touch (one ends
    at 12:00, the next starts at 12:00) are fine.
    Raises ValidationError({'working_hours': [...]})."""
    if not isinstance(blocks, list):
        raise ValidationError({'working_hours': ['Must be a list of {weekday, start_time, end_time}.']})

    normalised = []
    for index, raw in enumerate(blocks, start=1):
        label = f'Row {index}'
        if not isinstance(raw, dict):
            raise ValidationError({'working_hours': [f'{label}: must have weekday, start_time and end_time.']})
        weekday = raw.get('weekday')
        if not isinstance(weekday, int) or isinstance(weekday, bool) or weekday not in WEEKDAY_NAMES:
            raise ValidationError({'working_hours': [f'{label}: weekday must be 0 (Monday) to 6 (Sunday).']})
        start = _parse_time(raw.get('start_time'), label)
        end = _parse_time(raw.get('end_time'), label)
        block = {'weekday': weekday, 'start_time': start, 'end_time': end}
        if start >= end:
            raise ValidationError({'working_hours': [f'{describe_block(block)}: start must be before end.']})
        normalised.append(block)

    normalised.sort(key=lambda b: (b['weekday'], b['start_time'], b['end_time']))
    errors = []
    for previous, current in zip(normalised, normalised[1:]):
        if previous['weekday'] == current['weekday'] and current['start_time'] < previous['end_time']:
            errors.append(f'{describe_block(current)} overlaps {describe_block(previous)}.')
    if errors:
        raise ValidationError({'working_hours': errors})
    return normalised


def hours_to_json(blocks):
    """Normalised blocks -> the JSON shape stored in
    TutorChangeRequest.proposed and sent over the API ("HH:MM")."""
    return [
        {'weekday': b['weekday'], 'start_time': _fmt(b['start_time']), 'end_time': _fmt(b['end_time'])}
        for b in blocks
    ]


def _validate(kind, proposed):
    if kind == ChangeKind.SUBJECTS:
        return validate_subject_ids(proposed)
    if kind == ChangeKind.WORKING_HOURS:
        return hours_to_json(validate_working_hours(proposed))
    raise ValidationError({'kind': [f'Must be one of: {", ".join(ChangeKind.values)}.']})


# -- live data ----------------------------------------------------------------


def current_subject_ids(tutor):
    return sorted(tutor.subject_links.values_list('subject_id', flat=True))


def current_working_hours(tutor):
    return hours_to_json(
        [
            {'weekday': h.weekday, 'start_time': h.start_time, 'end_time': h.end_time}
            for h in tutor.working_hours.order_by('weekday', 'start_time')
        ]
    )


def current_value(tutor, kind):
    return current_subject_ids(tutor) if kind == ChangeKind.SUBJECTS else current_working_hours(tutor)


@transaction.atomic
def set_tutor_subjects(tutor, subject_ids):
    """Replaces the tutor's subjects with exactly `subject_ids`."""
    ids = validate_subject_ids(subject_ids)
    tutor.subject_links.exclude(subject_id__in=ids).delete()
    existing = set(tutor.subject_links.values_list('subject_id', flat=True))
    TutorSubject.objects.bulk_create([TutorSubject(tutor=tutor, subject_id=i) for i in ids if i not in existing])
    return ids


@transaction.atomic
def set_working_hours(tutor, blocks):
    """Replaces the tutor's working hours with exactly `blocks`."""
    normalised = validate_working_hours(blocks)
    tutor.working_hours.all().delete()
    WorkingHours.objects.bulk_create([WorkingHours(tutor=tutor, **b) for b in normalised])
    return hours_to_json(normalised)


def tutor_can_take_new_students(tutor):
    """Whether matching (a later feature) may suggest this tutor: active
    account, marked available, and at least one subject and one
    working-hours block."""
    # `.all()[:1]` reads a prefetch cache when there is one (the users
    # list prefetches both), and is a single LIMIT 1 query otherwise.
    return bool(
        tutor.user.is_active
        and tutor.is_available
        and tutor.subject_links.all()[:1]
        and tutor.working_hours.all()[:1]
    )


# -- change requests ----------------------------------------------------------


def can_review(actor, tutor):
    """Who may approve, reject, or directly edit this tutor's subjects and
    hours: the same staff hierarchy as editing the user account."""
    return bool(actor and actor.is_authenticated and actor.is_staff_level and has_staff_scope_over(actor, tutor.user))


def reviewers_for(tutor):
    staff = User.objects.filter(is_active=True, role__in=['ADMIN', 'OWNER', 'SYS_ADMIN'])
    return [u for u in staff if u.pk != tutor.user_id and has_staff_scope_over(u, tutor.user)]


def _kind_label(kind):
    return ChangeKind(kind).label.lower()


# Names in notification messages are cut to this, so every message fits
# the 255 character limit by design (core.services.notify refuses longer).
NAME_LIMIT = 60


def display_name(user):
    name = (user.full_name or user.email).strip()
    return name if len(name) <= NAME_LIMIT else name[: NAME_LIMIT - 1].rstrip() + '…'


@transaction.atomic
def submit_change(tutor, kind, proposed, note=''):
    """Records a tutor's proposed replacement set. Cancels any earlier
    pending request of the same kind (one pending per tutor per kind) and
    notifies the staff who can review it. Live data is untouched.

    The tutor's row is locked first, so two submits at the same moment run
    one after the other: the second cancels the first's pending request
    instead of both inserting one and the second hitting the
    one-pending-per-kind constraint (an IntegrityError, i.e. a 500)."""
    tutor = TutorProfile.objects.select_for_update().select_related('user').get(pk=tutor.pk)
    normalised = _validate(kind, proposed)
    TutorChangeRequest.objects.select_for_update().filter(
        tutor=tutor, kind=kind, status=ChangeStatus.PENDING
    ).update(status=ChangeStatus.CANCELLED)
    change = TutorChangeRequest.objects.create(
        tutor=tutor, kind=kind, proposed=normalised, note=(note or '').strip()
    )
    notify(
        reviewers_for(tutor),
        f'{display_name(tutor.user)} asked to change their {_kind_label(kind)}.',
        STAFF_CHANGE_REQUESTS_LINK,
    )
    return change


def _lock_pending(change):
    locked = TutorChangeRequest.objects.select_for_update().select_related('tutor__user').get(pk=change.pk)
    if locked.status != ChangeStatus.PENDING:
        raise ValidationError({'detail': [f'This request is already {locked.get_status_display().lower()}.']})
    return locked


@transaction.atomic
def approve_change(change, reviewer):
    """Applies the proposal as the tutor's new live set, in one
    transaction with the status change. Re-validated now: a subject may
    have been deactivated since the tutor asked."""
    change = _lock_pending(change)
    if not can_review(reviewer, change.tutor):
        raise PermissionDenied('You do not have permission to review this request.')
    if change.kind == ChangeKind.SUBJECTS:
        set_tutor_subjects(change.tutor, change.proposed)
    else:
        set_working_hours(change.tutor, change.proposed)
    change.status = ChangeStatus.APPROVED
    change.reviewed_by = reviewer
    change.reviewed_at = timezone.now()
    change.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])
    notify([change.tutor.user], f'Your {_kind_label(change.kind)} change was approved.', TUTOR_PROFILE_LINK)
    return change


@transaction.atomic
def reject_change(change, reviewer, reason):
    """Marks the request rejected with a reason; live data is untouched."""
    reason = (reason or '').strip()
    if not reason:
        raise ValidationError({'reason': ['Say why, so the tutor knows what to change.']})
    change = _lock_pending(change)
    if not can_review(reviewer, change.tutor):
        raise PermissionDenied('You do not have permission to review this request.')
    change.status = ChangeStatus.REJECTED
    change.reviewed_by = reviewer
    change.reviewed_at = timezone.now()
    change.reject_reason = reason
    change.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'reject_reason'])
    notify(
        [change.tutor.user],
        # The reason itself can be any length; it is shown in full on My
        # Profile, so the notification stays short and complete.
        f'Your {_kind_label(change.kind)} change was not approved. See My Profile for the reason.',
        TUTOR_PROFILE_LINK,
    )
    return change


@transaction.atomic
def cancel_change(change, tutor):
    """The tutor withdraws their own pending request."""
    if change.tutor_id != tutor.pk:
        raise PermissionDenied('You can only cancel your own requests.')
    change = _lock_pending(change)
    change.status = ChangeStatus.CANCELLED
    change.save(update_fields=['status'])
    return change
