"""Double-booking and working-hours checks.

A tutor is busy on a date for:
- every session that is not CANCELLED, and
- every weekly slot of an ACTIVE student subject that has no session on
  that date yet ("reserved": not generated, or the planned sessions ran
  out but no end has been confirmed). The time only becomes free after a
  confirmed last session.

Touching edges (one ends 16:00, the next starts 16:00) are not a clash.
Clashes and times outside working hours are warnings, not hard errors:
the view answers 409 with them, and staff may resend with allow_clash."""

from dataclasses import dataclass, field

from django.db.models import Q

from academics.models import Session, SessionStatus, StudentSubjectStatus, TimetableSlot

from . import times

CLASH = 'CLASH'
OUTSIDE_WORKING_HOURS = 'OUTSIDE_WORKING_HOURS'

# Names in messages are cut to this so every message stays well inside
# the 255 character notification limit.
NAME_LIMIT = 60


def short(text, limit=NAME_LIMIT):
    text = (text or '').strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + '…'


def tutor_name(tutor):
    return short(tutor.user.full_name or tutor.user.email)


def student_name(student):
    return short(student.full_name)


def subject_name(subject):
    return short(subject.display_name)


@dataclass
class Busy:
    start: object
    end: object
    student_subject: object
    session: object = None
    slot: object = None
    date: object = None

    def as_dict(self):
        ss = self.student_subject
        return {
            'session': self.session.pk if self.session else None,
            'slot': self.slot.pk if self.slot else None,
            'student_subject': ss.pk,
            'student_name': ss.student.full_name,
            'subject_name': ss.subject.display_name,
            'date': self.date.isoformat() if self.date else None,
            'weekday': self.date.weekday() if self.date else self.slot.weekday,
            'start_time': times.fmt_time(self.start),
            'end_time': times.fmt_time(self.end),
        }


@dataclass
class Warning:
    code: str
    message: str
    items: list = field(default_factory=list)

    def as_dict(self):
        return {'code': self.code, 'message': self.message, 'items': [i.as_dict() for i in self.items]}


class BookingConflict(Exception):
    """Raised when a booking clashes or falls outside working hours and
    the caller did not allow it."""

    def __init__(self, warnings):
        self.warnings = warnings
        super().__init__(' '.join(w.message for w in warnings))

    @property
    def message(self):
        return ' '.join(w.message for w in self.warnings)

    def as_dict(self):
        return [w.as_dict() for w in self.warnings]


# -- who is busy when -------------------------------------------------------------


def _ss_related():
    return ('student_subject__student', 'student_subject__subject__level', 'student_subject__tutor__user')


def busy_on(tutor, day, exclude_session_ids=()):
    """Everything that occupies `tutor` on `day`, as Busy items."""
    sessions = list(
        Session.objects.filter(student_subject__tutor=tutor, date=day)
        .exclude(status=SessionStatus.CANCELLED)
        .exclude(pk__in=list(exclude_session_ids))
        .select_related(*_ss_related())
    )
    # Every session on that day of any of the tutor's slots, cancelled
    # ones included: a cancelled occurrence frees its slot for that day.
    occupied_slots = set(
        Session.objects.filter(student_subject__tutor=tutor, date=day, slot__isnull=False).values_list(
            'slot_id', flat=True
        )
    )
    reserved = (
        TimetableSlot.objects.filter(
            student_subject__tutor=tutor,
            student_subject__status=StudentSubjectStatus.ACTIVE,
            student_subject__start_date__lte=day,
            weekday=day.weekday(),
        )
        .filter(Q(student_subject__confirmed_end_date__isnull=True) | Q(student_subject__confirmed_end_date__gte=day))
        .exclude(pk__in=occupied_slots)
        .select_related(*_ss_related())
    )
    items = [Busy(s.start_time, s.end_time, s.student_subject, session=s, date=day) for s in sessions]
    items += [Busy(slot.start_time, slot.end_time, slot.student_subject, slot=slot, date=day) for slot in reserved]
    return sorted(items, key=lambda b: (b.start, b.end))


def find_clashes(tutor, day, start, end, exclude_session=None):
    """Busy items overlapping [start, end) for `tutor` on `day`."""
    exclude = [exclude_session.pk] if exclude_session is not None else []
    return [b for b in busy_on(tutor, day, exclude) if times.overlaps(b.start, b.end, start, end)]


