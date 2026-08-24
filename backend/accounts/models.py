from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class Role(models.TextChoices):
    TUTOR = 'TUTOR', 'Tutor'
    ADMIN = 'ADMIN', 'Admin'
    OWNER = 'OWNER', 'Owner'
    SYS_ADMIN = 'SYS_ADMIN', 'System Admin'


ROLE_RANK = {
    Role.TUTOR: 1,
    Role.ADMIN: 2,
    Role.OWNER: 3,
    Role.SYS_ADMIN: 4,
}


class EmploymentType(models.TextChoices):
    FULL_TIME = 'FULL_TIME', 'Full time'
    PART_TIME = 'PART_TIME', 'Part time'
    CONTRACT = 'CONTRACT', 'Contract'


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError('Users must have an email address.')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault('role', Role.TUTOR)
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        # fallback. createsuperuser always produces one, regardless of
        # whatever role/flags are passed in, so the seeding command in the
        # handover ("createsuperuser, same as before") stays a one-liner.
        extra_fields['role'] = Role.SYS_ADMIN
        extra_fields['is_staff'] = True
        extra_fields['is_superuser'] = True
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices)
    employee_id = models.CharField(
        max_length=32, unique=True, blank=True, null=True
    )
    employment_type = models.CharField(
        max_length=20, choices=EmploymentType.choices, blank=True
    )
    # Residential address. Not LHQ's site location.
    address = models.CharField(max_length=255, blank=True)
    start_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    # True only when staff set a starting password directly (no email flow
    # yet); cleared once the user changes it via ChangePasswordView.
    must_change_password = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        ordering = ['full_name']

    def __str__(self):
        return self.email

    def has_at_least(self, role):
        return ROLE_RANK[self.role] >= ROLE_RANK[role]

    @property
    def is_staff_level(self):
        return self.role in (Role.ADMIN, Role.OWNER, Role.SYS_ADMIN)

    @property
    def teaches(self):
        return hasattr(self, 'tutor_profile')


class TutorProfile(models.Model):
    # Not tied to role=TUTOR: an Owner or Admin can also teach.
    user = models.OneToOneField(
        User, on_delete=models.PROTECT, related_name='tutor_profile'
    )
    hourly_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    is_available = models.BooleanField(default=True)

    def __str__(self):
        return f'TutorProfile<{self.user.email}>'


class Subject(models.Model):
    name = models.CharField(max_length=100)
    # null=True so a Subject can exist before anyone is assigned to it.
    # Exactly one Tutor at a time by design; see accounts_app_handover.md
    # for why this isn't a ManyToMany.
    tutor = models.ForeignKey(
        TutorProfile,
        on_delete=models.PROTECT,
        related_name='subjects',
        null=True,
        blank=True,
    )

    def __str__(self):
        return self.name
