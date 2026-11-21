from datetime import date, time
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APITestCase

from academics.models import Session, SessionStatus
from accounts.models import Role
from core.models import Notification

from .scheduling_helpers import MONDAY, WEDNESDAY, at, book, slot, student, subject_with_topics, tutor, user


class ApiBase(APITestCase):
    def setUp(self):
        self.admin = user(Role.ADMIN)
        self.tutor = tutor('Mr Banda')
        self.other = tutor('Ms Phiri')
        self.subject = subject_with_topics('Physics', teachers=[self.tutor, self.other])
        self.pupil = student('Takondwa Banda')

    def as_(self, who):
        self.client.force_authenticate(who)

    def create(self, **overrides):
        body = {
            'student': self.pupil.pk,
            'subject': self.subject.pk,
            'tutor': self.tutor.pk,
            'planned_sessions': 24,
            'session_minutes': 60,
            'mode': 'IN_PERSON',
            'start_date': '2026-11-16',
            'slots': [slot(0, '16:00', '17:00'), slot(3, '16:00', '17:00')],
        }
        body.update(overrides)
        return self.client.post('/api/student-subjects/', body, format='json')


class StudentSubjectApiTests(ApiBase):
    def test_admin_creates_with_two_slots_and_sessions_show_on_timetable_and_student_page(self):
        self.as_(self.admin)
        with at(WEDNESDAY):
            resp = self.create()
            self.assertEqual(resp.status_code, 201, resp.data)
            self.assertEqual([s['weekday'] for s in resp.data['slots']], [0, 3])
            self.assertEqual(resp.data['progress']['topics_total'], 4)
            self.assertEqual(resp.data['progress']['remaining'], 24)

            week = self.client.get('/api/sessions/?from=2026-11-23&to=2026-11-29')
            self.assertEqual(week.status_code, 200)
            self.assertEqual([(s['date'], s['start_time']) for s in week.data], [('2026-11-23', '16:00'), ('2026-11-26', '16:00')])
            self.assertEqual(week.data[0]['student']['name'], 'Takondwa Banda')
            self.assertEqual(week.data[0]['display_status'], 'SCHEDULED')

            page = self.client.get(f'/api/students/{self.pupil.pk}/subjects/')
            self.assertEqual(page.status_code, 200)
            self.assertEqual(page.data[0]['subject']['display_name'], 'IGCSE Physics')
            self.assertEqual(page.data[0]['tutor']['name'], 'Mr Banda')

    def test_double_booking_is_a_409_and_admin_can_override(self):
        self.as_(self.admin)
        with at(WEDNESDAY):
            self.create()
            other_subject = subject_with_topics('Chemistry', teachers=[self.tutor])
            resp = self.create(subject=other_subject.pk, slots=[slot(0, '16:30', '17:30')])
            self.assertEqual(resp.status_code, 409)
            self.assertEqual(resp.data['code'], 'BOOKING_CONFLICT')
            self.assertTrue(resp.data['can_override'])
            self.assertEqual(resp.data['warnings'][0]['code'], 'CLASH')
            self.assertIn('Mr Banda already teaches IGCSE Physics (Takondwa Banda) on Monday 16:00 to 17:00.', resp.data['detail'])
            resp = self.create(subject=other_subject.pk, slots=[slot(0, '16:30', '17:30')], allow_clash=True)
            self.assertEqual(resp.status_code, 201)

    def test_tutor_cannot_create_and_sees_only_their_own(self):
        with at(WEDNESDAY):
            mine = book(self.admin, self.tutor, the_subject=self.subject)
            theirs = book(self.admin, self.other, [slot(1, '10:00', '11:00')])
        self.as_(self.tutor.user)
        self.assertEqual(self.create().status_code, 403)
        with at(WEDNESDAY):
            listed = self.client.get('/api/student-subjects/')
        self.assertEqual([r['id'] for r in listed.data], [mine.pk])
        self.assertEqual(self.client.get(f'/api/student-subjects/{theirs.pk}/').status_code, 404)
        self.assertEqual(self.client.patch(f'/api/student-subjects/{mine.pk}/', {'planned_sessions': 3}, format='json').status_code, 403)
        self.assertEqual(self.client.get(f'/api/students/{self.pupil.pk}/subjects/').status_code, 403)

    def test_slots_endpoints(self):
        self.as_(self.admin)
        with at(WEDNESDAY):
            ss_id = self.create().data['id']
            resp = self.client.post(f'/api/student-subjects/{ss_id}/slots/', slot(4, '09:00', '10:00'), format='json')
            self.assertEqual(resp.status_code, 201)
            slot_id = [s for s in resp.data['slots'] if s['weekday'] == 4][0]['id']
            resp = self.client.patch(f'/api/slots/{slot_id}/', {'start_time': '10:00', 'end_time': '11:00'}, format='json')
            self.assertEqual(resp.status_code, 200)
            self.assertIn('10:00', [s['start_time'] for s in resp.data['slots']])
            self.assertEqual(self.client.delete(f'/api/slots/{slot_id}/').status_code, 204)
            self.assertFalse(Session.objects.filter(slot_id=slot_id).exists())

    def test_confirm_end_and_add_sessions(self):
        self.as_(self.admin)
        with at(WEDNESDAY):
            ss_id = self.create(planned_sessions=2).data['id']
            resp = self.client.post(f'/api/student-subjects/{ss_id}/confirm-end/', {'last_date': '2026-11-23'}, format='json')
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.data['confirmed_end_date'], '2026-11-23')
            resp = self.client.post(f'/api/student-subjects/{ss_id}/add-sessions/', {'count': 4}, format='json')
            self.assertEqual((resp.data['planned_sessions'], resp.data['confirmed_end_date']), (6, None))


