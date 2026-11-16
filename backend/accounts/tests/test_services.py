from datetime import time

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from academics.testing import make_subject, teach
from accounts import services
from accounts.models import (
    ChangeKind,
    ChangeStatus,
    Role,
    TutorChangeRequest,
    TutorProfile,
    User,
    WorkingHours,
)
from core.models import Notification


def make_user(role, email=None, **kwargs):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(email=email, full_name=kwargs.pop('full_name', role.title()), role=role, **kwargs)


def block(weekday, start, end):
    return {'weekday': weekday, 'start_time': start, 'end_time': end}


def messages(ctx):
    return ' '.join(m for msgs in ctx.exception.message_dict.values() for m in msgs)


class ValidateWorkingHoursTests(TestCase):
    def test_normalises_sorts_and_allows_several_blocks_a_day(self):
        result = services.validate_working_hours(
            [block(0, '14:00', '17:00'), block(6, '09:00', '10:00'), block(0, '08:00', '12:00')]
        )
        self.assertEqual(
            [(b['weekday'], b['start_time'], b['end_time']) for b in result],
            [(0, time(8), time(12)), (0, time(14), time(17)), (6, time(9), time(10))],
        )

    def test_touching_blocks_are_not_an_overlap(self):
        services.validate_working_hours([block(2, '08:00', '12:00'), block(2, '12:00', '15:00')])

    def test_overlap_on_the_same_day_is_rejected_with_a_clear_message(self):
        with self.assertRaises(ValidationError) as ctx:
            services.validate_working_hours([block(0, '08:00', '12:00'), block(0, '11:00', '13:00')])
        self.assertEqual(
            ctx.exception.message_dict['working_hours'],
            ['Monday 11:00 to 13:00 overlaps Monday 08:00 to 12:00.'],
        )

    def test_a_block_inside_another_is_an_overlap(self):
        with self.assertRaises(ValidationError):
            services.validate_working_hours([block(3, '08:00', '17:00'), block(3, '10:00', '11:00')])

    def test_same_times_on_different_days_are_fine(self):
        services.validate_working_hours([block(0, '08:00', '12:00'), block(1, '08:00', '12:00')])

    def test_start_must_be_before_end(self):
        for start, end in (('12:00', '12:00'), ('13:00', '12:00')):
            with self.subTest(start=start, end=end), self.assertRaises(ValidationError) as ctx:
                services.validate_working_hours([block(4, start, end)])
            self.assertIn('start must be before end', messages(ctx))

    def test_weekend_days_are_allowed_but_not_beyond_sunday(self):
        services.validate_working_hours([block(5, '09:00', '12:00'), block(6, '09:00', '12:00')])
        for bad in (-1, 7, '1', True, None):
            with self.subTest(weekday=bad), self.assertRaises(ValidationError):
                services.validate_working_hours([block(bad, '09:00', '12:00')])

    def test_bad_times_and_shapes(self):
        for bad in (
            [block(0, '9am', '12:00')],
            [block(0, None, '12:00')],
            [block(0, '09:00:30', '12:00')],
            ['Monday 9 to 12'],
            'not a list',
        ):
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                services.validate_working_hours(bad)

    def test_empty_week_is_valid(self):
        self.assertEqual(services.validate_working_hours([]), [])


class ValidateSubjectIdsTests(TestCase):
    def setUp(self):
        self.physics = make_subject('Physics')
        self.old = make_subject('Latin', is_active=False)

    def test_dedupes_and_sorts(self):
        maths = make_subject('Mathematics')
        self.assertEqual(
            services.validate_subject_ids([maths.id, self.physics.id, maths.id]), sorted([maths.id, self.physics.id])
        )

    def test_unknown_or_inactive_subjects_are_rejected(self):
        for bad in ([99999], [self.old.id]):
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                services.validate_subject_ids(bad)

    def test_shape(self):
        for bad in ('1', [str(self.physics.id)], [True], None):
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                services.validate_subject_ids(bad)


class TutorFixtureMixin:
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.admin = make_user(Role.ADMIN)
        self.tutor_user = make_user(Role.TUTOR, full_name='Tam Tutor')
        self.tutor = TutorProfile.objects.create(user=self.tutor_user)
        self.maths = make_subject('Mathematics')
        self.physics = make_subject('Physics')
        teach(self.tutor, self.maths)
        WorkingHours.objects.create(tutor=self.tutor, weekday=0, start_time=time(8), end_time=time(12))


