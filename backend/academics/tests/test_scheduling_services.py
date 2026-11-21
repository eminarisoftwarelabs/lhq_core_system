"""Service-level tests for Feature 2: generation, clashes, logging,
progress, changes, free time, hours and reminders."""

from datetime import date, time, timedelta
from decimal import Decimal
from unittest import mock

from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase

from academics.models import (
    Session,
    SessionAction,
    SessionChangeRequest,
    SessionChangeStatus,
    SessionStatus,
    StudentSubjectStatus,
    TimetableSlot,
)
from academics.scheduling import (
    availability,
    changes,
    clashes,
    generation,
    hours,
    messages,
    progress,
    reminders,
    session_log,
    student_subjects,
)
from accounts.models import Role
from core.models import Notification

from .scheduling_helpers import (
    MONDAY,
    THURSDAY,
    TUESDAY,
    WEDNESDAY,
    at,
    book,
    slot,
    student,
    subject_with_topics,
    tutor,
    user,
)


def held(session, actor, topic_ids=None):
    return session_log.log_session(session, actor, True, topic_ids=topic_ids or [])


class GenerationTests(TestCase):
    def setUp(self):
        self.admin = user(Role.ADMIN)
        self.tutor = tutor()

    def test_two_weekly_slots_generate_future_sessions_in_order(self):
        with at(WEDNESDAY, time(12)):
            ss = book(self.admin, self.tutor, [slot(0, '16:00', '17:00'), slot(3, '15:00', '16:00')], planned=6)
        dates = list(ss.sessions.values_list('date', 'start_time'))
        # From now (Wed noon): Thu 19, Mon 23, Thu 26, Mon 30, Thu 3, Mon 7.
        self.assertEqual(
            [d for d, _ in dates],
            [THURSDAY, date(2026, 11, 23), date(2026, 11, 26), date(2026, 11, 30), date(2026, 12, 3), date(2026, 12, 7)],
        )
        self.assertTrue(all(s.status == SessionStatus.SCHEDULED for s in ss.sessions.all()))

    def test_stops_at_planned_sessions_and_is_idempotent(self):
        with at(WEDNESDAY):
            ss = book(self.admin, self.tutor, planned=3)
            self.assertEqual(ss.sessions.count(), 3)
            self.assertEqual(generation.generate_sessions(until=WEDNESDAY + timedelta(weeks=20)), 0)
            self.assertEqual(ss.sessions.count(), 3)

    def test_only_up_to_the_horizon(self):
        with at(WEDNESDAY):
            ss = book(self.admin, self.tutor, planned=50)
        # Four weeks ahead of Wed 18 Nov: Mondays 23, 30, 7, 14.
        self.assertEqual(ss.sessions.count(), 4)
        with at(WEDNESDAY):
            generation.generate_sessions(until=date(2026, 12, 31))
        self.assertEqual(ss.sessions.count(), 6)

    def test_starts_from_the_start_date_when_it_is_later(self):
        with at(WEDNESDAY):
            ss = book(self.admin, self.tutor, start=date(2026, 12, 1), planned=2)
        self.assertEqual(list(ss.sessions.values_list('date', flat=True)), [date(2026, 12, 7), date(2026, 12, 14)])

    def test_never_creates_sessions_in_the_past(self):
        with at(MONDAY, time(16, 30)):  # Monday's 16:00 has already started
            ss = book(self.admin, self.tutor, planned=2)
        self.assertEqual(ss.sessions.first().date, date(2026, 11, 23))

    def test_a_not_held_session_adds_one_more_at_the_end(self):
        with at(MONDAY, time(9)):
            ss = book(self.admin, self.tutor, planned=2)
        first = ss.sessions.first()
        self.assertEqual(ss.sessions.count(), 2)
        with at(MONDAY, time(17, 30)):
            session_log.log_session(first, self.tutor.user, False, reason='Student was ill')
        self.assertEqual(ss.sessions.exclude(status=SessionStatus.NOT_HELD).count(), 2)
        self.assertEqual(ss.sessions.count(), 3)

    def test_a_missed_log_frees_a_place_once_the_window_closes(self):
        with at(MONDAY, time(9)):
            ss = book(self.admin, self.tutor, planned=2)
        with at(TUESDAY, time(17, 1)):
            generation.generate_sessions()
        self.assertEqual(ss.sessions.count(), 3)

    def test_correcting_not_held_to_held_trims_the_extra_session(self):
        with at(MONDAY, time(9)):
            ss = book(self.admin, self.tutor, planned=2)
        first = ss.sessions.first()
        with at(MONDAY, time(17, 30)):
            session_log.log_session(first, self.tutor.user, False, reason='Ill')
            self.assertEqual(ss.sessions.count(), 3)
            session_log.log_session(first, self.admin, True, admin_note='Actually happened, tutor mis-clicked')
        self.assertEqual(ss.sessions.count(), 2)

    def test_slot_change_regenerates_only_future_scheduled_sessions(self):
        with at(MONDAY, time(9)):
            ss = book(self.admin, self.tutor, planned=4)
        first = ss.sessions.first()
        with at(MONDAY, time(17, 30)):
            held(first, self.tutor.user)
        the_slot = ss.slots.get()
        with at(TUESDAY):
            student_subjects.update_slot(the_slot, self.admin, {'weekday': 2, 'start_time': '10:00', 'end_time': '11:00'})
        rows = list(ss.sessions.order_by('date').values_list('date', 'start_time', 'status'))
        self.assertEqual(rows[0], (MONDAY, time(16), SessionStatus.HELD))  # past, logged: untouched
        self.assertEqual([r[0].weekday() for r in rows[1:]], [2, 2, 2])
        self.assertEqual(len(rows), 4)

    def test_cancelled_occurrence_is_not_recreated(self):
        with at(WEDNESDAY):
            ss = book(self.admin, self.tutor, planned=3)
            target = ss.sessions.first()
            changes.cancel_session(target, self.admin, 'Public holiday')
            generation.generate_sessions(until=date(2027, 1, 31))
        self.assertEqual(ss.sessions.filter(date=target.date).count(), 1)
        self.assertEqual(ss.sessions.filter(status=SessionStatus.SCHEDULED).count(), 3)

    def test_nothing_after_a_confirmed_end_and_it_ends_after_that_date(self):
        with at(WEDNESDAY):
            ss = book(self.admin, self.tutor, planned=10)
            student_subjects.confirm_end(ss, date(2026, 11, 30), self.admin)
        self.assertEqual(list(ss.sessions.values_list('date', flat=True)), [date(2026, 11, 23), date(2026, 11, 30)])
        with at(date(2026, 12, 1)):
            generation.generate_sessions()
        ss.refresh_from_db()
        self.assertEqual(ss.status, StudentSubjectStatus.ENDED)


