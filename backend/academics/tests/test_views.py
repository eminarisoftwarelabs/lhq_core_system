from rest_framework.test import APITestCase

from academics.models import School, Subject, Topic
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


class SubjectListCreateTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor_user = make_user(Role.TUTOR)
        self.tutor_profile = TutorProfile.objects.create(user=self.tutor_user)
        self.other_tutor_user = make_user(Role.TUTOR, email='other@lhq.test')
        self.other_tutor_profile = TutorProfile.objects.create(user=self.other_tutor_user)

        self.own_subject = Subject.objects.create(name='Maths', tutor=self.tutor_profile)
        self.other_subject = Subject.objects.create(name='Physics', tutor=self.other_tutor_profile)
        self.unassigned_subject = Subject.objects.create(name='Art')
        self.inactive_subject = Subject.objects.create(name='Old Subject', is_active=False)

    def test_staff_sees_every_subject(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/subjects/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 4)

    def test_tutor_sees_only_their_own_subject(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get('/api/subjects/')
        self.assertEqual(resp.status_code, 200)
        names = {row['name'] for row in resp.data['results']}
        self.assertEqual(names, {'Maths'})

    def test_tutor_without_profile_sees_nothing(self):
        bare_tutor = make_user(Role.TUTOR, email='bare@lhq.test')
        self.client.force_authenticate(bare_tutor)
        resp = self.client.get('/api/subjects/')
        self.assertEqual(resp.data['count'], 0)

    def test_is_active_filter(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/subjects/?is_active=true')
        self.assertEqual(resp.data['count'], 3)
        resp = self.client.get('/api/subjects/?is_active=false')
        self.assertEqual(resp.data['count'], 1)

    def test_staff_can_create_subject(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post('/api/subjects/', {'name': 'Geography'}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(Subject.objects.filter(name='Geography').exists())

    def test_tutor_cannot_create_subject(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.post('/api/subjects/', {'name': 'Geography'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_create_with_timetable_slot(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            '/api/subjects/',
            {
                'name': 'French',
                'tutor': self.tutor_profile.id,
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
                'timetable_slot': {'day_of_week': 2, 'start_time': '16:00', 'end_time': '15:00'},
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400)


class SubjectDetailTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor_user = make_user(Role.TUTOR)
        self.tutor_profile = TutorProfile.objects.create(user=self.tutor_user)
        self.other_tutor_user = make_user(Role.TUTOR, email='other@lhq.test')
        self.other_tutor_profile = TutorProfile.objects.create(user=self.other_tutor_user)
        self.own_subject = Subject.objects.create(name='Maths', tutor=self.tutor_profile)
        self.other_subject = Subject.objects.create(name='Physics', tutor=self.other_tutor_profile)

    def test_staff_can_view_any_subject(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/subjects/{self.other_subject.id}/')
        self.assertEqual(resp.status_code, 200)

    def test_tutor_can_view_own_subject(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get(f'/api/subjects/{self.own_subject.id}/')
        self.assertEqual(resp.status_code, 200)

    def test_tutor_cannot_view_someone_elses_subject(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get(f'/api/subjects/{self.other_subject.id}/')
        self.assertEqual(resp.status_code, 404)

    def test_staff_can_patch_reassign_tutor(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.patch(
            f'/api/subjects/{self.own_subject.id}/', {'tutor': self.other_tutor_profile.id}, format='json'
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.own_subject.refresh_from_db()
        self.assertEqual(self.own_subject.tutor, self.other_tutor_profile)

    def test_tutor_cannot_patch_own_subject(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.patch(
            f'/api/subjects/{self.own_subject.id}/', {'name': 'Renamed'}, format='json'
        )
        self.assertEqual(resp.status_code, 403)


class TopicTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.subject = Subject.objects.create(name='History')

    def test_staff_can_add_topic(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(f'/api/subjects/{self.subject.id}/topics/', {'name': 'WWII'}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(Topic.objects.filter(subject=self.subject, name='WWII').exists())

    def test_list_topics_for_subject(self):
        Topic.objects.create(subject=self.subject, name='WWII')
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/subjects/{self.subject.id}/topics/')
        self.assertEqual(resp.data['count'], 1)

    def test_staff_can_patch_and_delete_topic(self):
        topic = Topic.objects.create(subject=self.subject, name='WWII')
        self.client.force_authenticate(self.owner)

        resp = self.client.patch(f'/api/topics/{topic.id}/', {'name': 'World War Two'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        topic.refresh_from_db()
        self.assertEqual(topic.name, 'World War Two')

        resp = self.client.delete(f'/api/topics/{topic.id}/')
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Topic.objects.filter(pk=topic.id).exists())

    def test_tutor_cannot_add_topic(self):
        tutor = make_user(Role.TUTOR)
        self.client.force_authenticate(tutor)
        resp = self.client.post(f'/api/subjects/{self.subject.id}/topics/', {'name': 'WWII'}, format='json')
        self.assertEqual(resp.status_code, 403)
