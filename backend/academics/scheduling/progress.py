"""How far a student subject has got, and when it is expected to end.
Everything here is computed on read; nothing is stored."""

from datetime import timedelta

from academics.models import SessionStatus, StudentSubjectStatus

from . import state, times

# Expected end dates further out than this are reported as unknown rather
# than walked to (a plan of 500 sessions at one a week).
PROJECTION_LIMIT = timedelta(days=366 * 5)


def expected_end_date(ss, sessions, slots, remaining, moment):
    """The date the last of the `remaining` sessions is expected on.

    Already scheduled, still-loggable sessions take their places first
    (they are real, including one-offs and moves). Any still to place are
    projected from the weekly slots, walking forward from today and
    skipping every slot occurrence that already has a session of any
    status (held, cancelled, already counted...). None when it cannot be
    worked out (no slots)."""
    if ss.confirmed_end_date is not None:
        return ss.confirmed_end_date
    if remaining <= 0:
        held = [s.date for s in sessions if s.status == SessionStatus.HELD]
        return max(held) if held else None

    upcoming = sorted(
        (s for s in sessions if s.status == SessionStatus.SCHEDULED and not state.is_locked(s, moment)),
        key=lambda s: (s.date, s.start_time),
    )
    if len(upcoming) >= remaining:
        return upcoming[remaining - 1].date
    to_place = remaining - len(upcoming)
    last = upcoming[-1].date if upcoming else None

    if not slots:
        return None
    taken_slots = {(s.slot_id, s.date) for s in sessions if s.slot_id}
    taken_times = {(s.date, s.start_time) for s in sessions}
    by_weekday = {}
    for slot in sorted(slots, key=lambda s: s.start_time):
        by_weekday.setdefault(slot.weekday, []).append(slot)

    first = max(ss.start_date, moment.date())
    for day in times.daterange(first, first + PROJECTION_LIMIT):
        for slot in by_weekday.get(day.weekday(), []):
            if (slot.pk, day) in taken_slots or (day, slot.start_time) in taken_times:
                continue
            if times.at(day, slot.start_time) <= moment:
                continue
            to_place -= 1
            if to_place == 0:
                return max(day, last) if last else day
    return None


def progress(ss, moment=None):
    """{held, not_held, planned, remaining, held_minutes, held_hours,
    topics_covered, topics_total, covered_topic_ids, expected_end_date,
    needs_end_confirmation, unlogged}.

    Reads ss.sessions / ss.slots / ss.topics through .all() so a caller's
    prefetch is used when there is one."""
    moment = moment or times.now()
    sessions = list(ss.sessions.all())
    slots = list(ss.slots.all())
    topic_ids = {t.pk for t in ss.topics.all()}

    held = [s for s in sessions if s.status == SessionStatus.HELD]
    not_held = [
        s for s in sessions if s.status == SessionStatus.NOT_HELD or state.is_locked(s, moment)
    ]
    remaining = max(ss.planned_sessions - len(held), 0)
    covered = set()
    for s in held:
        covered.update(t.pk for t in s.topics_covered.all())
    covered &= topic_ids
    held_minutes = sum(times.minutes_between(s.start_time, s.end_time) for s in held)

    all_topics_done = bool(topic_ids) and covered == topic_ids
    return {
        'planned': ss.planned_sessions,
        'held': len(held),
        'not_held': len(not_held),
        'remaining': remaining,
        'unlogged': sum(1 for s in sessions if state.is_unlogged(s, moment)),
        'held_minutes': held_minutes,
        'held_hours': round(held_minutes / 60, 2),
        'topics_covered': len(covered),
        'topics_total': len(topic_ids),
        'covered_topic_ids': sorted(covered),
        'expected_end_date': expected_end_date(ss, sessions, slots, remaining, moment),
        'needs_end_confirmation': (
            ss.status == StudentSubjectStatus.ACTIVE
            and ss.confirmed_end_date is None
            and (remaining == 0 or all_topics_done)
        ),
        'end_reason': ('SESSIONS_USED' if remaining == 0 else 'TOPICS_COVERED' if all_topics_done else None),
    }