class StudentSubjectRulesTests(TestCase):
    def setUp(self):
        self.admin = user(Role.ADMIN)
        self.tutor = tutor()

    def test_topics_default_to_all_of_the_subject(self):
        with at(WEDNESDAY):
            ss = book(self.admin, self.tutor)
        self.assertEqual(ss.topics.count(), 4)

    def test_tutor_must_teach_the_subject(self):
        other = tutor('Ms Phiri')
        subject = subject_with_topics(teachers=[other])
        with at(WEDNESDAY), self.assertRaises(ValidationError) as ctx:
            student_subjects.create_student_subject(
                self.admin, student=student(), subject=subject, tutor=self.tutor, planned_sessions=5, start_date=MONDAY
            )
        self.assertIn('does not teach', str(ctx.exception))

    def test_one_active_per_student_and_subject(self):
        pupil = student()
        subject = subject_with_topics(teachers=[self.tutor])
        with at(WEDNESDAY):
            book(self.admin, self.tutor, the_student=pupil, the_subject=subject)
            with self.assertRaises(ValidationError):
                book(self.admin, self.tutor, [slot(1, '09:00', '10:00')], the_student=pupil, the_subject=subject)

    def test_own_slots_may_not_overlap(self):
        with at(WEDNESDAY), self.assertRaises(ValidationError):
            book(self.admin, self.tutor, [slot(0, '16:00', '17:00'), slot(0, '16:30', '17:30')])

    def test_only_staff(self):
        with at(WEDNESDAY), self.assertRaises(PermissionDenied):
            book(self.tutor.user, self.tutor)

    def test_tutor_cannot_change_once_sessions_are_logged(self):
        with at(MONDAY, time(9)):
            ss = book(self.admin, self.tutor)
        with at(MONDAY, time(17, 30)):
            held(ss.sessions.first(), self.tutor.user)
        other = tutor('Ms Phiri')
        student_subjects.TutorSubject.objects.create(tutor=other, subject=ss.subject)
        with self.assertRaises(ValidationError) as ctx:
            student_subjects.update_student_subject(ss, self.admin, {'tutor': other})
        self.assertIn('create a new one', str(ctx.exception))

    def test_planned_cannot_go_below_held(self):
        with at(MONDAY, time(9)):
            ss = book(self.admin, self.tutor)
        with at(MONDAY, time(17, 30)):
            held(ss.sessions.first(), self.tutor.user)
            with self.assertRaises(ValidationError):
                student_subjects.update_student_subject(ss, self.admin, {'planned_sessions': 0})

    def test_cancelling_removes_future_sessions_only(self):
        with at(MONDAY, time(9)):
            ss = book(self.admin, self.tutor, planned=4)
        with at(MONDAY, time(17, 30)):
            held(ss.sessions.first(), self.tutor.user)
            student_subjects.update_student_subject(ss, self.admin, {'status': 'CANCELLED'})
        self.assertEqual([s.status for s in ss.sessions.all()], [SessionStatus.HELD])


