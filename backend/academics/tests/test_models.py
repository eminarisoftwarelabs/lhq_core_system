from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from academics.models import Subject, TimetableSlot, Topic
from accounts.models import Role, TutorProfile, User


class SubjectModelTests(TestCase):
    def test_subject_can_exist_without_a_tutor(self):
        subject = Subject.objects.create(name='Unassigned Subject')
        self.assertIsNone(subject.tutor)
        self.assertTrue(subject.is_active)

    def test_reassigning_subject_is_a_plain_field_update(self):
        tutor_a = TutorProfile.objects.create(
            user=User.objects.create_user(email='a@lhq.test', full_name='A', role=Role.TUTOR)
        )
        tutor_b = TutorProfile.objects.create(
            user=User.objects.create_user(email='b@lhq.test', full_name='B', role=Role.TUTOR)
        )
        subject = Subject.objects.create(name='Physics', tutor=tutor_a)

        subject.tutor = tutor_b
        subject.save()
        subject.refresh_from_db()

        self.assertEqual(subject.tutor, tutor_b)

    def test_deleting_tutor_protected_by_subject_assignment(self):
        tutor_user = User.objects.create_user(email='tutor@lhq.test', full_name='Tutor', role=Role.TUTOR)
        profile = TutorProfile.objects.create(user=tutor_user)
        Subject.objects.create(name='Maths', tutor=profile)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                profile.delete()


class TimetableSlotModelTests(TestCase):
    def test_requires_start_before_end(self):
        subject = Subject.objects.create(name='Chemistry')
        slot = TimetableSlot(subject=subject, day_of_week=1, start_time='14:00', end_time='13:00')
        with self.assertRaises(ValidationError):
            slot.clean()

    def test_requires_day_of_week_in_range(self):
        subject = Subject.objects.create(name='Biology')
        slot = TimetableSlot(subject=subject, day_of_week=7, start_time='13:00', end_time='14:00')
        with self.assertRaises(ValidationError):
            slot.clean()

    def test_valid_slot(self):
        subject = Subject.objects.create(name='English')
        slot = TimetableSlot.objects.create(
            subject=subject, day_of_week=0, start_time='13:00', end_time='14:00'
        )
        slot.full_clean()
        self.assertEqual(subject.timetable_slot, slot)


class TopicModelTests(TestCase):
    def test_topic_belongs_to_subject(self):
        subject = Subject.objects.create(name='History')
        topic = Topic.objects.create(subject=subject, name='World War II')
        self.assertIn(topic, subject.topics.all())
