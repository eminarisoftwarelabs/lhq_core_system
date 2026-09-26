from datetime import date

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APITestCase

from academics.models import LessonPlan, Subject, Topic
from accounts.models import Role, TutorProfile, User

MONDAY = date(2026, 10, 5)
NEXT_MONDAY = date(2026, 10, 12)
WEEK_AFTER = date(2026, 10, 19)


def make_user(role, email=None):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(email=email, full_name=role.title(), role=role)


class LessonPlanModelTests(TestCase):
    def setUp(self):
        self.subject = Subject.objects.create(name='Maths')
        self.fractions = Topic.objects.create(subject=self.subject, name='Fractions')

    def test_week_start_must_be_a_monday(self):
        plan = LessonPlan(subject=self.subject, week_start=date(2026, 10, 7), topic=self.fractions)
        with self.assertRaises(ValidationError):
            plan.full_clean()

    def test_topic_must_belong_to_the_subject(self):
        other = Topic.objects.create(subject=Subject.objects.create(name='Physics'), name='Forces')
        plan = LessonPlan(subject=self.subject, week_start=MONDAY, topic=other)
        with self.assertRaises(ValidationError):
            plan.full_clean()

    def test_one_plan_per_subject_per_week(self):
        LessonPlan.objects.create(subject=self.subject, week_start=MONDAY, topic=self.fractions)
        duplicate = LessonPlan(subject=self.subject, week_start=MONDAY, topic=self.fractions)
        with self.assertRaises(ValidationError):
            duplicate.full_clean()


class LessonPlanApiTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor_user = make_user(Role.TUTOR)
        self.tutor = TutorProfile.objects.create(user=self.tutor_user)
        self.other_tutor_user = make_user(Role.TUTOR, email='other@lhq.test')
        self.other_tutor = TutorProfile.objects.create(user=self.other_tutor_user)

        self.maths = Subject.objects.create(name='Maths', tutor=self.tutor)
        self.physics = Subject.objects.create(name='Physics', tutor=self.other_tutor)
        self.fractions = Topic.objects.create(subject=self.maths, name='Fractions')
        self.decimals = Topic.objects.create(subject=self.maths, name='Decimals')
        self.forces = Topic.objects.create(subject=self.physics, name='Forces')

    def _put(self, subject, week, topic):
        return self.client.put(
            f'/api/subjects/{subject.id}/lesson-plans/{week.isoformat()}/',
            {'topic': topic.id if topic else None},
            format='json',
        )

    # -- set / change / clear ---------------------------------------------

    def test_tutor_plans_ahead_for_own_subject(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self._put(self.maths, NEXT_MONDAY, self.fractions)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['topic'], self.fractions.id)
        self.assertEqual(resp.data['topic_name'], 'Fractions')
        self.assertEqual(resp.data['week_start'], '2026-10-12')
        self.assertEqual(resp.data['updated_by_name'], 'Tutor')

    def test_changing_a_plan_updates_it_in_place(self):
        self.client.force_authenticate(self.tutor_user)
        self._put(self.maths, MONDAY, self.fractions)
        resp = self._put(self.maths, MONDAY, self.decimals)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(LessonPlan.objects.filter(subject=self.maths).count(), 1)
        self.assertEqual(LessonPlan.objects.get(subject=self.maths).topic, self.decimals)

    def test_null_topic_clears_the_plan(self):
        LessonPlan.objects.create(subject=self.maths, week_start=MONDAY, topic=self.fractions)
        self.client.force_authenticate(self.tutor_user)
        resp = self._put(self.maths, MONDAY, None)
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(LessonPlan.objects.exists())

    def test_clearing_a_week_with_no_plan_is_fine(self):
        self.client.force_authenticate(self.tutor_user)
        self.assertEqual(self._put(self.maths, MONDAY, None).status_code, 204)

    def test_staff_can_plan_any_subject(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self._put(self.physics, MONDAY, self.forces).status_code, 200)

    def test_tutor_cannot_plan_someone_elses_subject(self):
        self.client.force_authenticate(self.tutor_user)
        self.assertEqual(self._put(self.physics, MONDAY, self.forces).status_code, 404)
        self.assertFalse(LessonPlan.objects.exists())

    def test_rejects_a_topic_from_another_subject(self):
        self.client.force_authenticate(self.owner)
        resp = self._put(self.maths, MONDAY, self.forces)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('topic', resp.data)

    def test_rejects_a_week_that_does_not_start_on_monday(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.put(
            f'/api/subjects/{self.maths.id}/lesson-plans/2026-10-07/', {'topic': self.fractions.id}, format='json'
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('week_start', resp.data)

    def test_rejects_a_malformed_week(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.put(
            f'/api/subjects/{self.maths.id}/lesson-plans/next-week/', {'topic': self.fractions.id}, format='json'
        )
        self.assertEqual(resp.status_code, 400)

    # -- list ---------------------------------------------------------------

    def test_lists_plans_in_a_week_range(self):
        LessonPlan.objects.create(subject=self.maths, week_start=MONDAY, topic=self.fractions)
        LessonPlan.objects.create(subject=self.maths, week_start=NEXT_MONDAY, topic=self.decimals)
        LessonPlan.objects.create(subject=self.maths, week_start=WEEK_AFTER, topic=self.fractions)
        self.client.force_authenticate(self.owner)

        resp = self.client.get('/api/lesson-plans/?from=2026-10-05&to=2026-10-12')

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual([p['week_start'] for p in resp.data], ['2026-10-05', '2026-10-12'])

    def test_single_week_when_to_is_omitted(self):
        LessonPlan.objects.create(subject=self.maths, week_start=MONDAY, topic=self.fractions)
        LessonPlan.objects.create(subject=self.maths, week_start=NEXT_MONDAY, topic=self.decimals)
        self.client.force_authenticate(self.owner)

        resp = self.client.get('/api/lesson-plans/?from=2026-10-05')

        self.assertEqual([p['topic_name'] for p in resp.data], ['Fractions'])

    def test_tutor_only_sees_own_subjects_plans(self):
        LessonPlan.objects.create(subject=self.maths, week_start=MONDAY, topic=self.fractions)
        LessonPlan.objects.create(subject=self.physics, week_start=MONDAY, topic=self.forces)
        self.client.force_authenticate(self.tutor_user)

        resp = self.client.get('/api/lesson-plans/?from=2026-10-05')

        self.assertEqual([p['subject'] for p in resp.data], [self.maths.id])

    def test_list_requires_a_valid_from(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get('/api/lesson-plans/').status_code, 400)
        self.assertEqual(self.client.get('/api/lesson-plans/?from=soon').status_code, 400)

    def test_list_rejects_an_inverted_or_huge_range(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get('/api/lesson-plans/?from=2026-10-12&to=2026-10-05').status_code, 400)
        self.assertEqual(self.client.get('/api/lesson-plans/?from=2026-01-05&to=2027-06-07').status_code, 400)

    def test_requires_authentication(self):
        self.assertEqual(self.client.get('/api/lesson-plans/?from=2026-10-05').status_code, 401)

    # -- copy last week ---------------------------------------------------------

    def test_copy_week_fills_only_unplanned_subjects(self):
        LessonPlan.objects.create(subject=self.maths, week_start=MONDAY, topic=self.fractions)
        LessonPlan.objects.create(subject=self.physics, week_start=MONDAY, topic=self.forces)
        # Physics is already planned for next week - copying must not overwrite it.
        other_forces_topic = Topic.objects.create(subject=self.physics, name='Energy')
        LessonPlan.objects.create(subject=self.physics, week_start=NEXT_MONDAY, topic=other_forces_topic)
        self.client.force_authenticate(self.owner)

        resp = self.client.post(
            '/api/lesson-plans/copy-week/', {'from_week': '2026-10-05', 'to_week': '2026-10-12'}, format='json'
        )

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data, {'copied': 1, 'skipped': 1})
        self.assertEqual(LessonPlan.objects.get(subject=self.maths, week_start=NEXT_MONDAY).topic, self.fractions)
        self.assertEqual(LessonPlan.objects.get(subject=self.physics, week_start=NEXT_MONDAY).topic, other_forces_topic)

    def test_tutor_copy_week_only_touches_own_subjects(self):
        LessonPlan.objects.create(subject=self.maths, week_start=MONDAY, topic=self.fractions)
        LessonPlan.objects.create(subject=self.physics, week_start=MONDAY, topic=self.forces)
        self.client.force_authenticate(self.tutor_user)

        resp = self.client.post(
            '/api/lesson-plans/copy-week/', {'from_week': '2026-10-05', 'to_week': '2026-10-12'}, format='json'
        )

        self.assertEqual(resp.data, {'copied': 1, 'skipped': 0})
        self.assertFalse(LessonPlan.objects.filter(subject=self.physics, week_start=NEXT_MONDAY).exists())

    def test_copy_week_validates_both_weeks(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            '/api/lesson-plans/copy-week/', {'from_week': '2026-10-06', 'to_week': '2026-10-05'}, format='json'
        )
        self.assertEqual(resp.status_code, 400)
        resp = self.client.post(
            '/api/lesson-plans/copy-week/', {'from_week': '2026-10-05', 'to_week': '2026-10-05'}, format='json'
        )
        self.assertEqual(resp.status_code, 400)


class TopicRulesWithLessonPlansTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor_user = make_user(Role.TUTOR)
        self.tutor = TutorProfile.objects.create(user=self.tutor_user)
        self.maths = Subject.objects.create(name='Maths', tutor=self.tutor)
        self.physics = Subject.objects.create(name='Physics')

    def test_tutor_can_add_a_topic_to_own_subject(self):
        # Planning ahead often needs a topic nobody has added yet.
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.post(f'/api/subjects/{self.maths.id}/topics/', {'name': 'Ratios'}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_tutor_cannot_add_a_topic_to_someone_elses_subject(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.post(f'/api/subjects/{self.physics.id}/topics/', {'name': 'Forces'}, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_deleting_a_planned_topic_explains_instead_of_crashing(self):
        topic = Topic.objects.create(subject=self.maths, name='Fractions')
        LessonPlan.objects.create(subject=self.maths, week_start=MONDAY, topic=topic)
        LessonPlan.objects.create(subject=self.maths, week_start=NEXT_MONDAY, topic=topic)
        self.client.force_authenticate(self.owner)

        resp = self.client.delete(f'/api/topics/{topic.id}/')

        self.assertEqual(resp.status_code, 400)
        self.assertIn('2 lessons', str(resp.data['detail']))
        self.assertTrue(Topic.objects.filter(pk=topic.id).exists())