class DirectEditTests(TutorFixtureMixin, TestCase):
    def test_set_tutor_subjects_replaces_the_whole_set(self):
        services.set_tutor_subjects(self.tutor, [self.physics.id])
        self.assertEqual(services.current_subject_ids(self.tutor), [self.physics.id])
        services.set_tutor_subjects(self.tutor, [])
        self.assertEqual(services.current_subject_ids(self.tutor), [])

    def test_set_working_hours_replaces_the_whole_week(self):
        result = services.set_working_hours(self.tutor, [block(5, '09:00', '12:00'), block(5, '13:00', '15:00')])
        self.assertEqual(result, [block(5, '09:00', '12:00'), block(5, '13:00', '15:00')])
        self.assertEqual(services.current_working_hours(self.tutor), result)

    def test_invalid_edit_leaves_live_data_alone(self):
        with self.assertRaises(ValidationError):
            services.set_working_hours(self.tutor, [block(0, '08:00', '12:00'), block(0, '09:00', '10:00')])
        self.assertEqual(services.current_working_hours(self.tutor), [block(0, '08:00', '12:00')])


class CanTakeNewStudentsTests(TutorFixtureMixin, TestCase):
    def test_true_with_subjects_hours_active_and_available(self):
        self.assertTrue(services.tutor_can_take_new_students(self.tutor))

    def test_false_without_subjects(self):
        self.tutor.subject_links.all().delete()
        self.assertFalse(services.tutor_can_take_new_students(self.tutor))

    def test_false_without_working_hours(self):
        self.tutor.working_hours.all().delete()
        self.assertFalse(services.tutor_can_take_new_students(self.tutor))

    def test_false_when_unavailable_or_inactive(self):
        self.tutor.is_available = False
        self.assertFalse(services.tutor_can_take_new_students(self.tutor))
        self.tutor.is_available = True
        self.tutor_user.is_active = False
        self.assertFalse(services.tutor_can_take_new_students(self.tutor))


class SubmitChangeTests(TutorFixtureMixin, TestCase):
    def test_pending_change_does_not_touch_live_data(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id], note='Took over Physics')
        self.assertEqual(change.status, ChangeStatus.PENDING)
        self.assertEqual(change.proposed, [self.physics.id])
        self.assertEqual(change.note, 'Took over Physics')
        self.assertEqual(services.current_subject_ids(self.tutor), [self.maths.id])

    def test_hours_are_stored_normalised(self):
        change = services.submit_change(
            self.tutor, ChangeKind.WORKING_HOURS, [block(2, '14:00:00', '16:00'), block(1, '09:00', '10:00')]
        )
        self.assertEqual(change.proposed, [block(1, '09:00', '10:00'), block(2, '14:00', '16:00')])

    def test_a_new_submission_cancels_the_pending_one_of_the_same_kind_only(self):
        first = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        hours = services.submit_change(self.tutor, ChangeKind.WORKING_HOURS, [block(1, '09:00', '10:00')])
        second = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.maths.id, self.physics.id])
        first.refresh_from_db()
        hours.refresh_from_db()
        self.assertEqual(first.status, ChangeStatus.CANCELLED)
        self.assertEqual(hours.status, ChangeStatus.PENDING)
        self.assertEqual(second.status, ChangeStatus.PENDING)

    def test_database_refuses_two_pending_of_the_same_kind(self):
        services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        with self.assertRaises(IntegrityError), transaction.atomic():
            TutorChangeRequest.objects.create(tutor=self.tutor, kind=ChangeKind.SUBJECTS, proposed=[])

    def test_invalid_proposal_is_refused_at_submit_with_the_direct_edit_rules(self):
        with self.assertRaises(ValidationError) as ctx:
            services.submit_change(
                self.tutor, ChangeKind.WORKING_HOURS, [block(0, '08:00', '12:00'), block(0, '11:00', '13:00')]
            )
        self.assertIn('overlaps', messages(ctx))
        with self.assertRaises(ValidationError):
            services.submit_change(self.tutor, ChangeKind.SUBJECTS, [99999])
        with self.assertRaises(ValidationError):
            services.submit_change(self.tutor, 'PAY', [])
        self.assertFalse(TutorChangeRequest.objects.exists())

    def test_staff_who_can_review_are_notified(self):
        sys_admin = make_user(Role.SYS_ADMIN, email='sys@lhq.test')
        make_user(Role.ADMIN, email='gone@lhq.test', is_active=False)
        services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        recipients = set(Notification.objects.values_list('recipient__email', flat=True))
        self.assertEqual(recipients, {self.owner.email, self.admin.email, sys_admin.email})
        note = Notification.objects.first()
        self.assertEqual(note.message, 'Tam Tutor asked to change their subjects.')
        self.assertEqual(note.link, '/users/change-requests')

    def test_an_owner_who_teaches_is_not_reviewed_by_an_admin(self):
        owner_tutor = TutorProfile.objects.create(user=self.owner)
        services.submit_change(owner_tutor, ChangeKind.SUBJECTS, [self.physics.id])
        recipients = set(Notification.objects.values_list('recipient__email', flat=True))
        self.assertNotIn(self.admin.email, recipients)
        self.assertNotIn(self.owner.email, recipients)  # not themself


