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


class TutorSubject(models.Model):
    """A subject a tutor can teach. Live data: only staff write it
    directly, a tutor's own changes go through TutorChangeRequest."""

    tutor = models.ForeignKey(TutorProfile, on_delete=models.CASCADE, related_name='subject_links')
    subject = models.ForeignKey('academics.Subject', on_delete=models.CASCADE, related_name='tutor_links')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['tutor', 'subject'], name='unique_tutor_subject'),
        ]

    def __str__(self):
        return f'{self.tutor} teaches {self.subject}'


# 0=Monday ... 6=Sunday, same numbering as Python's date.weekday(). Working
# hours cover the whole week, unlike the Monday-Friday timetable slots.
WEEKDAY_CHOICES = [
    (0, 'Monday'),
    (1, 'Tuesday'),
    (2, 'Wednesday'),
    (3, 'Thursday'),
    (4, 'Friday'),
    (5, 'Saturday'),
    (6, 'Sunday'),
]


class WorkingHours(models.Model):
    """One block of time a tutor is available on a weekday. A day can hold
    several blocks (08:00-12:00 and 14:00-17:00); blocks on the same day
    never overlap - see accounts.services.validate_working_hours, the one
    place that rule lives."""

    tutor = models.ForeignKey(TutorProfile, on_delete=models.CASCADE, related_name='working_hours')
    weekday = models.PositiveSmallIntegerField(choices=WEEKDAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ['weekday', 'start_time']
        verbose_name_plural = 'working hours'
        constraints = [
            models.CheckConstraint(condition=models.Q(start_time__lt=models.F('end_time')), name='working_hours_start_before_end'),
            models.CheckConstraint(condition=models.Q(weekday__gte=0, weekday__lte=6), name='working_hours_weekday_range'),
        ]

    def __str__(self):
        return f'{self.tutor}: {self.get_weekday_display()} {self.start_time:%H:%M}-{self.end_time:%H:%M}'


class ChangeKind(models.TextChoices):
    SUBJECTS = 'SUBJECTS', 'Subjects'
    WORKING_HOURS = 'WORKING_HOURS', 'Working hours'


class ChangeStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'
    CANCELLED = 'CANCELLED', 'Cancelled'


class TutorChangeRequest(models.Model):
    """A tutor's proposed replacement for their subjects or working hours.
    Nothing live changes until an admin approves it (accounts.services).

    `proposed` is the whole new set, not a diff: a list of subject ids for
    SUBJECTS, a list of {weekday, start_time, end_time} for WORKING_HOURS."""

    tutor = models.ForeignKey(TutorProfile, on_delete=models.CASCADE, related_name='change_requests')
    kind = models.CharField(max_length=20, choices=ChangeKind.choices)
    proposed = models.JSONField()
    note = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=ChangeStatus.choices, default=ChangeStatus.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_change_requests'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reject_reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [
            # Backstop for services.submit_change, which cancels the old
            # pending request before creating the new one.
            models.UniqueConstraint(
                fields=['tutor', 'kind'],
                condition=models.Q(status='PENDING'),
                name='one_pending_change_per_tutor_kind',
            ),
        ]

    def __str__(self):
        return f'{self.tutor} {self.kind} {self.status}'