def find_slot_clashes(tutor, weekday, start, end, exclude_slot=None, from_date=None, exclude_student_subject=None):
    """For a weekly pattern: the tutor's other weekly slots on `weekday`
    that overlap, plus any upcoming one-off session on that weekday that
    overlaps. Student subjects whose confirmed end is before `from_date`
    are ignored."""
    from_date = max(from_date or times.today(), times.today())
    slots = (
        TimetableSlot.objects.filter(
            student_subject__tutor=tutor,
            student_subject__status=StudentSubjectStatus.ACTIVE,
            weekday=weekday,
            start_time__lt=end,
            end_time__gt=start,
        )
        .filter(
            Q(student_subject__confirmed_end_date__isnull=True)
            | Q(student_subject__confirmed_end_date__gte=from_date)
        )
        .select_related('student_subject__student', 'student_subject__subject__level')
    )
    if exclude_slot is not None:
        slots = slots.exclude(pk=exclude_slot.pk)
    if exclude_student_subject is not None:
        slots = slots.exclude(student_subject=exclude_student_subject)

    # Django's week_day runs 1 (Sunday) to 7 (Saturday).
    django_week_day = (weekday + 1) % 7 + 1
    one_offs = (
        Session.objects.filter(
            student_subject__tutor=tutor,
            slot__isnull=True,
            date__gte=from_date,
            date__week_day=django_week_day,
            start_time__lt=end,
            end_time__gt=start,
        )
        .exclude(status=SessionStatus.CANCELLED)
        .select_related('student_subject__student', 'student_subject__subject__level')
    )
    if exclude_student_subject is not None:
        one_offs = one_offs.exclude(student_subject=exclude_student_subject)

    items = [Busy(s.start_time, s.end_time, s.student_subject, slot=s) for s in slots]
    items += [Busy(s.start_time, s.end_time, s.student_subject, session=s, date=s.date) for s in one_offs]
    return items


def outside_working_hours(tutor, weekday, start, end):
    blocks = [
        times.Interval(h.start_time, h.end_time) for h in tutor.working_hours.all() if h.weekday == weekday
    ]
    return not times.within_any(blocks, start, end), bool(blocks)


# -- messages -------------------------------------------------------------------------


def _clash_message(tutor, item, when):
    ss = item.student_subject
    return (
        f'{tutor_name(tutor)} already teaches {subject_name(ss.subject)} ({student_name(ss.student)}) '
        f'on {when} {times.fmt_range(item.start, item.end)}.'
    )


def _hours_message(tutor, weekday, start, end, has_hours_that_day):
    day = times.WEEKDAY_NAMES[weekday]
    if not has_hours_that_day:
        return f'{tutor_name(tutor)} has no working hours on {day}.'
    return f'{day} {times.fmt_range(start, end)} is outside {tutor_name(tutor)}\'s working hours.'


def slot_warnings(tutor, weekday, start, end, exclude_slot=None, from_date=None, exclude_student_subject=None):
    warnings = []
    for item in find_slot_clashes(tutor, weekday, start, end, exclude_slot, from_date, exclude_student_subject):
        when = times.fmt_date(item.date) if item.date else times.WEEKDAY_NAMES[weekday]
        warnings.append(Warning(CLASH, _clash_message(tutor, item, when), [item]))
    outside, has_hours = outside_working_hours(tutor, weekday, start, end)
    if outside:
        warnings.append(Warning(OUTSIDE_WORKING_HOURS, _hours_message(tutor, weekday, start, end, has_hours)))
    return warnings


def session_warnings(tutor, day, start, end, exclude_session=None):
    from .generation import generate_sessions

    # Make sure the tutor's sessions exist up to that date before looking.
    generate_sessions(until=day, student_subjects=list(tutor.student_subjects.values_list('pk', flat=True)))
    warnings = [
        Warning(CLASH, _clash_message(tutor, item, times.fmt_date(day)), [item])
        for item in find_clashes(tutor, day, start, end, exclude_session)
    ]
    outside, has_hours = outside_working_hours(tutor, day.weekday(), start, end)
    if outside:
        warnings.append(Warning(OUTSIDE_WORKING_HOURS, _hours_message(tutor, day.weekday(), start, end, has_hours)))
    return warnings


def enforce(warnings, allow):
    """Raise BookingConflict unless there is nothing to warn about or the
    caller explicitly allowed it."""
    if warnings and not allow:
        raise BookingConflict(warnings)
    return warnings