class ClashTests(TestCase):
    def setUp(self):
        self.admin = user(Role.ADMIN)
        self.tutor = tutor('Mr Banda')
        self.physics = subject_with_topics('Physics', teachers=[self.tutor])
        with at(WEDNESDAY):
            self.first = book(self.admin, self.tutor, [slot(0, '16:00', '17:00')], the_subject=self.physics)

    def test_overlapping_weekly_slot_is_flagged_in_plain_words(self):
        with at(WEDNESDAY), self.assertRaises(clashes.BookingConflict) as ctx:
            book(self.admin, self.tutor, [slot(0, '16:30', '17:30')])
        warning = ctx.exception.warnings[0]
        self.assertEqual(warning.code, clashes.CLASH)
        self.assertIn('Mr Banda already teaches IGCSE Physics', warning.message)
        self.assertIn('on Monday 16:00 to 17:00', warning.message)

    def test_touching_edges_are_not_a_clash(self):
        with at(WEDNESDAY):
            book(self.admin, self.tutor, [slot(0, '17:00', '18:00')])

    def test_admin_can_override(self):
        with at(WEDNESDAY):
            ss = book(self.admin, self.tutor, [slot(0, '16:00', '17:00')], allow_clash=True)
        self.assertTrue(ss.sessions.exists())

    def test_another_tutor_at_the_same_time_is_fine(self):
        with at(WEDNESDAY):
            book(self.admin, tutor('Ms Phiri'), [slot(0, '16:00', '17:00')])

    def test_outside_working_hours_is_a_warning(self):
        evening = tutor('Ms Evening', hours=((0, '14:00', '18:00'),))
        with at(WEDNESDAY), self.assertRaises(clashes.BookingConflict) as ctx:
            book(self.admin, evening, [slot(0, '17:30', '18:30')])
        self.assertEqual([w.code for w in ctx.exception.warnings], [clashes.OUTSIDE_WORKING_HOURS])
        with at(WEDNESDAY), self.assertRaises(clashes.BookingConflict) as ctx:
            book(self.admin, evening, [slot(2, '15:00', '16:00')])
        self.assertIn('has no working hours on Wednesday', ctx.exception.message)

    def test_dated_clash_with_a_session(self):
        with at(WEDNESDAY):
            found = clashes.find_clashes(self.tutor, date(2026, 11, 23), time(16, 30), time(17, 30))
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].session.date, date(2026, 11, 23))

    def test_reserved_slot_beyond_generated_sessions_still_clashes(self):
        far = date(2027, 3, 1)  # a Monday well past the generated horizon
        found = clashes.find_clashes(self.tutor, far, time(16), time(17))
        self.assertEqual(len(found), 1)
        self.assertIsNotNone(found[0].slot)

    def test_cancelled_session_frees_that_day(self):
        with at(WEDNESDAY):
            target = self.first.sessions.first()
            changes.cancel_session(target, self.admin, 'Holiday')
            self.assertEqual(clashes.find_clashes(self.tutor, target.date, time(16), time(17)), [])

    def test_ended_student_subject_frees_the_slot_after_its_last_date(self):
        with at(WEDNESDAY):
            student_subjects.confirm_end(self.first, date(2026, 11, 23), self.admin)
            self.assertEqual(clashes.find_clashes(self.tutor, date(2026, 11, 30), time(16), time(17)), [])
            self.assertEqual(len(clashes.find_clashes(self.tutor, date(2026, 11, 23), time(16), time(17))), 1)
            # A new weekly booking from December does not clash.
            book(self.admin, self.tutor, [slot(0, '16:00', '17:00')], start=date(2026, 11, 30))


