from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Role, Subject, TutorProfile, User


def make_user(role, email=None, **kwargs):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(
        email=email, full_name=kwargs.pop('full_name', role.title()), role=role, **kwargs
    )


class AuthFlowTests(APITestCase):
    def setUp(self):
        self.user = make_user(Role.OWNER)
        self.user.set_password('StrongPassw0rd!')
        self.user.save()

    def test_login_success(self):
        resp = self.client.post(
            '/api/auth/login/',
            {'email': self.user.email, 'password': 'StrongPassw0rd!'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['user']['email'], self.user.email)
        self.assertTrue(resp.data['access'])
        self.assertTrue(resp.data['refresh'])

    def test_login_wrong_password(self):
        resp = self.client.post(
            '/api/auth/login/',
            {'email': self.user.email, 'password': 'wrong'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_inactive_user_rejected(self):
        self.user.is_active = False
        self.user.save()
        resp = self.client.post(
            '/api/auth/login/',
            {'email': self.user.email, 'password': 'StrongPassw0rd!'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_access_token_authenticates_subsequent_requests(self):
        login = self.client.post(
            '/api/auth/login/',
            {'email': self.user.email, 'password': 'StrongPassw0rd!'},
            format='json',
        )
        access = login.data['access']

        resp = self.client.get(
            '/api/me/', HTTP_AUTHORIZATION=f'Bearer {access}'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['email'], self.user.email)

    def test_logout_requires_auth(self):
        refresh = RefreshToken.for_user(self.user)
        resp = self.client.post(
            '/api/auth/logout/', {'refresh': str(refresh)}, format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_blacklists_the_refresh_token(self):
        refresh = RefreshToken.for_user(self.user)
        self.client.force_authenticate(self.user)

        resp = self.client.post(
            '/api/auth/logout/', {'refresh': str(refresh)}, format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

        # A blacklisted refresh token can no longer mint a new access token.
        self.client.force_authenticate(None)
        resp = self.client.post(
            '/api/auth/token/refresh/', {'refresh': str(refresh)}, format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_refresh_issues_a_new_access_token(self):
        refresh = RefreshToken.for_user(self.user)
        resp = self.client.post(
            '/api/auth/token/refresh/', {'refresh': str(refresh)}, format='json'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['access'])


class MeViewTests(APITestCase):
    def test_anonymous_gets_401(self):
        resp = self.client.get('/api/me/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_own_record_including_tutor_profile(self):
        user = make_user(Role.TUTOR)
        TutorProfile.objects.create(user=user, hourly_rate='30.00')
        self.client.force_authenticate(user)

        resp = self.client.get('/api/me/')

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['email'], user.email)
        self.assertEqual(resp.data['tutor_profile']['hourly_rate'], '30.00')
        self.assertTrue(resp.data['teaches'])


class CreateUserTests(APITestCase):
    def _create(self, actor, payload):
        self.client.force_authenticate(actor)
        return self.client.post('/api/users/create/', payload, format='json')

    def test_sys_admin_can_create_owner(self):
        sys_admin = make_user(Role.SYS_ADMIN)
        resp = self._create(
            sys_admin,
            {'email': 'new-owner@lhq.test', 'full_name': 'New Owner', 'role': Role.OWNER},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['role'], Role.OWNER)

    def test_owner_cannot_create_owner_or_sys_admin(self):
        owner = make_user(Role.OWNER)
        for target_role in (Role.OWNER, Role.SYS_ADMIN):
            resp = self._create(
                owner,
                {
                    'email': f'blocked-{target_role}@lhq.test',
                    'full_name': 'Blocked',
                    'role': target_role,
                },
            )
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, target_role)

    def test_owner_can_create_admin_and_tutor(self):
        owner = make_user(Role.OWNER)
        resp = self._create(
            owner,
            {'email': 'new-admin@lhq.test', 'full_name': 'New Admin', 'role': Role.ADMIN},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def test_admin_can_only_create_tutor(self):
        admin = make_user(Role.ADMIN)
        resp = self._create(
            admin,
            {'email': 'blocked-admin@lhq.test', 'full_name': 'Blocked', 'role': Role.ADMIN},
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        resp = self._create(
            admin,
            {'email': 'new-tutor@lhq.test', 'full_name': 'New Tutor', 'role': Role.TUTOR},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def test_tutor_cannot_create_anyone(self):
        tutor = make_user(Role.TUTOR)
        resp = self._create(
            tutor,
            {'email': 'x@lhq.test', 'full_name': 'X', 'role': Role.TUTOR},
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_creating_tutor_auto_creates_tutor_profile(self):
        owner = make_user(Role.OWNER)
        resp = self._create(
            owner,
            {'email': 'auto-tutor@lhq.test', 'full_name': 'Auto Tutor', 'role': Role.TUTOR},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        user = User.objects.get(email='auto-tutor@lhq.test')
        self.assertTrue(TutorProfile.objects.filter(user=user).exists())

    def test_creating_owner_who_also_teaches_creates_tutor_profile(self):
        sys_admin = make_user(Role.SYS_ADMIN)
        resp = self._create(
            sys_admin,
            {
                'email': 'teaching-owner@lhq.test',
                'full_name': 'Teaching Owner',
                'role': Role.OWNER,
                'tutor_profile': {'hourly_rate': '40.00'},
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        user = User.objects.get(email='teaching-owner@lhq.test')
        self.assertTrue(user.teaches)
        self.assertEqual(str(user.tutor_profile.hourly_rate), '40.00')

    def test_created_user_has_no_usable_password_when_none_supplied(self):
        # No email yet (foundation phase) — omitting the password leaves
        # the account unusable until the setup-password flow is wired to
        # an actual email send later.
        owner = make_user(Role.OWNER)
        mail.outbox = []
        resp = self._create(
            owner,
            {'email': 'onboard@lhq.test', 'full_name': 'Onboard Me', 'role': Role.TUTOR},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        user = User.objects.get(email='onboard@lhq.test')
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.must_change_password)
        self.assertEqual(len(mail.outbox), 0)

    def test_created_user_with_blank_password_treated_as_no_password(self):
        owner = make_user(Role.OWNER)
        resp = self._create(
            owner,
            {
                'email': 'blank-password@lhq.test',
                'full_name': 'Blank Password',
                'role': Role.TUTOR,
                'password': '',
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        user = User.objects.get(email='blank-password@lhq.test')
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.must_change_password)

    def test_created_user_with_starting_password_can_log_in_and_must_change_it(self):
        owner = make_user(Role.OWNER)
        resp = self._create(
            owner,
            {
                'email': 'starter@lhq.test',
                'full_name': 'Starter',
                'role': Role.TUTOR,
                'password': 'TemporaryPassw0rd!',
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertTrue(resp.data['must_change_password'])

        user = User.objects.get(email='starter@lhq.test')
        self.assertTrue(user.has_usable_password())
        self.assertTrue(user.must_change_password)

        self.client.force_authenticate(None)
        login = self.client.post(
            '/api/auth/login/',
            {'email': 'starter@lhq.test', 'password': 'TemporaryPassw0rd!'},
            format='json',
        )
        self.assertEqual(login.status_code, 200)
        self.assertTrue(login.data['user']['must_change_password'])

    def test_created_user_weak_starting_password_rejected(self):
        owner = make_user(Role.OWNER)
        resp = self._create(
            owner,
            {
                'email': 'weak-password@lhq.test',
                'full_name': 'Weak Password',
                'role': Role.TUTOR,
                'password': '123',
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', resp.data)
        self.assertFalse(User.objects.filter(email='weak-password@lhq.test').exists())


class ListUsersTests(APITestCase):
    def setUp(self):
        self.sys_admin = make_user(Role.SYS_ADMIN)
        self.owner = make_user(Role.OWNER)
        self.admin = make_user(Role.ADMIN)
        self.tutor = make_user(Role.TUTOR)

    def _roles_seen_by(self, actor):
        self.client.force_authenticate(actor)
        resp = self.client.get('/api/users/')
        self.assertEqual(resp.status_code, 200)
        return {row['role'] for row in resp.data['results']}, resp.data['count']

    def test_sys_admin_sees_everyone(self):
        roles, count = self._roles_seen_by(self.sys_admin)
        self.assertEqual(roles, {Role.SYS_ADMIN, Role.OWNER, Role.ADMIN, Role.TUTOR})
        self.assertEqual(count, 4)

    def test_owner_sees_tutors_and_admins_but_not_owners_or_sys_admin(self):
        roles, count = self._roles_seen_by(self.owner)
        self.assertEqual(roles, {Role.ADMIN, Role.TUTOR})
        self.assertEqual(count, 2)

    def test_admin_sees_only_tutors(self):
        roles, count = self._roles_seen_by(self.admin)
        self.assertEqual(roles, {Role.TUTOR})
        self.assertEqual(count, 1)

    def test_tutor_sees_nobody(self):
        roles, count = self._roles_seen_by(self.tutor)
        self.assertEqual(roles, set())
        self.assertEqual(count, 0)


class UserDetailGetTests(APITestCase):
    def _get(self, actor, target):
        self.client.force_authenticate(actor)
        return self.client.get(f'/api/users/{target.pk}/')

    def test_admin_can_view_owner_detail_even_though_they_cannot_edit_it(self):
        # GET is scoped to "any staff-level user", PATCH to
        # has_staff_scope_over — deliberately different, see UserDetailView.
        admin = make_user(Role.ADMIN)
        owner = make_user(Role.OWNER)
        resp = self._get(admin, owner)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['email'], owner.email)

    def test_tutor_can_view_own_detail(self):
        tutor = make_user(Role.TUTOR)
        resp = self._get(tutor, tutor)
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_tutor_cannot_view_another_users_detail(self):
        tutor = make_user(Role.TUTOR)
        other_tutor = make_user(Role.TUTOR, email='other-tutor@lhq.test')
        resp = self._get(tutor, other_tutor)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class UpdateUserTests(APITestCase):
    def _patch(self, actor, target, payload):
        self.client.force_authenticate(actor)
        return self.client.patch(f'/api/users/{target.pk}/', payload, format='json')

    def test_self_editable_fields_stay_a_subset_of_staff_editable_fields(self):
        # Regression guard for the field-set data clump: STAFF_EDITABLE_FIELDS
        # is derived from UserUpdateSerializer, but SELF_EDITABLE_FIELDS is a
        # hand-picked subset and could drift silently without this.
        from accounts.views import SELF_EDITABLE_FIELDS, STAFF_EDITABLE_FIELDS

        self.assertTrue(SELF_EDITABLE_FIELDS <= STAFF_EDITABLE_FIELDS)

    def test_owner_can_edit_anyone(self):
        owner = make_user(Role.OWNER)
        tutor = make_user(Role.TUTOR)
        resp = self._patch(owner, tutor, {'phone': '0999123456'})
        self.assertEqual(resp.status_code, 200, resp.data)
        tutor.refresh_from_db()
        self.assertEqual(tutor.phone, '0999123456')

    def test_admin_can_edit_tutor_but_not_admin_or_owner(self):
        admin = make_user(Role.ADMIN)
        tutor = make_user(Role.TUTOR)
        other_admin = make_user(Role.ADMIN, email='other-admin@lhq.test')
        owner = make_user(Role.OWNER)

        resp = self._patch(admin, tutor, {'phone': '111'})
        self.assertEqual(resp.status_code, 200, resp.data)

        resp = self._patch(admin, other_admin, {'phone': '111'})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        resp = self._patch(admin, owner, {'phone': '111'})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_escalate_tutor_to_admin_role(self):
        admin = make_user(Role.ADMIN)
        tutor = make_user(Role.TUTOR)
        resp = self._patch(admin, tutor, {'role': Role.ADMIN})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        tutor.refresh_from_db()
        self.assertEqual(tutor.role, Role.TUTOR)

    def test_owner_can_promote_tutor_to_admin(self):
        owner = make_user(Role.OWNER)
        tutor = make_user(Role.TUTOR)
        resp = self._patch(owner, tutor, {'role': Role.ADMIN})
        self.assertEqual(resp.status_code, 200, resp.data)
        tutor.refresh_from_db()
        self.assertEqual(tutor.role, Role.ADMIN)

    def test_tutor_can_edit_own_limited_fields(self):
        tutor = make_user(Role.TUTOR)
        resp = self._patch(tutor, tutor, {'phone': '222', 'address': '1 Main St'})
        self.assertEqual(resp.status_code, 200, resp.data)
        tutor.refresh_from_db()
        self.assertEqual(tutor.phone, '222')

    def test_tutor_cannot_edit_own_role_or_is_active(self):
        tutor = make_user(Role.TUTOR)
        resp = self._patch(tutor, tutor, {'role': Role.ADMIN})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        resp = self._patch(tutor, tutor, {'is_active': False})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_tutor_cannot_edit_another_tutor(self):
        # 404, not 403: a Tutor's queryset is scoped to their own row, so
        # another user's id isn't even confirmed to exist for them.
        tutor = make_user(Role.TUTOR)
        other_tutor = make_user(Role.TUTOR, email='other-tutor@lhq.test')
        resp = self._patch(tutor, other_tutor, {'phone': '333'})
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_deactivates_tutor(self):
        admin = make_user(Role.ADMIN)
        tutor = make_user(Role.TUTOR)
        resp = self._patch(admin, tutor, {'is_active': False})
        self.assertEqual(resp.status_code, 200, resp.data)
        tutor.refresh_from_db()
        self.assertFalse(tutor.is_active)


class DeleteUserTests(APITestCase):
    def _delete(self, actor, target):
        self.client.force_authenticate(actor)
        return self.client.delete(f'/api/users/{target.pk}/')

    def test_admin_can_delete_tutor(self):
        admin = make_user(Role.ADMIN)
        tutor = make_user(Role.TUTOR)
        resp = self._delete(admin, tutor)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=tutor.pk).exists())

    def test_admin_cannot_delete_admin_or_owner(self):
        admin = make_user(Role.ADMIN)
        other_admin = make_user(Role.ADMIN, email='other-admin@lhq.test')
        owner = make_user(Role.OWNER)
        for target in (other_admin, owner):
            resp = self._delete(admin, target)
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, target.role)
            self.assertTrue(User.objects.filter(pk=target.pk).exists())

    def test_owner_can_delete_admin_and_tutor(self):
        owner = make_user(Role.OWNER)
        admin = make_user(Role.ADMIN)
        tutor = make_user(Role.TUTOR)
        for target in (admin, tutor):
            resp = self._delete(owner, target)
            self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT, target.role)
            self.assertFalse(User.objects.filter(pk=target.pk).exists())

    def test_owner_cannot_delete_owner_or_sys_admin(self):
        owner = make_user(Role.OWNER)
        other_owner = make_user(Role.OWNER, email='other-owner@lhq.test')
        sys_admin = make_user(Role.SYS_ADMIN)
        for target in (other_owner, sys_admin):
            resp = self._delete(owner, target)
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, target.role)
            self.assertTrue(User.objects.filter(pk=target.pk).exists())

    def test_sys_admin_can_delete_anyone_except_themselves(self):
        sys_admin = make_user(Role.SYS_ADMIN)
        owner = make_user(Role.OWNER)
        resp = self._delete(sys_admin, owner)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

        resp = self._delete(sys_admin, sys_admin)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(pk=sys_admin.pk).exists())

    def test_nobody_can_delete_their_own_account(self):
        owner = make_user(Role.OWNER)
        resp = self._delete(owner, owner)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(pk=owner.pk).exists())

    def test_tutor_cannot_delete_anyone(self):
        tutor = make_user(Role.TUTOR)
        other_tutor = make_user(Role.TUTOR, email='other-tutor@lhq.test')
        resp = self._delete(tutor, other_tutor)
        # 404, not 403: a Tutor can't even view another user's id.
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_deleting_a_tutor_also_removes_their_tutor_profile(self):
        owner = make_user(Role.OWNER)
        tutor = make_user(Role.TUTOR)
        profile = TutorProfile.objects.create(user=tutor, hourly_rate='30.00')

        resp = self._delete(owner, tutor)

        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TutorProfile.objects.filter(pk=profile.pk).exists())

    def test_deleting_a_tutor_with_assigned_subjects_is_blocked(self):
        owner = make_user(Role.OWNER)
        tutor = make_user(Role.TUTOR)
        profile = TutorProfile.objects.create(user=tutor, hourly_rate='30.00')
        Subject.objects.create(name='Algebra', tutor=profile)

        resp = self._delete(owner, tutor)

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('subjects assigned', resp.data['detail'][0])
        self.assertTrue(User.objects.filter(pk=tutor.pk).exists())


class PasswordSetupConfirmTests(APITestCase):
    def _link_for(self, user):
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        return uid, token

    def test_valid_token_sets_password_and_allows_login(self):
        user = make_user(Role.TUTOR, email='setup@lhq.test')
        user.set_unusable_password()
        user.save()
        uid, token = self._link_for(user)

        resp = self.client.post(
            '/api/auth/setup-password/',
            {'uid': uid, 'token': token, 'new_password': 'BrandNewPassw0rd!'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

        resp = self.client.post(
            '/api/auth/login/',
            {'email': user.email, 'password': 'BrandNewPassw0rd!'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)

    def test_token_cannot_be_reused(self):
        user = make_user(Role.TUTOR, email='reuse@lhq.test')
        user.set_unusable_password()
        user.save()
        uid, token = self._link_for(user)

        first = self.client.post(
            '/api/auth/setup-password/',
            {'uid': uid, 'token': token, 'new_password': 'FirstPassw0rd!'},
            format='json',
        )
        self.assertEqual(first.status_code, status.HTTP_204_NO_CONTENT)

        second = self.client.post(
            '/api/auth/setup-password/',
            {'uid': uid, 'token': token, 'new_password': 'SecondPassw0rd!'},
            format='json',
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_garbage_token_rejected(self):
        user = make_user(Role.TUTOR, email='garbage@lhq.test')
        uid, _token = self._link_for(user)

        resp = self.client.post(
            '/api/auth/setup-password/',
            {'uid': uid, 'token': 'not-a-real-token', 'new_password': 'Whatever123!'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class ChangePasswordViewTests(APITestCase):
    def setUp(self):
        self.user = make_user(Role.TUTOR, email='starter@lhq.test')
        self.user.set_password('StartingPassw0rd!')
        self.user.must_change_password = True
        self.user.save()

    def _change(self, current_password, new_password):
        self.client.force_authenticate(self.user)
        return self.client.post(
            '/api/auth/change-password/',
            {'current_password': current_password, 'new_password': new_password},
            format='json',
        )

    def test_unauthenticated_rejected(self):
        resp = self.client.post(
            '/api/auth/change-password/',
            {'current_password': 'StartingPassw0rd!', 'new_password': 'BrandNewPassw0rd!'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_wrong_current_password_rejected(self):
        resp = self._change('NotTheRealPassword', 'BrandNewPassw0rd!')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('current_password', resp.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.must_change_password)

    def test_new_password_same_as_current_rejected(self):
        resp = self._change('StartingPassw0rd!', 'StartingPassw0rd!')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('new_password', resp.data)

    def test_weak_new_password_rejected(self):
        resp = self._change('StartingPassw0rd!', '123')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('new_password', resp.data)

    def test_success_clears_flag_and_allows_login_with_new_password(self):
        resp = self._change('StartingPassw0rd!', 'BrandNewPassw0rd!')
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

        self.user.refresh_from_db()
        self.assertFalse(self.user.must_change_password)
        self.assertTrue(self.user.check_password('BrandNewPassw0rd!'))

        self.client.force_authenticate(None)
        login = self.client.post(
            '/api/auth/login/',
            {'email': self.user.email, 'password': 'BrandNewPassw0rd!'},
            format='json',
        )
        self.assertEqual(login.status_code, 200)
        self.assertFalse(login.data['user']['must_change_password'])

    def test_success_blacklists_outstanding_refresh_tokens(self):
        old_refresh = RefreshToken.for_user(self.user)

        resp = self._change('StartingPassw0rd!', 'BrandNewPassw0rd!')
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

        self.client.force_authenticate(None)
        refresh_resp = self.client.post(
            '/api/auth/token/refresh/', {'refresh': str(old_refresh)}, format='json'
        )
        self.assertEqual(refresh_resp.status_code, status.HTTP_401_UNAUTHORIZED)
