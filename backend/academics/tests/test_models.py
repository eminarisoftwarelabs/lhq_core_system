from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from academics.models import Level, School, Topic
from academics.testing import make_subject
from accounts.models import Role, TutorProfile, User


class SchoolModelTests(TestCase):
    def test_defaults_to_active(self):
        school = School.objects.create(name='Test Academy')
        self.assertTrue(school.is_active)

    def test_name_must_be_unique(self):
        School.objects.create(name='Test Academy')
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                School.objects.create(name='Test Academy')


class LevelModelTests(TestCase):
    def test_four_levels_are_seeded_in_curriculum_order(self):
        self.assertEqual(
            [(level.name, level.year_groups) for level in Level.objects.all()],
            [
                ('Primary (Year 6)', [6]),
                ('Lower Secondary (Years 7 to 9)', [7, 8, 9]),
                ('IGCSE', [10, 11]),
                ('A Level', [12, 13]),
            ],
        )

    def test_name_must_be_unique(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Level.objects.create(name='IGCSE')

    def test_year_groups_must_be_real_year_groups(self):
        for bad in ([0], [14], ['10'], 'IGCSE', [True]):
            level = Level(name='Bad', year_groups=bad)
            with self.assertRaises(ValidationError, msg=repr(bad)):
                level.clean()
        Level(name='Good', year_groups=[1, 13]).clean()


class SubjectModelTests(TestCase):
    def test_subject_needs_no_tutor_and_defaults_to_active(self):
        subject = make_subject('Unassigned Subject')
        self.assertEqual(subject.tutor_links.count(), 0)
        self.assertTrue(subject.is_active)
        self.assertFalse(subject.has_paper)

    def test_same_name_allowed_at_different_levels_but_not_the_same_one(self):
        igcse = Level.objects.get(name='IGCSE')
        a_level = Level.objects.get(name='A Level')
        make_subject('Physics', level=igcse)
        make_subject('Physics', level=a_level)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                make_subject('Physics', level=igcse)

    def test_level_is_protected_while_subjects_use_it(self):
        subject = make_subject('Physics')
        with self.assertRaises(ProtectedError):
            subject.level.delete()

    def test_many_tutors_per_subject_and_many_subjects_per_tutor(self):
        tutor_a = TutorProfile.objects.create(
            user=User.objects.create_user(email='a@lhq.test', full_name='A', role=Role.TUTOR)
        )
        tutor_b = TutorProfile.objects.create(
            user=User.objects.create_user(email='b@lhq.test', full_name='B', role=Role.TUTOR)
        )
        physics = make_subject('Physics', tutors=[tutor_a, tutor_b])
        maths = make_subject('Mathematics', tutors=[tutor_a])
        self.assertEqual(physics.tutor_links.count(), 2)
        self.assertEqual(set(tutor_a.subject_links.values_list('subject_id', flat=True)), {physics.id, maths.id})

    def test_display_name_includes_the_level(self):
        self.assertEqual(str(make_subject('Physics')), 'IGCSE Physics')


class TopicModelTests(TestCase):
    def test_topic_belongs_to_subject(self):
        subject = make_subject('History')
        topic = Topic.objects.create(subject=subject, name='World War II')
        self.assertIn(topic, subject.topics.all())
        self.assertFalse(topic.extended_only)

    def test_ordered_by_syllabus_order_not_name(self):
        subject = make_subject('Physics')
        Topic.objects.create(subject=subject, chapter='B', name='Zeta', order=1)
        Topic.objects.create(subject=subject, chapter='A', name='Alpha', order=2)
        self.assertEqual([t.name for t in subject.topics.all()], ['Zeta', 'Alpha'])

    def test_same_topic_name_allowed_in_another_chapter_only(self):
        subject = make_subject('Physics')
        Topic.objects.create(subject=subject, chapter='Motion', name='Review')
        Topic.objects.create(subject=subject, chapter='Waves', name='Review')
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Topic.objects.create(subject=subject, chapter='Motion', name='Review')