class LoggingTests(TestCase):
    """Done when: a tutor can log their own session within 24 hours of its
    end, cannot log another tutor's, cannot log before it starts, and is
    refused after 24 hours; admin can log it with a note."""

    def setUp(self):
        self.admin = user(Role.ADMIN)
        self.tutor = tutor()
        with at(MONDAY, time(9)):
            self.ss = book(self.admin, self.tutor)
        self.session = self.ss.sessions.first()  # Monday 16:00-17:00

    def test_tutor_logs_own_session_within_the_window(self):
        with at(TUESDAY, time(16, 59)):
            session_log.log_session(self.session, self.tutor.user, True, topic_ids=[self.ss.topics.first().pk])
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, SessionStatus.HELD)
        self.assertEqual(self.session.topics_covered.count(), 1)
        event = self.session.events.get()
        self.assertEqual((event.action, event.from_status, event.to_status), (SessionAction.LOG, 'SCHEDULED', 'HELD'))

    def test_tutor_may_log_once_it_has_started(self):
        with at(MONDAY, time(16, 0)):
            held(self.session, self.tutor.user)

    def test_tutor_cannot_log_before_it_starts(self):
        with at(MONDAY, time(15, 59)), self.assertRaises(ValidationError) as ctx:
            held(self.session, self.tutor.user)
        self.assertIn(session_log.NOT_STARTED, str(ctx.exception))

    def test_tutor_refused_after_24_hours(self):
        with at(TUESDAY, time(17, 1)), self.assertRaises(ValidationError) as ctx:
            held(self.session, self.tutor.user)
        self.assertIn('The logging window closed 24 hours after the session. Ask admin to log it.', str(ctx.exception))

    def test_tutor_cannot_log_another_tutors_session(self):
        other = tutor('Ms Phiri')
        with at(MONDAY, time(17, 30)), self.assertRaises(PermissionDenied):
            held(self.session, other.user)

    def test_admin_logs_after_the_window_with_a_note(self):
        with at(date(2026, 11, 25)):
            with self.assertRaises(ValidationError) as ctx:
                held(self.session, self.admin)
            self.assertIn('admin_note', ctx.exception.message_dict)
            session_log.log_session(self.session, self.admin, True, admin_note='Confirmed with parent')
        self.session.refresh_from_db()
        self.assertEqual((self.session.status, self.session.admin_note), (SessionStatus.HELD, 'Confirmed with parent'))

    def test_admin_correction_is_recorded(self):
        with at(MONDAY, time(17, 30)):
            held(self.session, self.tutor.user)
            session_log.log_session(self.session, self.admin, False, reason='No show', admin_note='Parent says no')
        actions = list(self.session.events.values_list('action', 'from_status', 'to_status'))
        self.assertEqual(actions, [('LOG', 'SCHEDULED', 'HELD'), ('CORRECT', 'HELD', 'NOT_HELD')])

    def test_tutor_cannot_relog(self):
        with at(MONDAY, time(17, 30)):
            held(self.session, self.tutor.user)
            with self.assertRaises(ValidationError) as ctx:
                session_log.log_session(self.session, self.tutor.user, False, reason='oops')
        self.assertIn(session_log.ALREADY_LOGGED, str(ctx.exception))

    def test_not_held_needs_a_reason(self):
        with at(MONDAY, time(17, 30)), self.assertRaises(ValidationError) as ctx:
            session_log.log_session(self.session, self.tutor.user, False)
        self.assertIn('reason', ctx.exception.message_dict)

    def test_topics_must_be_the_students(self):
        stranger = subject_with_topics().topics.first()
        with at(MONDAY, time(17, 30)), self.assertRaises(ValidationError):
            held(self.session, self.tutor.user, [stranger.pk])

    def test_the_session_row_is_locked(self):
        with at(MONDAY, time(17, 30)), mock.patch.object(
            Session.objects, 'select_for_update', wraps=Session.objects.select_for_update
        ) as lock:
            held(self.session, self.tutor.user)
        lock.assert_called()

    def test_plan_topics_tutor_or_staff_only_while_scheduled(self):
        topic = self.ss.topics.first()
        session_log.set_plan(self.session, self.tutor.user, [topic.pk])
        self.assertEqual(list(self.session.planned_topics.all()), [topic])
        with self.assertRaises(PermissionDenied):
            session_log.set_plan(self.session, tutor('Ms Phiri').user, [])
        with at(MONDAY, time(17, 30)):
            held(self.session, self.tutor.user)
        with self.assertRaises(ValidationError):
            session_log.set_plan(self.session, self.admin, [])


