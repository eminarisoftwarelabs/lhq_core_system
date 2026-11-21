from datetime import date, time
from types import SimpleNamespace

from django.conf import settings
from django.test import SimpleTestCase

from academics.models import SessionStatus
from academics.scheduling import state, times
from academics.scheduling.times import Interval

from .scheduling_helpers import local


def iv(start, end):
    return Interval(time.fromisoformat(start), time.fromisoformat(end))


def fake_session(day, start, end, status=SessionStatus.SCHEDULED):
    return SimpleNamespace(
        date=day, start_time=time.fromisoformat(start), end_time=time.fromisoformat(end), status=status
    )


class TimeZoneTests(SimpleTestCase):
    def test_settings_use_lilongwe_time(self):
        self.assertEqual(settings.TIME_ZONE, 'Africa/Blantyre')

    def test_session_times_are_local_not_utc(self):
        start = times.session_start(fake_session(date(2026, 11, 16), '16:00', '17:00'))
        self.assertEqual(start.utcoffset().total_seconds(), 2 * 3600)
        self.assertEqual(start.hour, 16)


class IntervalTests(SimpleTestCase):
    def test_touching_is_not_an_overlap(self):
        self.assertFalse(iv('08:00', '12:00').overlaps(iv('12:00', '13:00')))
        self.assertTrue(iv('08:00', '12:01').overlaps(iv('12:00', '13:00')))

    def test_merge_joins_overlapping_and_touching(self):
        self.assertEqual(
            times.merge([iv('14:00', '15:00'), iv('08:00', '10:00'), iv('10:00', '11:00'), iv('14:30', '16:00')]),
            [iv('08:00', '11:00'), iv('14:00', '16:00')],
        )

    def test_subtract_with_nothing_busy_is_the_working_hours(self):
        self.assertEqual(times.subtract([iv('08:00', '12:00')], []), [iv('08:00', '12:00')])

    def test_subtract_at_the_edges(self):
        self.assertEqual(
            times.subtract([iv('08:00', '12:00')], [iv('08:00', '09:00'), iv('11:00', '12:00')]),
            [iv('09:00', '11:00')],
        )

    def test_subtract_back_to_back_sessions_leave_no_gap(self):
        self.assertEqual(
            times.subtract([iv('14:00', '17:00')], [iv('14:00', '15:00'), iv('15:00', '16:00')]),
            [iv('16:00', '17:00')],
        )

    def test_subtract_split_working_hours(self):
        self.assertEqual(
            times.subtract([iv('08:00', '12:00'), iv('14:00', '17:00')], [iv('09:00', '10:00'), iv('14:00', '15:00')]),
            [iv('08:00', '09:00'), iv('10:00', '12:00'), iv('15:00', '17:00')],
        )

    def test_subtract_busy_partly_outside_only_removes_the_inside_part(self):
        self.assertEqual(times.subtract([iv('14:00', '17:00')], [iv('13:00', '14:30')]), [iv('14:30', '17:00')])
        self.assertEqual(times.subtract([iv('14:00', '17:00')], [iv('16:30', '18:00')]), [iv('14:00', '16:30')])

    def test_subtract_busy_wholly_outside_changes_nothing(self):
        self.assertEqual(times.subtract([iv('14:00', '17:00')], [iv('18:00', '19:00')]), [iv('14:00', '17:00')])

    def test_within_any_needs_a_single_block(self):
        blocks = [iv('08:00', '12:00'), iv('12:00', '13:00')]  # merged -> 08-13
        self.assertTrue(times.within_any(blocks, time(11, 30), time(12, 30)))
        self.assertFalse(times.within_any([iv('08:00', '12:00'), iv('14:00', '17:00')], time(11, 30), time(14, 30)))
        self.assertFalse(times.within_any([], time(9), time(10)))


class FormatTests(SimpleTestCase):
    def test_short_date(self):
        self.assertEqual(times.fmt_date(date(2026, 11, 16)), 'Mon 16 Nov')

    def test_month_helpers(self):
        self.assertEqual(times.parse_month('2026-12'), date(2026, 12, 1))
        self.assertEqual(times.month_bounds(date(2026, 12, 1)), (date(2026, 12, 1), date(2026, 12, 31)))
        self.assertEqual(times.month_bounds(date(2027, 2, 1)), (date(2027, 2, 1), date(2027, 2, 28)))
        with self.assertRaises(ValueError):
            times.parse_month('2026-13')
        with self.assertRaises(ValueError):
            times.parse_month('Nov')


class DerivedStateTests(SimpleTestCase):
    """A Monday 16:00-17:00 session at different moments."""

    def setUp(self):
        self.session = fake_session(date(2026, 11, 16), '16:00', '17:00')
        self.session.moved_to = SimpleNamespace(exists=lambda: False)

    def status_at(self, day, clock):
        return state.display_status(self.session, local(date(2026, 11, day), time.fromisoformat(clock)))

    def test_upcoming_until_it_ends(self):
        self.assertEqual(self.status_at(16, '16:59'), state.UPCOMING)

    def test_unlogged_from_its_end_for_24_hours(self):
        self.assertEqual(self.status_at(16, '17:00'), state.UNLOGGED)
        self.assertEqual(self.status_at(17, '17:00'), state.UNLOGGED)

    def test_missed_once_the_window_closes(self):
        self.assertEqual(self.status_at(17, '17:01'), state.MISSED)
        self.assertFalse(state.counts_towards_plan(self.session, local(date(2026, 11, 17), time(17, 1))))
        self.assertTrue(state.counts_towards_plan(self.session, local(date(2026, 11, 17), time(16, 59))))

    def test_stored_statuses_pass_through(self):
        self.session.status = SessionStatus.HELD
        self.assertEqual(self.status_at(30, '09:00'), SessionStatus.HELD)

    def test_cancelled_by_a_move_reads_as_moved(self):
        self.session.status = SessionStatus.CANCELLED
        self.assertEqual(state.display_status(self.session, moved_away=True), state.MOVED)
        self.assertEqual(state.display_status(self.session, moved_away=False), SessionStatus.CANCELLED)
