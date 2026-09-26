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


# The centre runs Monday-Friday only. day_of_week keeps the 0=Monday
# numbering (so the column stays compatible with Python's date.weekday()),
# just capped at Friday.
FIRST_WEEKDAY = 0
LAST_WEEKDAY = 4
WEEKDAY_RANGE_MESSAGE = 'Must be a weekday, between 0 (Monday) and 4 (Friday).'


class TimetableSlot(models.Model):
    # One fixed slot per Subject. If a Subject ever needs multiple sessions
    # a week at different times, this becomes a ForeignKey instead —
    # confirmed not needed today.
    subject = models.OneToOneField(Subject, on_delete=models.CASCADE, related_name='timetable_slot')
    day_of_week = models.IntegerField()  # 0=Monday ... 4=Friday
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ['day_of_week', 'start_time']

    def clean(self):
        if not FIRST_WEEKDAY <= self.day_of_week <= LAST_WEEKDAY:
            raise ValidationError({'day_of_week': WEEKDAY_RANGE_MESSAGE})
        if self.start_time is not None and self.end_time is not None and self.start_time >= self.end_time:
            raise ValidationError({'end_time': 'Must be after start_time.'})

    def __str__(self):
        return f'{self.subject.name}: day {self.day_of_week} {self.start_time}-{self.end_time}'


class LessonPlan(models.Model):
    """What a subject's weekly session will cover in one particular week -
    the tutor's plan, set ahead and changeable any time.

    Keyed by the week (its Monday), not the exact date: a subject has one
    session a week (TimetableSlot), so the week identifies the lesson, and
    if the session later moves from Monday to Wednesday its planned topics
    move with it instead of being stranded on the old day."""

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='lesson_plans')
    week_start = models.DateField(help_text='The Monday of the planned week.')
    # PROTECT: deleting a topic that's still planned must be a deliberate,
    # explained refusal (TopicDetailView), not a silent loss of the plan.
    topic = models.ForeignKey(Topic, on_delete=models.PROTECT, related_name='lesson_plans')
    updated_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['week_start', 'subject__name']
        constraints = [
            models.UniqueConstraint(fields=['subject', 'week_start'], name='one_lesson_plan_per_subject_week'),
        ]

    def clean(self):
        errors = {}
        if self.week_start and self.week_start.weekday() != 0:
            errors['week_start'] = 'Must be a Monday (the start of a week).'
        if self.topic_id and self.subject_id and self.topic.subject_id != self.subject_id:
            errors['topic'] = 'This topic belongs to a different subject.'
        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f'{self.subject.name}, week of {self.week_start}: {self.topic.name}'
