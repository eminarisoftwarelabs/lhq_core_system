from django.db import IntegrityError, transaction
from django.test import TestCase

from accounts.models import Role, Subject, TutorProfile, User


class UserManagerTests(TestCase):
    def test_create_user_defaults_to_tutor_and_unusable_password(self):
        user = User.objects.create_user(email='new@lhq.test', full_name='New Tutor')

        self.assertEqual(user.role, Role.TUTOR)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertFalse(user.has_usable_password())

    def test_create_user_normalizes_email_domain(self):
        user = User.objects.create_user(
            email='person@LHQ.TEST', full_name='Person', role=Role.ADMIN
        )
        self.assertEqual(user.email, 'person@lhq.test')

    def test_create_user_requires_email(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email='', full_name='Nobody')

    def test_create_superuser_forces_sys_admin_regardless_of_input(self):
        user = User.objects.create_superuser(
            email='eddie@lhq.test',
            full_name='Eddie',
            password='hunter2-strong-pw',
            role=Role.TUTOR,  # deliberately wrong, must be overridden
            is_staff=False,
            is_superuser=False,
        )

        self.assertEqual(user.role, Role.SYS_ADMIN)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.check_password('hunter2-strong-pw'))


class UserModelTests(TestCase):
    def _make(self, role, **kwargs):
        return User.objects.create_user(
            email=kwargs.pop('email', f'{role.lower()}@lhq.test'),
            full_name=kwargs.pop('full_name', role.title()),
            role=role,
            **kwargs,
        )

    def test_role_rank_ordering(self):
        tutor = self._make(Role.TUTOR)
        admin = self._make(Role.ADMIN)
        owner = self._make(Role.OWNER)
        sys_admin = self._make(Role.SYS_ADMIN)

        self.assertTrue(sys_admin.has_at_least(Role.OWNER))
        self.assertTrue(owner.has_at_least(Role.ADMIN))
        self.assertTrue(admin.has_at_least(Role.TUTOR))
        self.assertFalse(tutor.has_at_least(Role.ADMIN))
        self.assertTrue(tutor.has_at_least(Role.TUTOR))

    def test_is_staff_level(self):
        self.assertFalse(self._make(Role.TUTOR).is_staff_level)
        self.assertTrue(self._make(Role.ADMIN).is_staff_level)
        self.assertTrue(self._make(Role.OWNER).is_staff_level)
        self.assertTrue(self._make(Role.SYS_ADMIN).is_staff_level)

    def test_teaches_reflects_tutor_profile_existence(self):
        owner = self._make(Role.OWNER, email='owner-who-teaches@lhq.test')
        self.assertFalse(owner.teaches)

        TutorProfile.objects.create(user=owner)
        owner.refresh_from_db()
        self.assertTrue(owner.teaches)

    def test_employee_id_blank_does_not_collide_on_uniqueness(self):
        # employee_id is unique but blank-allowed; must not store '' for
        # both, or a second blank row would violate the unique constraint.
        User.objects.create_user(
            email='a@lhq.test', full_name='A', role=Role.TUTOR, employee_id=None
        )
        User.objects.create_user(
            email='b@lhq.test', full_name='B', role=Role.TUTOR, employee_id=None
        )
        self.assertEqual(User.objects.count(), 2)

    def test_employee_id_unique_when_set(self):
        User.objects.create_user(
            email='a@lhq.test', full_name='A', role=Role.TUTOR, employee_id='E1'
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                User.objects.create_user(
                    email='b@lhq.test',
                    full_name='B',
                    role=Role.TUTOR,
                    employee_id='E1',
                )


class TutorProfileModelTests(TestCase):
    def test_not_tied_to_tutor_role(self):
        owner = User.objects.create_user(
            email='owner@lhq.test', full_name='Owner', role=Role.OWNER
        )
        profile = TutorProfile.objects.create(user=owner, hourly_rate='25.00')
        self.assertEqual(profile.user.role, Role.OWNER)

    def test_deleting_tutor_protected_by_subject_assignment(self):
        tutor_user = User.objects.create_user(
            email='tutor@lhq.test', full_name='Tutor', role=Role.TUTOR
        )
        profile = TutorProfile.objects.create(user=tutor_user)
        Subject.objects.create(name='Maths', tutor=profile)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                profile.delete()


class SubjectModelTests(TestCase):
    def test_subject_can_exist_without_a_tutor(self):
        subject = Subject.objects.create(name='Unassigned Subject')
        self.assertIsNone(subject.tutor)

    def test_reassigning_subject_is_a_plain_field_update(self):
        tutor_a = TutorProfile.objects.create(
            user=User.objects.create_user(
                email='a@lhq.test', full_name='A', role=Role.TUTOR
            )
        )
        tutor_b = TutorProfile.objects.create(
            user=User.objects.create_user(
                email='b@lhq.test', full_name='B', role=Role.TUTOR
            )
        )
        subject = Subject.objects.create(name='Physics', tutor=tutor_a)

        subject.tutor = tutor_b
        subject.save()
        subject.refresh_from_db()

        self.assertEqual(subject.tutor, tutor_b)
