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




# -- Timetable and sessions (Feature 2) ---------------------------------------
#
# The core record is a StudentSubject: one student taking one subject with
# one tutor. Its TimetableSlots are the weekly pattern (Monday 16:00-17:00,
# Thursday ...); academics.scheduling.generation turns that pattern into
# dated Session rows, which tutors log. Business rules live in
# academics/scheduling/, not here.

# 0=Monday ... 6=Sunday, same numbering as Python's date.weekday() and
# accounts.WorkingHours.
WEEKDAY_CHOICES = [
    (0, 'Monday'),
    (1, 'Tuesday'),
    (2, 'Wednesday'),
    (3, 'Thursday'),
    (4, 'Friday'),
    (5, 'Saturday'),
    (6, 'Sunday'),
]


class LessonMode(models.TextChoices):
    IN_PERSON = 'IN_PERSON', 'In person'
    ONLINE = 'ONLINE', 'Online'


class StudentSubjectStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    ENDED = 'ENDED', 'Ended'
    CANCELLED = 'CANCELLED', 'Cancelled'


class StudentSubject(models.Model):
    """One student taking one subject with one tutor. Sessions remaining
    and the expected end date are computed (scheduling.progress), never
    stored; only an end an admin has confirmed is stored."""

    student = models.ForeignKey('clients.Student', on_delete=models.PROTECT, related_name='student_subjects')
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name='student_subjects')
    tutor = models.ForeignKey('accounts.TutorProfile', on_delete=models.PROTECT, related_name='student_subjects')
    # The topics this student will cover; all the subject's topics unless
    # an admin unticks some.
    topics = models.ManyToManyField(Topic, blank=True, related_name='student_subjects')
    planned_sessions = models.PositiveIntegerField()
    session_minutes = models.PositiveIntegerField(default=60)
    mode = models.CharField(max_length=20, choices=LessonMode.choices, default=LessonMode.IN_PERSON)
    start_date = models.DateField()
    # Null until an admin confirms the last session (scheduling.confirm_end).
    confirmed_end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=StudentSubjectStatus.choices, default=StudentSubjectStatus.ACTIVE)
    created_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['student__full_name', 'subject__level__order', 'subject__name', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'subject'],
                condition=models.Q(status='ACTIVE'),
                name='one_active_student_subject',
            ),
            models.CheckConstraint(condition=models.Q(planned_sessions__gte=1), name='student_subject_planned_min_1'),
            models.CheckConstraint(condition=models.Q(session_minutes__gte=1), name='student_subject_minutes_min_1'),
        ]

    def __str__(self):
        return f'{self.student.full_name}: {self.subject}'


class TimetableSlot(models.Model):
    """One weekly occurrence of a student subject (e.g. every Monday
    16:00-17:00). A student subject can have several. The tutor is read
    through the student subject."""

    student_subject = models.ForeignKey(StudentSubject, on_delete=models.CASCADE, related_name='slots')
    weekday = models.PositiveSmallIntegerField(choices=WEEKDAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ['weekday', 'start_time', 'id']
        constraints = [
            models.CheckConstraint(condition=models.Q(start_time__lt=models.F('end_time')), name='slot_start_before_end'),
            models.CheckConstraint(condition=models.Q(weekday__gte=0, weekday__lte=6), name='slot_weekday_range'),
        ]

    def __str__(self):
        return f'{self.student_subject}: {self.get_weekday_display()} {self.start_time:%H:%M}-{self.end_time:%H:%M}'


class SessionStatus(models.TextChoices):
    # "Unlogged" (SCHEDULED, ended) and "missed log" (SCHEDULED, ended more
    # than 24 hours ago) are derived, not stored: see scheduling.times.
    SCHEDULED = 'SCHEDULED', 'Scheduled'
    HELD = 'HELD', 'Held'
    NOT_HELD = 'NOT_HELD', 'Not held'
    CANCELLED = 'CANCELLED', 'Cancelled'


class Session(models.Model):
    """One dated occurrence of a student subject. `slot` is the weekly
    pattern it came from; null for a one-off (a moved session)."""

    student_subject = models.ForeignKey(StudentSubject, on_delete=models.CASCADE, related_name='sessions')
    slot = models.ForeignKey(TimetableSlot, on_delete=models.SET_NULL, null=True, blank=True, related_name='sessions')
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    status = models.CharField(max_length=20, choices=SessionStatus.choices, default=SessionStatus.SCHEDULED)
    not_held_reason = models.TextField(blank=True)
    topics_covered = models.ManyToManyField(Topic, blank=True, related_name='sessions_covered')
    # What the tutor plans to cover; replaces the old per-subject weekly
    # LessonPlan. Pre-fills topics_covered when the session is logged.
    planned_topics = models.ManyToManyField(Topic, blank=True, related_name='sessions_planned')
    logged_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    logged_at = models.DateTimeField(null=True, blank=True)
    moved_from = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='moved_to'
    )
    # Required whenever an admin logs or corrects a session.
    admin_note = models.TextField(blank=True)

    class Meta:
        ordering = ['date', 'start_time', 'id']
        constraints = [
            models.UniqueConstraint(fields=['student_subject', 'date', 'start_time'], name='unique_session_time'),
            models.CheckConstraint(condition=models.Q(start_time__lt=models.F('end_time')), name='session_start_before_end'),
        ]
        indexes = [models.Index(fields=['date', 'status'], name='session_date_status_idx')]

    def __str__(self):
        return f'{self.student_subject} on {self.date} {self.start_time:%H:%M} ({self.status})'


class SessionAction(models.TextChoices):
    LOG = 'LOG', 'Logged'
    CORRECT = 'CORRECT', 'Corrected'
    MOVE = 'MOVE', 'Moved'
    CANCEL = 'CANCEL', 'Cancelled'


class SessionLogEvent(models.Model):
    """History: one row for every log, correction, move and cancel."""

    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='events')
    action = models.CharField(max_length=20, choices=SessionAction.choices)
    actor = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    from_status = models.CharField(max_length=20, choices=SessionStatus.choices)
    to_status = models.CharField(max_length=20, choices=SessionStatus.choices)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self):
        return f'{self.session_id}: {self.action} {self.from_status}->{self.to_status}'


class SessionChangeKind(models.TextChoices):
    MOVE = 'MOVE', 'Move'
    CANCEL = 'CANCEL', 'Cancel'


class SessionChangeStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'
    CANCELLED = 'CANCELLED', 'Cancelled'


class SessionChangeRequest(models.Model):
    """A tutor asks to move or cancel one session; nothing changes until
    an admin approves it (scheduling.changes)."""

    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='change_requests')
    kind = models.CharField(max_length=20, choices=SessionChangeKind.choices)
    new_date = models.DateField(null=True, blank=True)
    new_start_time = models.TimeField(null=True, blank=True)
    new_end_time = models.TimeField(null=True, blank=True)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=SessionChangeStatus.choices, default=SessionChangeStatus.PENDING)
    requested_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reject_reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [
            models.UniqueConstraint(
                fields=['session'],
                condition=models.Q(status='PENDING'),
                name='one_pending_change_per_session',
            ),
        ]

    def __str__(self):
        return f'{self.session_id} {self.kind} {self.status}'
