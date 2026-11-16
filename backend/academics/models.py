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


# Levels the centre teaches, seeded by academics/migrations/0006. Names
# are what seed_cambridge_topics maps the topics file's level keys onto.
SEEDED_LEVELS = [
    ('Primary (Year 6)', [6]),
    ('Lower Secondary (Years 7 to 9)', [7, 8, 9]),
    ('IGCSE', [10, 11]),
    ('A Level', [12, 13]),
]


class Level(models.Model):
    """A stage of the Cambridge curriculum (e.g. IGCSE), covering one or
    more school year groups."""

    name = models.CharField(max_length=100, unique=True)
    order = models.PositiveSmallIntegerField(default=0)
    # Values from clients.models.YEAR_GROUP_CHOICES (1..13).
    year_groups = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order', 'name']

    def clean(self):
        from clients.models import YEAR_GROUP_CHOICES

        valid = {value for value, _label in YEAR_GROUP_CHOICES}
        groups = self.year_groups
        # bool is an int subclass: True would otherwise pass as Year 1.
        if not isinstance(groups, list) or any(
            not isinstance(g, int) or isinstance(g, bool) or g not in valid for g in groups
        ):
            raise ValidationError({'year_groups': 'Must be a list of year groups between 1 and 13.'})

    def __str__(self):
        return self.name


class Subject(models.Model):
    """A catalog entry: one subject at one level (e.g. IGCSE Physics).
    Who teaches it lives on accounts.TutorSubject - many tutors can teach
    a subject and a tutor can teach many."""

    level = models.ForeignKey(Level, on_delete=models.PROTECT, related_name='subjects')
    name = models.CharField(max_length=100)
    # Cambridge syllabus code, e.g. "0625". Blank where there isn't one.
    code = models.CharField(max_length=20, blank=True)
    # True where Core and Extended papers apply (IGCSE Mathematics, the
    # sciences); those subjects' topics can be Extended-only.
    has_paper = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['level__order', 'name']
        constraints = [
            models.UniqueConstraint(fields=['level', 'name'], name='unique_subject_name_per_level'),
        ]

    @property
    def display_name(self):
        return f'{self.level.name} {self.name}'

    def __str__(self):
        return self.display_name


class Topic(models.Model):
    """One topic of a subject's official syllabus, grouped by chapter.
    `order` runs across the whole subject (not per chapter), so ordering
    by it alone keeps chapters in syllabus order too."""

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='topics')
    chapter = models.CharField(max_length=150, blank=True)
    # Syllabus number, e.g. "1.17". Blank where the syllabus has none.
    number = models.CharField(max_length=20, blank=True)
    name = models.CharField(max_length=255)
    extended_only = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['subject', 'order', 'id']
        constraints = [
            models.UniqueConstraint(fields=['subject', 'chapter', 'name'], name='unique_topic_per_subject_chapter'),
        ]

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