class ApproveChangeTests(TutorFixtureMixin, TestCase):
    def test_approval_applies_exactly_the_proposed_subjects(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        services.approve_change(change, self.admin)
        change.refresh_from_db()
        self.assertEqual(services.current_subject_ids(self.tutor), [self.physics.id])
        self.assertEqual((change.status, change.reviewed_by), (ChangeStatus.APPROVED, self.admin))
        self.assertIsNotNone(change.reviewed_at)

    def test_approval_applies_exactly_the_proposed_hours(self):
        proposed = [block(0, '14:00', '17:00'), block(5, '09:00', '12:00')]
        change = services.submit_change(self.tutor, ChangeKind.WORKING_HOURS, proposed)
        services.approve_change(change, self.owner)
        self.assertEqual(services.current_working_hours(self.tutor), proposed)

    def test_approval_revalidates_and_changes_nothing_if_the_catalog_moved_on(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        self.physics.is_active = False
        self.physics.save()
        with self.assertRaises(ValidationError):
            services.approve_change(change, self.admin)
        change.refresh_from_db()
        self.assertEqual(change.status, ChangeStatus.PENDING)
        self.assertEqual(services.current_subject_ids(self.tutor), [self.maths.id])

    def test_tutor_is_notified(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        Notification.objects.all().delete()
        services.approve_change(change, self.admin)
        note = Notification.objects.get()
        self.assertEqual((note.recipient, note.message, note.link), (self.tutor_user, 'Your subjects change was approved.', '/me'))

    def test_only_pending_requests_can_be_approved(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        services.cancel_change(change, self.tutor)
        with self.assertRaises(ValidationError):
            services.approve_change(change, self.admin)
        self.assertEqual(services.current_subject_ids(self.tutor), [self.maths.id])

    def test_reviewer_needs_staff_scope_over_the_tutor(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        other_tutor = make_user(Role.TUTOR, email='other@lhq.test')
        with self.assertRaises(PermissionDenied):
            services.approve_change(change, other_tutor)
        owner_tutor = TutorProfile.objects.create(user=self.owner)
        owner_change = services.submit_change(owner_tutor, ChangeKind.SUBJECTS, [self.physics.id])
        with self.assertRaises(PermissionDenied):
            services.approve_change(owner_change, self.admin)


class RejectAndCancelTests(TutorFixtureMixin, TestCase):
    def test_rejection_leaves_live_data_and_records_the_reason(self):
        change = services.submit_change(self.tutor, ChangeKind.WORKING_HOURS, [block(1, '09:00', '10:00')])
        services.reject_change(change, self.admin, '  We need you on Mondays.  ')
        change.refresh_from_db()
        self.assertEqual((change.status, change.reject_reason), (ChangeStatus.REJECTED, 'We need you on Mondays.'))
        self.assertEqual(services.current_working_hours(self.tutor), [block(0, '08:00', '12:00')])
        note = Notification.objects.get(recipient=self.tutor_user)
        self.assertEqual(note.message, 'Your working hours change was not approved: We need you on Mondays.')

    def test_rejection_needs_a_reason(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        with self.assertRaises(ValidationError):
            services.reject_change(change, self.admin, '   ')
        change.refresh_from_db()
        self.assertEqual(change.status, ChangeStatus.PENDING)

    def test_tutor_cancels_only_their_own_pending_request(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        other = TutorProfile.objects.create(user=make_user(Role.TUTOR, email='other@lhq.test'))
        with self.assertRaises(PermissionDenied):
            services.cancel_change(change, other)
        services.cancel_change(change, self.tutor)
        change.refresh_from_db()
        self.assertEqual(change.status, ChangeStatus.CANCELLED)
        with self.assertRaises(ValidationError):
            services.cancel_change(change, self.tutor)
