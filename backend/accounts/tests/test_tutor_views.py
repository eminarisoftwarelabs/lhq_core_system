from datetime import time

from rest_framework.test import APITestCase

from academics.testing import make_subject, teach
from accounts import services
from accounts.models import ChangeKind, ChangeStatus, Role, TutorChangeRequest, TutorProfile, User, WorkingHours
from core.models import Notification


def make_user(role, email=None, **kwargs):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(email=email, full_name=kwargs.pop('full_name', role.title()), role=role, **kwargs)


def block(weekday, start, end):
    return {'weekday': weekday, 'start_time': start, 'end_time': end}


class Fixture(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.admin = make_user(Role.ADMIN)
        self.tutor_user = make_user(Role.TUTOR, full_name='Tam Tutor')
        self.tutor = TutorProfile.objects.create(user=self.tutor_user)
        self.other_user = make_user(Role.TUTOR, email='other@lhq.test', full_name='Olu Other')
        self.other = TutorProfile.objects.create(user=self.other_user)
        self.maths = make_subject('Mathematics', code='0580', has_paper=True)
        self.physics = make_subject('Physics')
        teach(self.tutor, self.maths)
        teach(self.other, self.physics)
        WorkingHours.objects.create(tutor=self.tutor, weekday=0, start_time=time(8), end_time=time(12))
        WorkingHours.objects.create(tutor=self.other, weekday=3, start_time=time(14), end_time=time(17))

    def as_(self, user):
        self.client.force_authenticate(user)
        return self.client


class TutorSubjectsEndpointTests(Fixture):
    def url(self, tutor):
        return f'/api/tutors/{tutor.id}/subjects/'

    def test_tutor_reads_their_own_subjects(self):
        resp = self.as_(self.tutor_user).get(self.url(self.tutor))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.data,
            [
                {
                    'id': self.maths.id,
                    'name': 'Mathematics',
                    'level': self.maths.level_id,
                    'level_name': 'IGCSE',
                    'code': '0580',
                    'has_paper': True,
                }
            ],
        )

    def test_staff_sets_any_tutors_subjects_directly(self):
        resp = self.as_(self.admin).put(
            self.url(self.tutor), {'subjects': [self.physics.id, self.maths.id]}, format='json'
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual({row['name'] for row in resp.data}, {'Mathematics', 'Physics'})
        self.assertEqual(services.current_subject_ids(self.tutor), sorted([self.maths.id, self.physics.id]))
        self.assertFalse(TutorChangeRequest.objects.exists())  # no approval step

    def test_tutor_cannot_put_even_their_own_subjects(self):
        resp = self.as_(self.tutor_user).put(self.url(self.tutor), {'subjects': [self.physics.id]}, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(services.current_subject_ids(self.tutor), [self.maths.id])

    def test_invalid_subject_ids_are_a_400(self):
        resp = self.as_(self.admin).put(self.url(self.tutor), {'subjects': [99999]}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('subjects', resp.data)

    def test_admin_cannot_edit_an_owner_who_teaches(self):
        owner_tutor = TutorProfile.objects.create(user=self.owner)
        resp = self.as_(self.admin).put(self.url(owner_tutor), {'subjects': [self.maths.id]}, format='json')
        self.assertEqual(resp.status_code, 403)


class TutorWorkingHoursEndpointTests(Fixture):
    def url(self, tutor):
        return f'/api/tutors/{tutor.id}/working-hours/'

    def test_tutor_reads_their_own_hours(self):
        resp = self.as_(self.tutor_user).get(self.url(self.tutor))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, [block(0, '08:00', '12:00')])

    def test_staff_replaces_the_week_directly(self):
        week = [block(0, '08:00', '12:00'), block(0, '14:00', '17:00'), block(6, '09:00', '11:00')]
        resp = self.as_(self.owner).put(self.url(self.tutor), {'working_hours': week}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data, week)

    def test_overlapping_hours_are_rejected_with_a_clear_message(self):
        resp = self.as_(self.admin).put(
            self.url(self.tutor),
            {'working_hours': [block(0, '08:00', '12:00'), block(0, '11:30', '13:00')]},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['working_hours'], ['Monday 11:30 to 13:00 overlaps Monday 08:00 to 12:00.'])
        self.assertEqual(services.current_working_hours(self.tutor), [block(0, '08:00', '12:00')])

    def test_tutor_cannot_put_hours(self):
        resp = self.as_(self.tutor_user).put(self.url(self.tutor), {'working_hours': []}, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(self.tutor.working_hours.count(), 1)


class PrivacyTests(Fixture):
    """A tutor never sees or changes another tutor's subjects, hours or
    requests - every route answers 404, as if the tutor didn't exist."""

    def test_another_tutors_subjects_and_hours_are_404(self):
        client = self.as_(self.tutor_user)
        for path in (f'/api/tutors/{self.other.id}/subjects/', f'/api/tutors/{self.other.id}/working-hours/'):
            with self.subTest(path=path):
                self.assertEqual(client.get(path).status_code, 404)
                self.assertEqual(client.put(path, {'subjects': [], 'working_hours': []}, format='json').status_code, 404)
        self.assertEqual(services.current_subject_ids(self.other), [self.physics.id])
        self.assertEqual(self.other.working_hours.count(), 1)

    def test_tutor_sees_only_their_own_change_requests(self):
        services.submit_change(self.other, ChangeKind.SUBJECTS, [self.maths.id])
        mine = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        resp = self.as_(self.tutor_user).get('/api/tutors/me/change-requests/')
        self.assertEqual([row['id'] for row in resp.data], [mine.id])

    def test_tutor_cannot_cancel_another_tutors_request(self):
        theirs = services.submit_change(self.other, ChangeKind.SUBJECTS, [self.maths.id])
        resp = self.as_(self.tutor_user).post(f'/api/tutors/me/change-requests/{theirs.id}/cancel/')
        self.assertEqual(resp.status_code, 404)
        theirs.refresh_from_db()
        self.assertEqual(theirs.status, ChangeStatus.PENDING)

    def test_tutor_cannot_reach_the_staff_review_queue(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        client = self.as_(self.tutor_user)
        self.assertEqual(client.get('/api/change-requests/').status_code, 403)
        self.assertEqual(client.post(f'/api/change-requests/{change.id}/approve/').status_code, 403)
        self.assertEqual(client.post(f'/api/change-requests/{change.id}/reject/', {'reason': 'x'}).status_code, 403)
        change.refresh_from_db()
        self.assertEqual(change.status, ChangeStatus.PENDING)

    def test_subject_listing_never_names_other_tutors_to_a_tutor(self):
        resp = self.as_(self.tutor_user).get('/api/subjects/')
        self.assertNotIn('Olu Other', str(resp.data))

    def test_requests_without_a_tutor_profile_are_404(self):
        client = self.as_(self.admin)
        self.assertEqual(client.get('/api/tutors/me/change-requests/').status_code, 404)


class MyChangeRequestsEndpointTests(Fixture):
    url = '/api/tutors/me/change-requests/'

    def test_submit_keeps_live_data_until_approved(self):
        resp = self.as_(self.tutor_user).post(
            self.url, {'kind': 'SUBJECTS', 'proposed': [self.maths.id, self.physics.id], 'note': 'Covering Physics'}, format='json'
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['status'], 'PENDING')
        self.assertEqual([s['name'] for s in resp.data['proposed']], ['Mathematics', 'Physics'])
        self.assertEqual(resp.data['note'], 'Covering Physics')
        live = self.client.get(f'/api/tutors/{self.tutor.id}/subjects/').data
        self.assertEqual([s['name'] for s in live], ['Mathematics'])

    def test_overlapping_hours_are_refused_at_submit(self):
        resp = self.as_(self.tutor_user).post(
            self.url,
            {'kind': 'WORKING_HOURS', 'proposed': [block(0, '08:00', '12:00'), block(0, '10:00', '11:00')]},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('overlaps', resp.data['working_hours'][0])
        self.assertFalse(TutorChangeRequest.objects.exists())

    def test_unknown_kind_is_a_400(self):
        resp = self.as_(self.tutor_user).post(self.url, {'kind': 'PAY', 'proposed': []}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_resubmitting_replaces_the_pending_request(self):
        client = self.as_(self.tutor_user)
        first = client.post(self.url, {'kind': 'SUBJECTS', 'proposed': [self.physics.id]}, format='json').data
        client.post(self.url, {'kind': 'SUBJECTS', 'proposed': []}, format='json')
        rows = {row['id']: row['status'] for row in client.get(self.url).data}
        self.assertEqual(rows[first['id']], 'CANCELLED')
        self.assertEqual(list(rows.values()).count('PENDING'), 1)

    def test_cancel(self):
        client = self.as_(self.tutor_user)
        change = client.post(self.url, {'kind': 'SUBJECTS', 'proposed': [self.physics.id]}, format='json').data
        resp = client.post(f'{self.url}{change["id"]}/cancel/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'CANCELLED')
        self.assertEqual(client.post(f'{self.url}{change["id"]}/cancel/').status_code, 400)

    def test_rejected_request_shows_the_reason_to_the_tutor(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        services.reject_change(change, self.admin, 'Physics is fully staffed.')
        row = self.as_(self.tutor_user).get(self.url).data[0]
        self.assertEqual((row['status'], row['reject_reason']), ('REJECTED', 'Physics is fully staffed.'))
        self.assertNotIn('current', row)


class StaffReviewEndpointTests(Fixture):
    def test_pending_queue_shows_current_next_to_proposed(self):
        services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id], note='Swap please')
        services.submit_change(self.tutor, ChangeKind.WORKING_HOURS, [block(1, '09:00', '10:00')])
        resp = self.as_(self.admin).get('/api/change-requests/?status=PENDING')
        self.assertEqual(resp.status_code, 200)
        by_kind = {row['kind']: row for row in resp.data}
        subjects = by_kind['SUBJECTS']
        self.assertEqual(subjects['tutor_name'], 'Tam Tutor')
        self.assertEqual(subjects['tutor_user'], self.tutor_user.id)
        self.assertEqual([s['name'] for s in subjects['current']], ['Mathematics'])
        self.assertEqual([s['name'] for s in subjects['proposed']], ['Physics'])
        self.assertEqual(subjects['note'], 'Swap please')
        hours = by_kind['WORKING_HOURS']
        self.assertEqual(hours['current'], [block(0, '08:00', '12:00')])
        self.assertEqual(hours['proposed'], [block(1, '09:00', '10:00')])

    def test_status_and_tutor_filters(self):
        services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        services.submit_change(self.other, ChangeKind.SUBJECTS, [self.maths.id])
        client = self.as_(self.owner)
        self.assertEqual(len(client.get(f'/api/change-requests/?tutor={self.other.id}').data), 1)
        self.assertEqual(len(client.get('/api/change-requests/?status=APPROVED').data), 0)
        self.assertEqual(client.get('/api/change-requests/?status=MAYBE').status_code, 400)
        self.assertEqual(client.get('/api/change-requests/?tutor=x').status_code, 400)

    def test_admin_does_not_see_requests_from_an_owner_who_teaches(self):
        owner_tutor = TutorProfile.objects.create(user=self.owner)
        change = services.submit_change(owner_tutor, ChangeKind.SUBJECTS, [self.physics.id])
        client = self.as_(self.admin)
        self.assertEqual(client.get('/api/change-requests/').data, [])
        self.assertEqual(client.post(f'/api/change-requests/{change.id}/approve/').status_code, 404)

    def test_approve_applies_the_change_exactly(self):
        change = services.submit_change(self.tutor, ChangeKind.WORKING_HOURS, [block(5, '09:00', '12:00')])
        resp = self.as_(self.admin).post(f'/api/change-requests/{change.id}/approve/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['status'], 'APPROVED')
        self.assertEqual(resp.data['reviewed_by_name'], 'Admin')
        self.assertEqual(services.current_working_hours(self.tutor), [block(5, '09:00', '12:00')])
        self.assertTrue(Notification.objects.filter(recipient=self.tutor_user, link='/me').exists())

    def test_reject_needs_a_reason_and_leaves_live_data(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        client = self.as_(self.admin)
        resp = client.post(f'/api/change-requests/{change.id}/reject/', {'reason': ''}, format='json')
        self.assertEqual(resp.status_code, 400)
        resp = client.post(f'/api/change-requests/{change.id}/reject/', {'reason': 'Not this term.'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['reject_reason'], 'Not this term.')
        self.assertEqual(services.current_subject_ids(self.tutor), [self.maths.id])

    def test_approving_twice_is_refused(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        client = self.as_(self.admin)
        client.post(f'/api/change-requests/{change.id}/approve/')
        resp = client.post(f'/api/change-requests/{change.id}/approve/')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('already approved', str(resp.data))

    def test_removed_subject_still_shows_in_a_proposal(self):
        change = services.submit_change(self.tutor, ChangeKind.SUBJECTS, [self.physics.id])
        TutorChangeRequest.objects.filter(pk=change.pk).update(proposed=[self.physics.id, 424242])
        row = self.as_(self.admin).get('/api/change-requests/').data[0]
        self.assertIn('Subject 424242 (removed)', [s['name'] for s in row['proposed']])


class UserTutorProfileFlagTests(Fixture):
    def test_users_list_flags_tutors_who_cannot_take_new_students(self):
        self.other.working_hours.all().delete()
        rows = {row['email']: row for row in self.as_(self.owner).get('/api/users/').data['results']}
        self.assertTrue(rows[self.tutor_user.email]['tutor_profile']['can_take_new_students'])
        self.assertFalse(rows[self.other_user.email]['tutor_profile']['can_take_new_students'])