class SessionApiTests(ApiBase):
    def setUp(self):
        super().setUp()
        with at(MONDAY, time(9)):
            self.ss = book(self.admin, self.tutor, the_subject=self.subject, the_student=self.pupil)
        self.session = self.ss.sessions.first()  # Mon 16 Nov 16:00
        self.url = f'/api/sessions/{self.session.pk}/'

    def test_tutor_logs_within_window_with_topics(self):
        self.as_(self.tutor.user)
        topic = self.ss.topics.first()
        with at(MONDAY, time(17, 30)):
            detail = self.client.get(self.url)
            self.assertEqual(detail.data['display_status'], 'UNLOGGED')
            self.assertTrue(detail.data['can_log'])
            resp = self.client.post(self.url + 'log/', {'held': True, 'topic_ids': [topic.pk]}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual((resp.data['status'], resp.data['topics_covered']), ('HELD', [topic.pk]))
        self.assertEqual(resp.data['events'][0]['action'], 'LOG')

    def test_tutor_refused_after_24_hours_with_a_clear_message(self):
        self.as_(self.tutor.user)
        with at(date(2026, 11, 17), time(17, 1)):
            self.assertFalse(self.client.get(self.url).data['can_log'])
            self.assertEqual(self.client.get(self.url).data['display_status'], 'MISSED')
            resp = self.client.post(self.url + 'log/', {'held': True}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['detail'], ['The logging window closed 24 hours after the session. Ask admin to log it.'])

    def test_tutor_cannot_log_before_start(self):
        self.as_(self.tutor.user)
        with at(MONDAY, time(15)):
            resp = self.client.post(self.url + 'log/', {'held': True}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_another_tutor_gets_404(self):
        self.as_(self.other.user)
        with at(MONDAY, time(17, 30)):
            self.assertEqual(self.client.post(self.url + 'log/', {'held': True}, format='json').status_code, 404)
            self.assertEqual(self.client.get(self.url).status_code, 404)
            listed = self.client.get('/api/sessions/?from=2026-11-16&to=2026-11-22')
            self.assertEqual(listed.data, [])
            # A filter cannot widen what a tutor sees.
            listed = self.client.get(f'/api/sessions/?from=2026-11-16&to=2026-11-22&tutor={self.tutor.pk}')
            self.assertEqual(listed.data, [])

    def test_admin_logs_late_with_note(self):
        self.as_(self.admin)
        with at(date(2026, 11, 20)):
            resp = self.client.post(self.url + 'log/', {'held': False, 'reason': 'No show'}, format='json')
            self.assertEqual(resp.status_code, 400)
            self.assertIn('admin_note', resp.data)
            resp = self.client.post(
                self.url + 'log/', {'held': False, 'reason': 'No show', 'admin_note': 'Parent called'}, format='json'
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'NOT_HELD')

    def test_plan_topics(self):
        self.as_(self.tutor.user)
        topic = self.ss.topics.first()
        resp = self.client.put(self.url + 'plan/', {'topic_ids': [topic.pk]}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['planned_topics'], [topic.pk])
        self.assertEqual(resp.data['planned_topic_names'], [topic.name])

    def test_range_validation(self):
        self.as_(self.admin)
        self.assertEqual(self.client.get('/api/sessions/').status_code, 400)
        self.assertEqual(self.client.get('/api/sessions/?from=2026-11-16&to=2026-11-10').status_code, 400)
        self.assertEqual(self.client.get('/api/sessions/?from=2026-01-01&to=2026-12-31').status_code, 400)

    def test_move_request_flow(self):
        with at(WEDNESDAY):
            target = self.ss.sessions.filter(date__gt=WEDNESDAY).first()  # Mon 23 Nov
            self.as_(self.tutor.user)
            resp = self.client.post(
                f'/api/sessions/{target.pk}/change-requests/',
                {'kind': 'MOVE', 'reason': 'School trip', 'new_date': '2026-11-24', 'new_start_time': '10:00', 'new_end_time': '11:00'},
                format='json',
            )
            self.assertEqual(resp.status_code, 201, resp.data)
            self.assertEqual(resp.data['pending_request']['kind'], 'MOVE')
            self.assertEqual(resp.data['status'], 'SCHEDULED')

            mine = self.client.get('/api/session-change-requests/?status=PENDING')
            self.assertEqual(len(mine.data), 1)
            self.assertEqual(self.client.post(f'/api/session-change-requests/{mine.data[0]["id"]}/approve/').status_code, 403)

            self.as_(self.admin)
            queue = self.client.get('/api/session-change-requests/?status=PENDING')
            self.assertEqual(queue.data[0]['current']['start_time'], '16:00')
            self.assertEqual(queue.data[0]['new_start_time'], '10:00')
            resp = self.client.post(f'/api/session-change-requests/{queue.data[0]["id"]}/approve/', {}, format='json')
            self.assertEqual(resp.status_code, 200, resp.data)
            self.assertEqual(resp.data['status'], 'APPROVED')

            week = self.client.get('/api/sessions/?from=2026-11-23&to=2026-11-29').data
        by_date = {(s['date'], s['display_status']) for s in week}
        self.assertIn(('2026-11-23', 'MOVED'), by_date)
        self.assertIn(('2026-11-24', 'SCHEDULED'), by_date)

    def test_tutor_clashing_move_is_409_without_override(self):
        with at(WEDNESDAY):
            book(self.admin, self.tutor, [slot(1, '10:00', '11:00')])
            target = self.ss.sessions.filter(date__gt=WEDNESDAY).first()
            self.as_(self.tutor.user)
            resp = self.client.post(
                f'/api/sessions/{target.pk}/change-requests/',
                {'kind': 'MOVE', 'reason': 'x', 'new_date': '2026-11-24', 'new_start_time': '10:00', 'new_end_time': '11:00'},
                format='json',
            )
        self.assertEqual(resp.status_code, 409)
        self.assertFalse(resp.data['can_override'])

    def test_reject_then_tutor_sees_reason(self):
        with at(WEDNESDAY):
            target = self.ss.sessions.filter(date__gt=WEDNESDAY).first()
            self.as_(self.tutor.user)
            self.client.post(f'/api/sessions/{target.pk}/change-requests/', {'kind': 'CANCEL', 'reason': 'Ill'}, format='json')
            change_id = self.client.get('/api/session-change-requests/').data[0]['id']
            self.as_(self.admin)
            self.assertEqual(self.client.post(f'/api/session-change-requests/{change_id}/reject/', {}, format='json').status_code, 400)
            self.client.post(f'/api/session-change-requests/{change_id}/reject/', {'reason': 'Exams week'}, format='json')
            self.as_(self.tutor.user)
            session = self.client.get(f'/api/sessions/{target.pk}/').data
        self.assertEqual(session['latest_request']['reject_reason'], 'Exams week')

    def test_staff_move_and_cancel_directly(self):
        self.as_(self.admin)
        with at(WEDNESDAY):
            future = list(self.ss.sessions.filter(date__gt=WEDNESDAY))
            resp = self.client.post(
                f'/api/sessions/{future[0].pk}/move/',
                {'new_date': '2026-11-25', 'new_start_time': '09:00', 'new_end_time': '10:00', 'reason': 'Room'},
                format='json',
            )
            self.assertEqual(resp.status_code, 201, resp.data)
            self.assertEqual(resp.data['moved_from_detail']['id'], future[0].pk)
            resp = self.client.post(f'/api/sessions/{future[1].pk}/cancel/', {'reason': 'Holiday'}, format='json')
            self.assertEqual(resp.data['status'], 'CANCELLED')
        self.as_(self.tutor.user)
        self.assertEqual(self.client.post(f'/api/sessions/{future[2].pk}/cancel/', {'reason': 'x'}, format='json').status_code, 403)


class TutorEndpointsTests(ApiBase):
    def test_free_slots_and_hours_for_self_or_staff_only(self):
        with at(WEDNESDAY):
            book(self.admin, self.tutor, the_subject=self.subject)
            self.as_(self.tutor.user)
            free = self.client.get(f'/api/tutors/{self.tutor.pk}/free-slots/?week=2026-11-25')
            self.assertEqual(free.status_code, 200)
            self.assertEqual(free.data['week_start'], date(2026, 11, 23))
            self.assertEqual(
                free.data['days'][0]['free'],
                [{'start_time': '08:00', 'end_time': '16:00'}, {'start_time': '17:00', 'end_time': '20:00'}],
            )
            hours = self.client.get(f'/api/tutors/{self.tutor.pk}/hours/?month=2026-11')
            self.assertEqual((hours.status_code, hours.data['sessions_held']), (200, 0))
            self.assertEqual(self.client.get(f'/api/tutors/{self.other.pk}/hours/').status_code, 404)
            self.assertEqual(self.client.get(f'/api/tutors/{self.tutor.pk}/hours/?month=Nov').status_code, 400)
            self.as_(self.admin)
            self.assertEqual(self.client.get(f'/api/tutors/{self.other.pk}/free-slots/').status_code, 200)


class CommandTests(TestCase):
    def test_generate_and_remind_commands(self):
        admin = user(Role.ADMIN)
        t = tutor()
        with at(MONDAY, time(9)):
            ss = book(admin, t, planned=20)
        Session.objects.filter(student_subject=ss, date__gt=MONDAY).delete()
        out = StringIO()
        with at(MONDAY, time(20)):
            call_command('generate_sessions', '--weeks', '2', stdout=out)
            self.assertIn('Created 2 session(s)', out.getvalue())
            call_command('remind_unlogged_sessions', stdout=out)
            call_command('remind_unlogged_sessions', stdout=out)
        self.assertIn('Reminded 1 tutor(s).', out.getvalue())
        self.assertEqual(Notification.objects.filter(recipient=t.user).count(), 1)
        self.assertEqual(ss.sessions.filter(status=SessionStatus.SCHEDULED).count(), 3)
