from .models import Role


def can_create_role(creator, target_role):
    """Whether `creator` is allowed to create an account with `target_role`.

    SYS_ADMIN is unrestricted, including creating another Owner or
    SYS_ADMIN. Owner can create Admin/Tutor. Admin can create Tutor only.
    Tutor can create nobody.
    """
    if creator.role == Role.SYS_ADMIN:
        return True
    if creator.role == Role.OWNER:
        return target_role in (Role.ADMIN, Role.TUTOR)
    if creator.role == Role.ADMIN:
        return target_role == Role.TUTOR
    return False


def has_staff_scope_over(actor, target):
    """Whether `actor` may act on `target` by staff authority rather than
    self-edit: OWNER/SYS_ADMIN over anyone, ADMIN over TUTOR only.

    Shared by UserViewSet's edit-permission check and its field-set choice,
    which both boil down to this same question.
    """
    if actor.role in (Role.OWNER, Role.SYS_ADMIN):
        return True
    return actor.role == Role.ADMIN and target.role == Role.TUTOR