class ProgressTests(TestCase):
    """Done when: sessions remaining, topics covered and the expected end
    date update after each log, and a Not held pushes the end date back."""

    def setUp(self):
        self.admin = user(Role.ADMIN)
        self.tutor = tutor()
        with at(MONDAY, time(9)):
            # Mondays and Thursdays, 4 planned: 16, 19, 23, 26 Nov.
            self.ss = book(self.admin, self.tutor, [slot(0, '16:00', '17:00'), slot(3, '16:00', '17:00')], planned=4)
        self.topics = list(self.ss.topics.all())

    def prog(self, day, clock=time(18)):
        with at(day, clock):
            return progress.progress(self.ss)

    def test_starting_point(self):
        p = self.prog(MONDAY, time(9))
        self.assertEqual((p['held'], p['remaining'], p['topics_covered'], p['topics_total']), (0, 4, 0, 4))
        self.assertEqual(p['expected_end_date'], date(2026, 11, 26))
        self.assertFalse(p['needs_end_confirmation'])

    def test_held_updates_remaining_topics_and_hours(self):
        with at(MONDAY, time(17, 30)):
            held(self.ss.sessions.first(), self.tutor.user, [self.topics[0].pk, self.topics[1].pk])
        p = self.prog(MONDAY)
        self.assertEqual((p['held'], p['remaining'], p['topics_covered'], p['held_hours']), (1, 3, 2, 1.0))
        self.assertEqual(p['expected_end_date'], date(2026, 11, 26))

    def test_not_held_pushes_the_end_date_back(self):
        with at(MONDAY, time(17, 30)):
            session_log.log_session(self.ss.sessions.first(), self.tutor.user, False, reason='Ill')
        p = self.prog(MONDAY)
        self.assertEqual((p['held'], p['remaining'], p['not_held']), (0, 4, 1))
        self.assertEqual(p['expected_end_date'], date(2026, 11, 30))

    def test_end_date_is_projected_past_the_generated_sessions(self):
        with at(MONDAY, time(9)):
            student_subjects.update_student_subject(self.ss, self.admin, {'planned_sessions': 20})
        self.ss.refresh_from_db()
        p = self.prog(MONDAY, time(9))
        # 20 sessions twice a week from Mon 16 Nov: the 20th is Thu 21 Jan.
        self.assertEqual(p['expected_end_date'], date(2027, 1, 21))

    def test_a_move_is_respected_in_the_projection(self):
        with at(MONDAY, time(9)):
            last = self.ss.sessions.order_by('-date').first()  # Thu 26
            changes.move_session(last, self.admin, date(2026, 11, 27), '10:00', '11:00', 'Clash at school')
        p = self.prog(MONDAY, time(9))
        self.assertEqual(p['expected_end_date'], date(2026, 11, 27))

    def test_end_prompt_when_sessions_run_out(self):
        with at(date(2026, 11, 26), time(17, 30)):
            for session in self.ss.sessions.order_by('date'):
                session_log.log_session(session, self.admin, True, admin_note='bulk')
        p = self.prog(date(2026, 11, 26))
        self.assertEqual(p['remaining'], 0)
        self.assertTrue(p['needs_end_confirmation'])
        self.assertEqual(p['end_reason'], 'SESSIONS_USED')
        self.assertEqual(p['expected_end_date'], date(2026, 11, 26))

    def test_end_prompt_when_all_topics_are_covered(self):
        with at(MONDAY, time(17, 30)):
            held(self.ss.sessions.first(), self.tutor.user, [t.pk for t in self.topics])
        p = self.prog(MONDAY)
        self.assertTrue(p['needs_end_confirmation'])
        self.assertEqual(p['end_reason'], 'TOPICS_COVERED')

    def test_confirming_clears_the_prompt_and_frees_the_time_after(self):
        with at(MONDAY, time(17, 30)):
            held(self.ss.sessions.first(), self.tutor.user, [t.pk for t in self.topics])
            student_subjects.confirm_end(self.ss, MONDAY, self.admin)
        self.ss.refresh_from_db()
        self.assertEqual(self.ss.status, StudentSubjectStatus.ACTIVE)  # until Monday is over
        p = self.prog(MONDAY)
        self.assertFalse(p['needs_end_confirmation'])
        self.assertEqual(p['expected_end_date'], MONDAY)
        self.assertEqual(list(self.ss.sessions.values_list('status', flat=True)), [SessionStatus.HELD])
        with at(MONDAY, time(18)):
            free = availability.free_slots(self.tutor, date(2026, 11, 23))
        self.assertEqual(free[0]['free'], [{'start_time': '08:00', 'end_time': '20:00'}])

    def test_confirm_end_cannot_be_before_a_held_session(self):
        with at(MONDAY, time(17, 30)):
            held(self.ss.sessions.first(), self.tutor.user)
            with self.assertRaises(ValidationError):
                student_subjects.confirm_end(self.ss, date(2026, 11, 15), self.admin)

    def test_add_sessions_reopens(self):
        with at(MONDAY, time(17, 30)):
            student_subjects.confirm_end(self.ss, MONDAY, self.admin)
            student_subjects.add_sessions(self.ss, 2, self.admin)
        self.ss.refresh_from_db()
        self.assertEqual((self.ss.planned_sessions, self.ss.confirmed_end_date), (6, None))
        self.assertEqual(self.ss.sessions.filter(status=SessionStatus.SCHEDULED).count(), 6)


