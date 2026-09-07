from django.core.exceptions import ValidationError
from django.db import models


class School(models.Model):
    """Reference list of schools offered on the enquiry form's school
    picker. Free text is still accepted there for a school not in this
    list (the form's "Other" option) - this is a suggestion list, not a
    hard constraint on Student/Enquiry's school field."""

    name = models.CharField(max_length=150, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Subject(models.Model):
    name = models.CharField(max_length=100)
    # null=True so a Subject can exist before anyone is assigned to it.
    # Exactly one Tutor at a time by design, not a ManyToMany. Migrated out
    # of accounts (see academics/migrations/0002) — academics is now the
    # single owner of Subject.
    tutor = models.ForeignKey(
        'accounts.TutorProfile',
        on_delete=models.PROTECT,
        related_name='subjects',
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Topic(models.Model):
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='topics')
    name = models.CharField(max_length=150)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.subject.name})'


class TimetableSlot(models.Model):
    # One fixed slot per Subject. If a Subject ever needs multiple sessions
    # a week at different times, this becomes a ForeignKey instead —
    # confirmed not needed today.
    subject = models.OneToOneField(Subject, on_delete=models.CASCADE, related_name='timetable_slot')
    day_of_week = models.IntegerField()  # 0=Monday ... 6=Sunday
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ['day_of_week', 'start_time']

    def clean(self):
        if not 0 <= self.day_of_week <= 6:
            raise ValidationError({'day_of_week': 'Must be between 0 (Monday) and 6 (Sunday).'})
        if self.start_time is not None and self.end_time is not None and self.start_time >= self.end_time:
            raise ValidationError({'end_time': 'Must be after start_time.'})

    def __str__(self):
        return f'{self.subject.name}: day {self.day_of_week} {self.start_time}-{self.end_time}'
