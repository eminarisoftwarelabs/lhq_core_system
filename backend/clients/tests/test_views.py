from datetime import date, timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from academics.testing import make_subject
from accounts.models import Role, TutorProfile, User
from clients.models import Guardianship, Parent, Student
from academics.models import StudentSubject
from academics.scheduling.student_subjects import create_student_subject
from accounts.models import WorkingHours
from django.db import connection
from django.test.utils import CaptureQueriesContext


def make_user(role, email=None, **kwargs):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(
        email=email, full_name=kwargs.pop('full_name', role.title()), role=role, **kwargs
    )


class StudentSearchTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor = make_user(Role.TUTOR)
        self.alice = Student.objects.create(student_number='STU-000001', full_name='Alice Wang', grade='7')
        self.bob = Student.objects.create(student_number='STU-000002', full_name='Bob Chen', grade='8')

    def test_search_by_name(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/?q=alice')
        self.assertEqual(resp.status_code, 200)
        names = {row['full_name'] for row in resp.data['results']}
        self.assertEqual(names, {'Alice Wang'})

    def test_search_by_student_number(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/?q=000002')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['full_name'], 'Bob Chen')

    def test_search_alias_path(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/search/?q=alice')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)

    def test_no_query_returns_everyone(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/')
        self.assertEqual(resp.data['count'], 2)

    def test_enrolled_on_defaults_to_today_and_is_listed(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/')
        self.assertEqual(resp.data['results'][0]['enrolled_on'], timezone.localdate().isoformat())

    def test_newest_enrolment_first_by_default_then_by_name(self):
        Student.objects.filter(pk=self.alice.pk).update(enrolled_on=date(2026, 9, 3))
        Student.objects.filter(pk=self.bob.pk).update(enrolled_on=date(2026, 10, 1))
        Student.objects.create(student_number='STU-000003', full_name='Cara Zulu', enrolled_on=date(2026, 10, 1))
        Student.objects.create(student_number='STU-000004', full_name='Ann Zulu', enrolled_on=date(2026, 10, 1))
        self.client.force_authenticate(self.owner)
        names = [r['full_name'] for r in self.client.get('/api/students/').data['results']]
        self.assertEqual(names, ['Ann Zulu', 'Bob Chen', 'Cara Zulu', 'Alice Wang'])
        oldest = [r['full_name'] for r in self.client.get('/api/students/?ordering=enrolled_on').data['results']]
        self.assertEqual(oldest[0], 'Alice Wang')
        by_name = [r['full_name'] for r in self.client.get('/api/students/?ordering=full_name').data['results']]
        self.assertEqual(by_name[0], 'Alice Wang')

    def test_search_keeps_the_enrolment_order(self):
        Student.objects.filter(pk=self.alice.pk).update(enrolled_on=date(2026, 9, 3))
        self.client.force_authenticate(self.owner)
        names = [r['full_name'] for r in self.client.get('/api/students/?q=n').data['results']]
        self.assertEqual(names, ['Bob Chen', 'Alice Wang'])

    def test_unknown_ordering_is_rejected(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get('/api/students/?ordering=grade').status_code, 400)

    def test_tutor_forbidden(self):
        self.client.force_authenticate(self.tutor)
        resp = self.client.get('/api/students/')
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_unauthorized(self):
        resp = self.client.get('/api/students/')
        self.assertEqual(resp.status_code, 401)


class StudentDetailTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.student = Student.objects.create(
            student_number='STU-000001',
            full_name='Alice Wang',
            year_group=7,
            school='Kamuzu Academy',
            phone='0888123456',
            email='alice@example.com',
            grade='7',
        )
        parent = Parent.objects.create(
            full_name='Wanjiru Wang', phone='0999', address='15 Chilobwe Road', city='Blantyre'
        )
        Guardianship.objects.create(student=self.student, parent=parent, is_primary_contact=True)

    def test_detail_includes_guardianships(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/students/{self.student.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['guardianships']), 1)
        self.assertEqual(resp.data['guardianships'][0]['parent']['full_name'], 'Wanjiru Wang')
        self.assertTrue(resp.data['guardianships'][0]['is_primary_contact'])
        self.assertEqual(resp.data['guardianships'][0]['parent']['address'], '15 Chilobwe Road')
        self.assertEqual(resp.data['guardianships'][0]['parent']['city'], 'Blantyre')

    def test_staff_can_change_enrolled_on_and_nothing_else(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.patch(
            f'/api/students/{self.student.id}/', {'enrolled_on': '2026-09-02', 'full_name': 'Hacked'}, format='json'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['enrolled_on'], '2026-09-02')
        self.assertEqual(resp.data['guardianships'][0]['parent']['full_name'], 'Wanjiru Wang')
        self.student.refresh_from_db()
        self.assertEqual(self.student.enrolled_on, date(2026, 9, 2))
        self.assertEqual(self.student.full_name, 'Alice Wang')

    def test_enrolled_on_cannot_be_in_the_future(self):
        self.client.force_authenticate(self.owner)
        future = (timezone.localdate() + timedelta(days=1)).isoformat()
        resp = self.client.patch(f'/api/students/{self.student.id}/', {'enrolled_on': future}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_a_tutor_cannot_edit_a_student(self):
        tutor = make_user(Role.TUTOR, email='t@lhq.test')
        self.client.force_authenticate(tutor)
        resp = self.client.patch(f'/api/students/{self.student.id}/', {'enrolled_on': '2026-09-02'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_put_is_not_allowed(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.put(f'/api/students/{self.student.id}/', {'enrolled_on': '2026-09-02'}, format='json')
        self.assertEqual(resp.status_code, 405)

    def test_detail_includes_year_group_school_and_contact_details(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/students/{self.student.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['year_group'], 7)
        self.assertEqual(resp.data['school'], 'Kamuzu Academy')
        self.assertEqual(resp.data['phone'], '0888123456')
        self.assertEqual(resp.data['email'], 'alice@example.com')


class SubjectRosterTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor_user = make_user(Role.TUTOR)
        self.tutor_profile = TutorProfile.objects.create(user=self.tutor_user, hourly_rate='5000.00')
        self.other_tutor_user = make_user(Role.TUTOR, email='other@lhq.test', full_name='Other Tutor')
        self.other_tutor_profile = TutorProfile.objects.create(user=self.other_tutor_user, hourly_rate='5000.00')
        for profile in (self.tutor_profile, self.other_tutor_profile):
            for weekday in range(5):
                WorkingHours.objects.create(tutor=profile, weekday=weekday, start_time='08:00', end_time='20:00')

        self.subject = make_subject('Maths', tutors=[self.tutor_profile, self.other_tutor_profile])
        self.student = Student.objects.create(student_number='STU-000001', full_name='Alice Wang', grade='7')
        self.other_student = Student.objects.create(student_number='STU-000002', full_name='Bob Chen', grade='8')
        self.mine = self.book(self.tutor_profile, self.student, weekday=0)
        self.theirs = self.book(self.other_tutor_profile, self.other_student, weekday=2)

    def book(self, tutor, student, weekday):
        link, _ = create_student_subject(
            self.owner,
            student=student,
            subject=self.subject,
            tutor=tutor,
            planned_sessions=6,
            start_date=date(2026, 11, 16),
            slots=[{'weekday': weekday, 'start_time': '16:00', 'end_time': '17:00'}],
        )
        return link

    def get(self, user):
        self.client.force_authenticate(user)
        return self.client.get(f'/api/subjects/{self.subject.id}/students/')

    def test_staff_sees_every_student_with_tutor_mode_and_weekly_times(self):
        resp = self.get(self.owner)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual({row['full_name'] for row in resp.data}, {'Alice Wang', 'Bob Chen'})
        alice = next(row for row in resp.data if row['full_name'] == 'Alice Wang')
        self.assertEqual(alice['student_subject_id'], self.mine.pk)
        self.assertEqual(alice['tutor'], {'id': self.tutor_profile.pk, 'name': self.tutor_user.full_name})
        self.assertEqual(alice['mode'], 'IN_PERSON')
        self.assertEqual(alice['slots'], [{'weekday': 0, 'start_time': '16:00', 'end_time': '17:00'}])
        self.assertEqual(alice['student_number'], 'STU-000001')

    def test_a_tutor_sees_only_their_own_students(self):
        resp = self.get(self.tutor_user)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([row['full_name'] for row in resp.data], ['Alice Wang'])
        resp = self.get(self.other_tutor_user)
        self.assertEqual([row['full_name'] for row in resp.data], ['Bob Chen'])

    def test_a_tutor_who_does_not_teach_the_subject_gets_404(self):
        stranger = make_user(Role.TUTOR, email='stranger@lhq.test')
        TutorProfile.objects.create(user=stranger)
        self.assertEqual(self.get(stranger).status_code, 404)

    def test_one_item_per_student_subject(self):
        science = make_subject('Physics', tutors=[self.tutor_profile])
        create_student_subject(
            self.owner, student=self.student, subject=science, tutor=self.tutor_profile,
            planned_sessions=6, start_date=date(2026, 11, 16),
            slots=[{'weekday': 1, 'start_time': '10:00', 'end_time': '11:00'}],
        )
        resp = self.get(self.owner)
        self.assertEqual(len(resp.data), 2)  # Physics is another subject's roster
        resp = self.client.get(f'/api/subjects/{science.id}/students/')
        self.assertEqual([row['student_subject_id'] for row in resp.data], [StudentSubject.objects.get(subject=science).pk])

    def test_ended_and_cancelled_student_subjects_are_left_out(self):
        StudentSubject.objects.filter(pk=self.mine.pk).update(status='ENDED')
        StudentSubject.objects.filter(pk=self.theirs.pk).update(status='CANCELLED')
        self.assertEqual(self.get(self.owner).data, [])

    def test_a_student_subject_created_from_the_api_appears_under_its_tutor(self):
        newcomer = Student.objects.create(student_number='STU-000003', full_name='Cara Phiri')
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            '/api/student-subjects/',
            {
                'student': newcomer.pk,
                'subject': self.subject.pk,
                'tutor': self.tutor_profile.pk,
                'planned_sessions': 6,
                'start_date': '2026-11-16',
                'slots': [{'weekday': 3, 'start_time': '09:00', 'end_time': '10:00'}],
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        roster = self.client.get(f'/api/subjects/{self.subject.id}/students/').data
        cara = next(row for row in roster if row['full_name'] == 'Cara Phiri')
        self.assertEqual(cara['tutor']['id'], self.tutor_profile.pk)
        self.assertEqual(cara['slots'][0]['weekday'], 3)

    def test_roster_is_a_fixed_number_of_queries(self):
        self.client.force_authenticate(self.owner)
        self.client.get(f'/api/subjects/{self.subject.id}/students/')  # warm caches
        with CaptureQueriesContext(connection) as few:
            self.client.get(f'/api/subjects/{self.subject.id}/students/')
        for i in range(4):
            extra = Student.objects.create(student_number=f'STU-1{i}', full_name=f'Extra {i}')
            self.book(self.tutor_profile, extra, weekday=i + 1)
        with CaptureQueriesContext(connection) as many:
            self.client.get(f'/api/subjects/{self.subject.id}/students/')
        self.assertEqual(len(few), len(many))