class ChangeTests(TestCase):
    """Done when: a tutor's move request changes nothing until approved;
    after approval the session shows at its new time, and a clashing move
    is flagged."""

    def setUp(self):
        self.admin = user(Role.ADMIN)
        self.tutor = tutor()
        with at(WEDNESDAY):
            self.ss = book(self.admin, self.tutor, planned=3)
        self.session = self.ss.sessions.first()  # Mon 23 Nov 16:00

    def request_move(self, day=date(2026, 11, 24), start='10:00', end='11:00'):
        return changes.request_session_change(
            self.session, self.tutor.user, 'MOVE', 'Exam at school', day, start, end
        )

    def test_request_changes_nothing_until_approved(self):
        with at(WEDNESDAY):
            change = self.request_move()
        self.session.refresh_from_db()
        self.assertEqual((self.session.status, self.session.date), (SessionStatus.SCHEDULED, date(2026, 11, 23)))
        self.assertEqual(change.status, SessionChangeStatus.PENDING)
        self.assertTrue(Notification.objects.filter(recipient=self.admin, link=messages.STAFF_SESSION_REQUESTS_LINK).exists())

        with at(WEDNESDAY):
            changes.approve_session_change(change, self.admin)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, SessionStatus.CANCELLED)
        new = self.session.moved_to.get()
        self.assertEqual((new.date, new.start_time, new.slot_id), (date(2026, 11, 24), time(10), None))
        change.refresh_from_db()
        self.assertEqual(change.status, SessionChangeStatus.APPROVED)
        self.assertEqual(
            Notification.objects.filter(recipient=self.tutor.user).latest('id').message,
            'Your request to move the Mon 23 Nov 16:00 session was approved.',
        )
        # The plan budget is unchanged: still 3 to come.
        self.assertEqual(self.ss.sessions.filter(status=SessionStatus.SCHEDULED).count(), 3)

    def test_clashing_move_is_flagged_for_the_tutor(self):
        with at(WEDNESDAY):
            book(self.admin, self.tutor, [slot(1, '10:00', '11:00')])
            with self.assertRaises(clashes.BookingConflict):
                self.request_move()

    def test_clash_at_approval_is_flagged_and_admin_can_override(self):
        with at(WEDNESDAY):
            change = self.request_move()
            book(self.admin, self.tutor, [slot(1, '10:30', '11:30')])
            with self.assertRaises(clashes.BookingConflict):
                changes.approve_session_change(change, self.admin)
            change.refresh_from_db()
            self.assertEqual(change.status, SessionChangeStatus.PENDING)
            changes.approve_session_change(change, self.admin, allow_clash=True)
        change.refresh_from_db()
        self.assertEqual(change.status, SessionChangeStatus.APPROVED)

    def test_rejection_keeps_the_session_and_sends_a_short_message(self):
        reason = 'We cannot find a room that day. ' * 20
        with at(WEDNESDAY):
            change = self.request_move()
            changes.reject_session_change(change, self.admin, reason)
        change.refresh_from_db()
        self.assertEqual((change.status, change.reject_reason), (SessionChangeStatus.REJECTED, reason.strip()))
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, SessionStatus.SCHEDULED)
        note = Notification.objects.filter(recipient=self.tutor.user).latest('id')
        self.assertEqual(
            note.message,
            'Your request to move the Mon 23 Nov 16:00 session was not approved. Open My Timetable for the reason.',
        )

    def test_one_pending_request_per_session(self):
        with at(WEDNESDAY):
            self.request_move()
            with self.assertRaises(ValidationError):
                changes.request_session_change(self.session, self.tutor.user, 'CANCEL', 'Ill')

    def test_only_own_future_sessions(self):
        with at(WEDNESDAY), self.assertRaises(PermissionDenied):
            changes.request_session_change(self.session, tutor('Ms Phiri').user, 'CANCEL', 'x')
        with at(date(2026, 11, 23), time(16, 30)), self.assertRaises(ValidationError):
            changes.request_session_change(self.session, self.tutor.user, 'CANCEL', 'Late notice')

    def test_cancel_request_then_approval_adds_one_at_the_end(self):
        with at(WEDNESDAY):
            change = changes.request_session_change(self.session, self.tutor.user, 'CANCEL', 'Family event')
            changes.approve_session_change(change, self.admin)
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, SessionStatus.CANCELLED)
        self.assertEqual(self.ss.sessions.filter(status=SessionStatus.SCHEDULED).count(), 3)

    def test_withdraw(self):
        with at(WEDNESDAY):
            change = self.request_move()
            changes.withdraw_session_change(change, self.tutor.user)
        change.refresh_from_db()
        self.assertEqual(change.status, SessionChangeStatus.CANCELLED)

    def test_direct_move_records_history_and_tells_the_tutor(self):
        with at(WEDNESDAY):
            new, _ = changes.move_session(self.session, self.admin, date(2026, 11, 25), '09:00', '10:00', 'Room')
        self.assertEqual(new.moved_from, self.session)
        self.assertEqual(self.session.events.get().action, SessionAction.MOVE)
        self.assertEqual(new.events.get().action, SessionAction.MOVE)
        self.assertEqual(
            Notification.objects.filter(recipient=self.tutor.user).latest('id').message,
            'Your Mon 23 Nov 16:00 session was moved to Wed 25 Nov 09:00.',
        )

    def test_logging_withdraws_a_pending_request(self):
        with at(WEDNESDAY):
            change = changes.request_session_change(self.session, self.tutor.user, 'CANCEL', 'x')
        with at(date(2026, 11, 23), time(17, 30)):
            held(self.session, self.tutor.user)
        change.refresh_from_db()
        self.assertEqual(change.status, SessionChangeStatus.CANCELLED)
        self.assertFalse(SessionChangeRequest.objects.filter(status=SessionChangeStatus.PENDING).exists())


