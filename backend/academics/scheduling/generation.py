"""Turning weekly slots into dated sessions.

generate_sessions is idempotent: run it as often as you like (daily from
the management command, lazily before timetable reads, after every
change) and it only ever adds what is missing. It never touches a past
or logged session.

The plan budget: a student subject has `planned_sessions`. Held sessions
and Scheduled ones that can still be logged count against it; Not held,
missed (log window closed) and cancelled ones do not, so each of those
lets one more session be generated at the end - which is what pushes the
expected end date back."""

from datetime import timedelta

from django.db import transaction
from django.db.models import Q

from academics.models import Session, SessionStatus, StudentSubject, StudentSubjectStatus

from . import state, times

DEFAULT_HORIZON = timedelta(weeks=4)
# Lazy generation follows whatever range is being viewed; this caps it so
# one request cannot fill years of rows.
MAX_HORIZON = timedelta(days=366)


def future_q(moment):
    """Sessions that start after `moment`."""
    return Q(date__gt=moment.date()) | Q(date=moment.date(), start_time__gt=moment.time())


def close_ended(moment=None):
    """ACTIVE student subjects whose confirmed last date has passed become
    ENDED. Returns how many changed."""
    moment = moment or times.now()
    return StudentSubject.objects.filter(
        status=StudentSubjectStatus.ACTIVE, confirmed_end_date__lt=moment.date()
    ).update(status=StudentSubjectStatus.ENDED)


def generate_sessions(until=None, student_subjects=None, moment=None):
    """Creates the missing SCHEDULED sessions of every ACTIVE student
    subject (or just `student_subjects`, a queryset or list) up to and
    including `until` (default four weeks ahead). Returns how many
    sessions were created."""
    moment = moment or times.now()
    limit = moment.date() + MAX_HORIZON
    until = min(until or moment.date() + DEFAULT_HORIZON, limit)

    close_ended(moment)
    qs = StudentSubject.objects.filter(status=StudentSubjectStatus.ACTIVE)
    if student_subjects is not None:
        ids = [getattr(item, 'pk', item) for item in student_subjects]
        qs = qs.filter(pk__in=ids)

    created = 0
    for pk in qs.values_list('pk', flat=True):
        created += _generate_for(pk, until, moment)
    return created


@transaction.atomic
def _generate_for(pk, until, moment):
    # Locked so two requests generating at once cannot both spend the
    # same budget (the unique constraint is the backstop).
    ss = StudentSubject.objects.select_for_update().filter(pk=pk, status=StudentSubjectStatus.ACTIVE).first()
    if ss is None:
        return 0

    last_day = until
    if ss.confirmed_end_date is not None:
        last_day = min(last_day, ss.confirmed_end_date)

    sessions = list(ss.sessions.all())
    budget = ss.planned_sessions - sum(1 for s in sessions if state.counts_towards_plan(s, moment))
    if budget < 0:
        _trim(ss, -budget, moment)
        return 0

    slots = list(ss.slots.all())
    if budget == 0 or not slots:
        return 0

    taken_slots = {(s.slot_id, s.date) for s in sessions if s.slot_id}
    taken_times = {(s.date, s.start_time) for s in sessions}
    by_weekday = {}
    for slot in sorted(slots, key=lambda s: s.start_time):
        by_weekday.setdefault(slot.weekday, []).append(slot)

    new = []
    for day in times.daterange(max(ss.start_date, moment.date()), last_day):
        for slot in by_weekday.get(day.weekday(), []):
            if budget <= 0:
                break
            if (slot.pk, day) in taken_slots or (day, slot.start_time) in taken_times:
                continue
            if times.at(day, slot.start_time) <= moment:
                continue
            new.append(
                Session(
                    student_subject=ss, slot=slot, date=day, start_time=slot.start_time, end_time=slot.end_time
                )
            )
            budget -= 1
        if budget <= 0:
            break

    Session.objects.bulk_create(new, ignore_conflicts=True)
    return len(new)


def _trim(ss, count, moment):
    """More sessions are committed than planned (a correction turned a Not
    held into Held, or planned_sessions went down): drop the latest
    generated future sessions. One-off (moved) sessions are left alone."""
    extra = (
        ss.sessions.filter(future_q(moment), status=SessionStatus.SCHEDULED, slot__isnull=False)
        .order_by('-date', '-start_time')
        .values_list('pk', flat=True)[:count]
    )
    Session.objects.filter(pk__in=list(extra)).delete()


def clear_future(ss, slot=None, moment=None):
    """Deletes future SCHEDULED sessions generated from `ss`'s slots (only
    `slot`'s when given), so they can be regenerated from the new pattern.
    Past and logged sessions and one-offs are never touched."""
    moment = moment or times.now()
    qs = ss.sessions.filter(future_q(moment), status=SessionStatus.SCHEDULED, slot__isnull=False)
    if slot is not None:
        qs = qs.filter(slot=slot)
    return qs.delete()[0]


def regenerate(ss, until=None, moment=None):
    """Generate for one student subject, at least four weeks ahead."""
    return generate_sessions(until=until, student_subjects=[ss.pk], moment=moment)
