from types import SimpleNamespace

from django.test import SimpleTestCase

from accounts.models import Role
from accounts.permissions import can_create_role, has_staff_scope_over


def actor(role, pk=1):
    return SimpleNamespace(role=role, pk=pk)


class CanCreateRoleTests(SimpleTestCase):
    def test_sys_admin_can_create_any_role_including_owner_and_sys_admin(self):
        creator = actor(Role.SYS_ADMIN)
        for target in (Role.TUTOR, Role.ADMIN, Role.OWNER, Role.SYS_ADMIN):
            self.assertTrue(can_create_role(creator, target), target)

    def test_owner_can_create_admin_and_tutor_only(self):
        creator = actor(Role.OWNER)
        self.assertTrue(can_create_role(creator, Role.ADMIN))
        self.assertTrue(can_create_role(creator, Role.TUTOR))
        self.assertFalse(can_create_role(creator, Role.OWNER))
        self.assertFalse(can_create_role(creator, Role.SYS_ADMIN))

    def test_admin_can_create_tutor_only(self):
        creator = actor(Role.ADMIN)
        self.assertTrue(can_create_role(creator, Role.TUTOR))
        self.assertFalse(can_create_role(creator, Role.ADMIN))
        self.assertFalse(can_create_role(creator, Role.OWNER))
        self.assertFalse(can_create_role(creator, Role.SYS_ADMIN))

    def test_tutor_can_create_nobody(self):
        creator = actor(Role.TUTOR)
        for target in (Role.TUTOR, Role.ADMIN, Role.OWNER, Role.SYS_ADMIN):
            self.assertFalse(can_create_role(creator, target), target)


class HasStaffScopeOverTests(SimpleTestCase):
    def test_sys_admin_and_owner_have_scope_over_anyone(self):
        target = actor(Role.OWNER, pk=2)
        for role in (Role.SYS_ADMIN, Role.OWNER):
            self.assertTrue(has_staff_scope_over(actor(role), target), role)

    def test_admin_has_scope_over_tutor_only(self):
        admin = actor(Role.ADMIN)
        self.assertTrue(has_staff_scope_over(admin, actor(Role.TUTOR, pk=2)))
        for role in (Role.ADMIN, Role.OWNER, Role.SYS_ADMIN):
            self.assertFalse(has_staff_scope_over(admin, actor(role, pk=2)), role)

    def test_tutor_has_no_staff_scope_over_anyone(self):
        tutor = actor(Role.TUTOR)
        for role in (Role.TUTOR, Role.ADMIN, Role.OWNER, Role.SYS_ADMIN):
            self.assertFalse(has_staff_scope_over(tutor, actor(role, pk=2)), role)