class FreeSlotTests(TestCase):
    def setUp(self):
        self.admin = user(Role.ADMIN)

    def free(self, the_tutor, weekday=0):
        with at(WEDNESDAY):
            return availability.free_slots(the_tutor, date(2026, 11, 23))[weekday]['free']

    def test_no_sessions_is_all_working_hours(self):
        t = tutor(hours=((0, '14:00', '17:00'),))
        self.assertEqual(self.free(t), [{'start_time': '14:00', 'end_time': '17:00'}])
        self.assertEqual(self.free(t, 1), [])

    def test_session_at_the_edges(self):
        t = tutor(hours=((0, '14:00', '17:00'),))
        with at(WEDNESDAY):
            book(self.admin, t, [slot(0, '14:00', '15:00'), slot(0, '16:00', '17:00')])
        self.assertEqual(self.free(t), [{'start_time': '15:00', 'end_time': '16:00'}])

    def test_back_to_back(self):
        t = tutor(hours=((0, '14:00', '17:00'),))
        with at(WEDNESDAY):
            book(self.admin, t, [slot(0, '14:00', '15:00'), slot(0, '15:00', '16:00')])
        self.assertEqual(self.free(t), [{'start_time': '16:00', 'end_time': '17:00'}])

    def test_split_working_hours(self):
        t = tutor(hours=((0, '08:00', '12:00'), (0, '14:00', '17:00')))
        with at(WEDNESDAY):
            book(self.admin, t, [slot(0, '10:00', '11:00')])
        self.assertEqual(
            self.free(t),
            [
                {'start_time': '08:00', 'end_time': '10:00'},
                {'start_time': '11:00', 'end_time': '12:00'},
                {'start_time': '14:00', 'end_time': '17:00'},
            ],
        )

    def test_session_partly_outside_working_hours(self):
        t = tutor(hours=((0, '14:00', '17:00'),))
        with at(WEDNESDAY):
            book(self.admin, t, [slot(0, '13:00', '14:30')], allow_clash=True)
        self.assertEqual(self.free(t), [{'start_time': '14:30', 'end_time': '17:00'}])

    def test_cancelled_session_frees_its_time(self):
        t = tutor(hours=((0, '14:00', '17:00'),))
        with at(WEDNESDAY):
            ss = book(self.admin, t, [slot(0, '15:00', '16:00')])
            changes.cancel_session(ss.sessions.first(), self.admin, 'Holiday')
        self.assertEqual(self.free(t), [{'start_time': '14:00', 'end_time': '17:00'}])


