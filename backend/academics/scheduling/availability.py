"""A tutor's free time: working hours minus booked time, per day."""

from datetime import timedelta

from . import clashes, generation, times


def free_slots(tutor, week_start):
    """For each day of the week starting at `week_start` (a Monday):
    {weekday, date, working: [...], busy: [...], free: [...]}, each list
    of {start_time, end_time} ("HH:MM"), merged and sorted.

    Busy time is every session that is not cancelled plus every weekly
    slot still reserved for an active student subject (see
    clashes.busy_on). Busy time partly outside working hours only takes
    away the part inside them."""
    generation.generate_sessions(
        until=week_start + timedelta(days=6),
        student_subjects=list(tutor.student_subjects.values_list('pk', flat=True)),
    )
    hours = list(tutor.working_hours.all())
    days = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        working = times.merge(
            times.Interval(h.start_time, h.end_time) for h in hours if h.weekday == day.weekday()
        )
        busy = times.merge(times.Interval(b.start, b.end) for b in clashes.busy_on(tutor, day))
        days.append(
            {
                'weekday': day.weekday(),
                'date': day,
                'working': _out(working),
                'busy': _out(busy),
                'free': _out(times.subtract(working, busy)),
            }
        )
    return days


def _out(intervals):
    return [{'start_time': times.fmt_time(i.start), 'end_time': times.fmt_time(i.end)} for i in intervals]
