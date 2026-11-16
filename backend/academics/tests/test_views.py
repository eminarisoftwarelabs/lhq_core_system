from rest_framework.test import APITestCase

from academics.models import Level, School, Subject, Topic
from academics.testing import make_subject
from accounts.models import Role, TutorProfile, User


def make_user(role, email=None, **kwargs):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(
        email=email, full_name=kwargs.pop('full_name', role.title()), role=role, **kwargs
    )


class SchoolListTests(APITestCase):
    """School.objects already has 6 rows from the 0004_seed_schools data
    migration by the time these tests run (migrations apply to the test
    database too) - names below are deliberately distinct from that seed
    list to avoid colliding with the unique constraint on name."""

    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor_user = make_user(Role.TUTOR)
        self.seeded_count = School.objects.count()
        School.objects.create(name='Zzz Test Academy')
        School.objects.create(name='Aaa Test Academy')
        School.objects.create(name='Old Defunct Test School', is_active=False)

    def test_requires_authentication(self):
        resp = self.client.get('/api/schools/')
        self.assertEqual(resp.status_code, 401)

    def test_lists_every_school_ordered_by_name(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/schools/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], self.seeded_count + 3)
        names = [row['name'] for row in resp.data['results']]
        self.assertEqual(names, sorted(names))

    def test_any_authenticated_role_can_list_schools(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get('/api/schools/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], self.seeded_count + 3)

    def test_is_active_filter(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/schools/?is_active=true')
        self.assertEqual(resp.data['count'], self.seeded_count + 2)
        resp = self.client.get('/api/schools/?is_active=false')
        self.assertEqual(resp.data['count'], 1)


class LevelListTests(APITestCase):
    def test_any_signed_in_user_gets_the_four_levels_unpaginated(self):
        self.client.force_authenticate(make_user(Role.TUTOR))
        resp = self.client.get('/api/levels/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([row['name'] for row in resp.data][2:], ['IGCSE', 'A Level'])
        self.assertEqual(resp.data[2]['year_groups'], [10, 11])

    def test_requires_authentication(self):
        self.assertEqual(self.client.get('/api/levels/').status_code, 401)


class SubjectListCreateTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor_user = make_user(Role.TUTOR, full_name='Tam Tutor')
        self.tutor_profile = TutorProfile.objects.create(user=self.tutor_user)
        self.other_tutor_user = make_user(Role.TUTOR, email='other@lhq.test', full_name='Olu Other')
        self.other_tutor_profile = TutorProfile.objects.create(user=self.other_tutor_user)
        self.igcse = Level.objects.get(name='IGCSE')
        self.a_level = Level.objects.get(name='A Level')

        self.own_subject = make_subject('Maths', tutors=[self.tutor_profile, self.other_tutor_profile])
        self.other_subject = make_subject('Physics', tutors=[self.other_tutor_profile], code='0625', has_paper=True)
        self.unassigned_subject = make_subject('Art', level=self.a_level)
        self.inactive_subject = make_subject('Old Subject', is_active=False)

    def _rows(self, user, query=''):
        self.client.force_authenticate(user)
        resp = self.client.get(f'/api/subjects/{query}')
        self.assertEqual(resp.status_code, 200)
        return {row['name']: row for row in resp.data['results']}

    def test_staff_rows_carry_level_code_paper_flag_and_tutors(self):
        rows = self._rows(self.owner)
        self.assertEqual(len(rows), 4)
        physics = rows['Physics']
        self.assertEqual(
            (physics['level'], physics['level_name'], physics['code'], physics['has_paper']),
            (self.igcse.id, 'IGCSE', '0625', True),
        )
        self.assertEqual(physics['tutors'], [{'id': self.other_tutor_profile.id, 'name': 'Olu Other'}])
        self.assertEqual([t['name'] for t in rows['Maths']['tutors']], ['Olu Other', 'Tam Tutor'])
        self.assertEqual(rows['Art']['tutors'], [])

    def test_tutor_sees_the_whole_catalog_but_never_who_teaches_it(self):
        rows = self._rows(self.tutor_user)
        self.assertEqual(set(rows), {'Maths', 'Physics', 'Art', 'Old Subject'})
        for row in rows.values():
            self.assertNotIn('tutors', row)
        self.assertNotIn('Olu Other', str(rows))

    def test_taught_by_me_marks_the_viewers_own_subjects(self):
        rows = self._rows(self.tutor_user)
        self.assertTrue(rows['Maths']['taught_by_me'])
        self.assertFalse(rows['Physics']['taught_by_me'])
        self.assertFalse(self._rows(self.owner)['Maths']['taught_by_me'])  # owner does not teach

    def test_mine_filter_returns_only_subjects_the_viewer_teaches(self):
        self.assertEqual(set(self._rows(self.tutor_user, '?mine=true')), {'Maths'})
        self.assertEqual(set(self._rows(make_user(Role.TUTOR, email='bare@lhq.test'), '?mine=true')), set())

    def test_taught_filter_returns_subjects_with_any_tutor_once_each(self):
        self.assertEqual(set(self._rows(self.owner, '?taught=true')), {'Maths', 'Physics'})
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get('/api/subjects/?taught=true').data['count'], 2)

    def test_level_filter(self):
        self.assertEqual(set(self._rows(self.owner, f'?level={self.a_level.id}')), {'Art'})
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get('/api/subjects/?level=abc').status_code, 400)

    def test_is_active_filter(self):
        self.assertEqual(set(self._rows(self.owner, '?is_active=true')), {'Maths', 'Physics', 'Art'})
        self.assertEqual(set(self._rows(self.owner, '?is_active=false')), {'Old Subject'})

    def test_staff_can_create_subject(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            '/api/subjects/', {'name': 'Geography', 'level': self.igcse.id, 'code': '0460'}, format='json'
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(Subject.objects.filter(name='Geography', level=self.igcse, code='0460').exists())

    def test_create_requires_a_level(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post('/api/subjects/', {'name': 'Geography'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('level', resp.data)

    def test_create_rejects_a_duplicate_name_at_the_same_level(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post('/api/subjects/', {'name': 'Physics', 'level': self.igcse.id}, format='json')
        self.assertEqual(resp.status_code, 400)
        resp = self.client.post('/api/subjects/', {'name': 'Physics', 'level': self.a_level.id}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_tutor_cannot_create_subject(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.post('/api/subjects/', {'name': 'Geography', 'level': self.igcse.id}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_create_with_timetable_slot(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            '/api/subjects/',
            {
                'name': 'French',
                'level': self.igcse.id,
                'timetable_slot': {'day_of_week': 2, 'start_time': '15:00', 'end_time': '16:00'},
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        subject = Subject.objects.get(name='French')
        self.assertEqual(subject.timetable_slot.day_of_week, 2)

    def test_create_rejects_invalid_timetable_slot(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            '/api/subjects/',
            {
                'name': 'Bad Slot',
                'level': self.igcse.id,
                'timetable_slot': {'day_of_week': 2, 'start_time': '16:00', 'end_time': '15:00'},
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_create_rejects_weekend_timetable_slot(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            '/api/subjects/',
            {
                'name': 'Saturday Club',
                'level': self.igcse.id,
                'timetable_slot': {'day_of_week': 5, 'start_time': '09:00', 'end_time': '10:00'},
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('day_of_week', resp.data['timetable_slot'])
        self.assertFalse(Subject.objects.filter(name='Saturday Club').exists())


class SubjectDetailTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor_user = make_user(Role.TUTOR)
        self.tutor_profile = TutorProfile.objects.create(user=self.tutor_user)
        self.other_tutor_profile = TutorProfile.objects.create(
            user=make_user(Role.TUTOR, email='other@lhq.test', full_name='Olu Other')
        )
        self.own_subject = make_subject('Maths', tutors=[self.tutor_profile])
        self.other_subject = make_subject('Physics', tutors=[self.other_tutor_profile])

    def test_staff_can_view_any_subject_with_its_tutors(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/subjects/{self.other_subject.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['tutors'], [{'id': self.other_tutor_profile.id, 'name': 'Olu Other'}])

    def test_tutor_can_view_any_catalog_subject_without_its_tutors(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get(f'/api/subjects/{self.other_subject.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn('tutors', resp.data)
        self.assertFalse(resp.data['taught_by_me'])
        self.assertTrue(self.client.get(f'/api/subjects/{self.own_subject.id}/').data['taught_by_me'])

    def test_unknown_subject_is_404(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get('/api/subjects/99999/').status_code, 404)

    def test_staff_can_patch_catalog_fields(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.patch(
            f'/api/subjects/{self.own_subject.id}/', {'code': '0580', 'has_paper': True}, format='json'
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.own_subject.refresh_from_db()
        self.assertEqual((self.own_subject.code, self.own_subject.has_paper), ('0580', True))
        self.assertIn('tutors', resp.data)

    def test_tutor_cannot_patch_a_subject_even_one_they_teach(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.patch(f'/api/subjects/{self.own_subject.id}/', {'name': 'Hacked'}, format='json')
        self.assertEqual(resp.status_code, 403)


class SubjectTopicsTests(APITestCase):
    def setUp(self):
        self.subject = make_subject('Mathematics', has_paper=True)
        Topic.objects.create(subject=self.subject, chapter='Number', number='1.1', name='Types of number', order=1)
        Topic.objects.create(
            subject=self.subject, chapter='Number', number='1.17', name='Exponential growth', extended_only=True, order=2
        )
        Topic.objects.create(subject=self.subject, chapter='Algebra', number='2.1', name='Introduction', order=3)
        self.other = make_subject('Physics')
        Topic.objects.create(subject=self.other, chapter='Motion', name='Speed', order=1)

    def test_topics_are_grouped_by_chapter_in_syllabus_order(self):
        self.client.force_authenticate(make_user(Role.TUTOR))
        resp = self.client.get(f'/api/subjects/{self.subject.id}/topics/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([c['chapter'] for c in resp.data], ['Number', 'Algebra'])
        number = resp.data[0]['topics']
        self.assertEqual([t['number'] for t in number], ['1.1', '1.17'])
        self.assertEqual([t['extended_only'] for t in number], [False, True])
        self.assertEqual(set(number[0]), {'id', 'number', 'name', 'extended_only', 'order'})

    def test_unknown_subject_is_404(self):
        self.client.force_authenticate(make_user(Role.OWNER))
        self.assertEqual(self.client.get('/api/subjects/99999/topics/').status_code, 404)

    def test_requires_authentication(self):
        self.assertEqual(self.client.get(f'/api/subjects/{self.subject.id}/topics/').status_code, 401)
