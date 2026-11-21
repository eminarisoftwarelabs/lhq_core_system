"""Local time and interval arithmetic for the timetable. Pure functions,
no database access, so every rule here is unit-testable on its own.

All judgements ("has this session ended?", "is the 24 hour window
open?") are made in settings.TIME_ZONE (Africa/Blantyre), never UTC: a
session on Monday 16:00 means 16:00 in Lilongwe."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from django.utils import timezone

# A tutor may log a session from its start until this long after its end.
LOG_WINDOW = timedelta(hours=24)

WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def now():
    """The current moment, as an aware datetime in local time."""
    return timezone.localtime(timezone.now())


def today():
    return now().date()


def at(day, clock):
    """An aware local datetime for `day` at `clock`."""
    return timezone.make_aware(datetime.combine(day, clock))


def session_start(session):
    return at(session.date, session.start_time)


def session_end(session):
    return at(session.date, session.end_time)


def log_deadline(session):
    """The last moment a tutor may log this session."""
    return session_end(session) + LOG_WINDOW


def week_start(day):
    """The Monday of `day`'s week."""
    return day - timedelta(days=day.weekday())


def minutes_between(start, end):
    return (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)


# -- formatting (used in plain-language messages) ------------------------------


def fmt_time(clock):
    return clock.strftime('%H:%M')


def fmt_range(start, end):
    return f'{fmt_time(start)} to {fmt_time(end)}'


def fmt_date(day):
    """"Mon 16 Nov" - short, bounded length, no locale surprises."""
    return f'{WEEKDAY_SHORT[day.weekday()]} {day.day} {MONTH_SHORT[day.month - 1]}'


# -- intervals -------------------------------------------------------------------


@dataclass(frozen=True, order=True)
class Interval:
    """A half-open stretch of one day, [start, end). Touching intervals
    (one ends 12:00, the next starts 12:00) do not overlap."""

    start: time
    end: time

    def overlaps(self, other):
        return self.start < other.end and other.start < self.end

    def contains(self, other):
        return self.start <= other.start and other.end <= self.end


def overlaps(start_a, end_a, start_b, end_b):
    return start_a < end_b and start_b < end_a


def merge(intervals):
    """Sorted, with overlapping or touching intervals joined."""
    merged = []
    for item in sorted(intervals):
        if merged and item.start <= merged[-1].end:
            if item.end > merged[-1].end:
                merged[-1] = Interval(merged[-1].start, item.end)
        else:
            merged.append(item)
    return merged


def subtract(available, busy):
    """`available` minus every `busy` interval, merged and sorted. Busy
    time partly outside `available` only removes the part inside it."""
    free = merge(available)
    for block in merge(busy):
        remaining = []
        for item in free:
            if not item.overlaps(block):
                remaining.append(item)
                continue
            if item.start < block.start:
                remaining.append(Interval(item.start, block.start))
            if block.end < item.end:
                remaining.append(Interval(block.end, item.end))
        free = remaining
    return merge(free)


def within_any(blocks, start, end):
    """Whether [start, end) fits inside a single one of `blocks`."""
    target = Interval(start, end)
    return any(Interval(b.start, b.end).contains(target) for b in merge(blocks))


def daterange(first, last):
    """Every date from first to last inclusive."""
    day = first
    while day <= last:
        yield day
        day += timedelta(days=1)


def parse_month(value):
    """"2026-11" -> date(2026, 11, 1). Raises ValueError."""
    if not isinstance(value, str) or len(value) != 7 or value[4] != '-':
        raise ValueError('Use YYYY-MM.')
    return date(int(value[:4]), int(value[5:]), 1)


def month_bounds(first):
    """(first day, last day) of the month starting at `first`."""
    if first.month == 12:
        following = date(first.year + 1, 1, 1)
    else:
        following = date(first.year, first.month + 1, 1)
    return first, following - timedelta(days=1)