class HoursTests(TestCase):
    def setUp(self):
        self.admin = user(Role.ADMIN)

    def test_monthly_held_hours_and_estimate(self):
        t = tutor(rate='6000.00')
        with at(date(2026, 10, 26), time(9)):
            # Mondays 16:00-17:30 (1.5h): Oct 26, Nov 2, 9, 16, 23, 30.
            ss = book(self.admin, t, [slot(0, '16:00', '17:30')], planned=10, start=date(2026, 10, 26))
            # Sessions are only ever generated ahead, never backfilled.
            generation.generate_sessions(until=date(2026, 12, 1))
        with at(date(2026, 12, 1)):
            for session in ss.sessions.filter(date__lte=date(2026, 11, 30)).order_by('date'):
                if session.date == date(2026, 11, 9):
                    session_log.log_session(session, self.admin, False, reason='Ill', admin_note='x')
                else:
                    session_log.log_session(session, self.admin, True, admin_note='x')
            result = hours.tutor_hours(t, date(2026, 11, 1))
        # November: 2, 16, 23, 30 held (9th not held) = 4 x 90 min = 6h.
        self.assertEqual(result['sessions_held'], 4)
        self.assertEqual(result['minutes'], 360)
        self.assertEqual(result['hours'], Decimal('6.00'))
        self.assertEqual(result['estimated_amount'], Decimal('36000.00'))
        self.assertTrue(result['is_estimate'])
        october = hours.tutor_hours(t, date(2026, 10, 1))
        self.assertEqual((october['sessions_held'], october['estimated_amount']), (1, Decimal('9000.00')))

    def test_no_rate_means_no_estimate(self):
        t = tutor(rate=None)
        self.assertIsNone(hours.tutor_hours(t, date(2026, 11, 1))['estimated_amount'])

    def test_odd_minutes_round_to_the_cent(self):
        t = tutor(rate='1000.00')
        with at(MONDAY, time(9)):
            ss = book(self.admin, t, [slot(0, '16:00', '16:20')])
        with at(MONDAY, time(17)):
            held(ss.sessions.first(), t.user)
            result = hours.tutor_hours(t, date(2026, 11, 1))
        self.assertEqual((result['hours'], result['estimated_amount']), (Decimal('0.33'), Decimal('333.33')))


class ReminderTests(TestCase):
    def setUp(self):
        self.admin = user(Role.ADMIN)
        self.tutor = tutor()
        with at(MONDAY, time(9)):
            self.ss = book(self.admin, self.tutor, [slot(0, '14:00', '15:00'), slot(0, '16:00', '17:00')])

    def test_lists_unlogged_sessions_once_a_day(self):
        with at(MONDAY, time(20)):
            self.assertEqual(reminders.remind_unlogged_sessions(), 1)
            self.assertEqual(reminders.remind_unlogged_sessions(), 0)
        note = Notification.objects.get(recipient=self.tutor.user)
        self.assertEqual(
            note.message, 'You have 2 unlogged sessions: Mon 16 Nov 14:00, Mon 16 Nov 16:00. Log each within 24 hours of its end.'
        )

    def test_logged_and_missed_sessions_are_not_listed(self):
        with at(MONDAY, time(20)):
            held(self.ss.sessions.first(), self.tutor.user)
            reminders.remind_unlogged_sessions()
        self.assertIn('1 unlogged session:', Notification.objects.get().message)
        with at(date(2026, 11, 18), time(20)):
            self.assertEqual(reminders.remind_unlogged_sessions(), 0)


class MessageLengthTests(TestCase):
    """Every notification fits 255 characters by design, even with the
    longest names the database allows."""

    def test_longest_inputs_fit(self):
        admin = user(Role.ADMIN)
        long_name = 'N' * 255
        t = tutor(long_name)
        subject = subject_with_topics('S' * 100, teachers=[t])
        with at(WEDNESDAY):
            ss = book(admin, t, the_subject=subject, the_student=student('P' * 120), planned=30)
        sessions = list(ss.sessions.all())
        texts = [
            messages.change_requested(t, sessions[0], 'MOVE'),
            messages.change_approved(sessions[0], 'CANCEL'),
            messages.change_rejected(sessions[0], 'MOVE'),
            messages.session_moved(sessions[0], sessions[1]),
            messages.session_cancelled(sessions[0]),
            messages.unlogged_reminder(sessions * 10),
        ]
        for text in texts:
            self.assertLessEqual(len(text), 255, text)
        self.assertIn('and 36 more', texts[-1])
        with at(WEDNESDAY), self.assertRaises(clashes.BookingConflict) as ctx:
            book(admin, t, the_subject=subject)
        self.assertLess(len(ctx.exception.message), 400)

    def test_slot_rows_are_kept_on_their_table(self):
        # Sanity: the old one-slot-per-subject table is gone.
        self.assertEqual(TimetableSlot._meta.db_table, 'academics_timetableslot')
        self.assertIn('student_subject', [f.name for f in TimetableSlot._meta.fields])
