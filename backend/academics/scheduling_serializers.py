"""Serializers for the timetable API (Feature 2). Read shapes are built
here; writes are validated for shape here and for business rules in
academics.scheduling."""

from rest_framework import serializers

from accounts.models import TutorProfile
from clients.models import Student

from .models import (
    LessonMode,
    Session,
    SessionChangeKind,
    SessionChangeRequest,
    SessionLogEvent,
    StudentSubject,
    Subject,
    TimetableSlot,
)
from .scheduling import progress as progress_service
from .scheduling import session_log, state, times


def _name(user):
    if user is None:
        return None
    return user.full_name or user.email


def _hhmm(value):
    return times.fmt_time(value) if value is not None else None


class SlotSerializer(serializers.ModelSerializer):
    start_time = serializers.SerializerMethodField()
    end_time = serializers.SerializerMethodField()

    class Meta:
        model = TimetableSlot
        fields = ['id', 'weekday', 'start_time', 'end_time']

    def get_start_time(self, obj) -> str:
        return _hhmm(obj.start_time)

    def get_end_time(self, obj) -> str:
        return _hhmm(obj.end_time)


def student_ref(student):
    return {'id': student.pk, 'name': student.full_name, 'student_number': student.student_number}


def subject_ref(subject):
    return {
        'id': subject.pk,
        'name': subject.name,
        'level_name': subject.level.name,
        'display_name': subject.display_name,
    }


def tutor_ref(tutor):
    return {'id': tutor.pk, 'name': _name(tutor.user), 'user_id': tutor.user_id}


class StudentSubjectSerializer(serializers.ModelSerializer):
    student = serializers.SerializerMethodField()
    subject = serializers.SerializerMethodField()
    tutor = serializers.SerializerMethodField()
    topic_ids = serializers.SerializerMethodField()
    slots = SlotSerializer(many=True, read_only=True)
    progress = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StudentSubject
        fields = [
            'id',
            'student',
            'subject',
            'tutor',
            'topic_ids',
            'planned_sessions',
            'session_minutes',
            'mode',
            'start_date',
            'confirmed_end_date',
            'status',
            'slots',
            'progress',
            'created_by_name',
            'created_at',
        ]
        read_only_fields = fields

    def get_student(self, obj) -> dict:
        return student_ref(obj.student)

    def get_subject(self, obj) -> dict:
        return subject_ref(obj.subject)

    def get_tutor(self, obj) -> dict:
        return tutor_ref(obj.tutor)

    def get_topic_ids(self, obj) -> list:
        return sorted(t.pk for t in obj.topics.all())

    def get_progress(self, obj) -> dict:
        return progress_service.progress(obj, self.context.get('moment'))

    def get_created_by_name(self, obj):
        return _name(obj.created_by)


def student_subject_queryset():
    return StudentSubject.objects.select_related(
        'student', 'subject__level', 'tutor__user', 'created_by'
    ).prefetch_related('slots', 'topics', 'sessions__topics_covered')


class SlotWriteSerializer(serializers.Serializer):
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()


class SlotPatchSerializer(serializers.Serializer):
    weekday = serializers.IntegerField(min_value=0, max_value=6, required=False)
    start_time = serializers.TimeField(required=False)
    end_time = serializers.TimeField(required=False)
    allow_clash = serializers.BooleanField(required=False, default=False)


class SlotCreateSerializer(SlotWriteSerializer):
    allow_clash = serializers.BooleanField(required=False, default=False)


class StudentSubjectCreateSerializer(serializers.Serializer):
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.filter(is_active=True))
    tutor = serializers.PrimaryKeyRelatedField(queryset=TutorProfile.objects.select_related('user'))
    planned_sessions = serializers.IntegerField(min_value=1)
    session_minutes = serializers.IntegerField(min_value=1, required=False, default=60)
    mode = serializers.ChoiceField(choices=LessonMode.choices, required=False, default=LessonMode.IN_PERSON)
    start_date = serializers.DateField()
    # Omitted: every topic of the subject.
    topic_ids = serializers.ListField(child=serializers.IntegerField(), required=False, allow_null=True)
    slots = SlotWriteSerializer(many=True, required=False, default=list)
    allow_clash = serializers.BooleanField(required=False, default=False)


class StudentSubjectPatchSerializer(serializers.Serializer):
    tutor = serializers.PrimaryKeyRelatedField(queryset=TutorProfile.objects.select_related('user'), required=False)
    planned_sessions = serializers.IntegerField(min_value=1, required=False)
    session_minutes = serializers.IntegerField(min_value=1, required=False)
    mode = serializers.ChoiceField(choices=LessonMode.choices, required=False)
    start_date = serializers.DateField(required=False)
    topic_ids = serializers.ListField(child=serializers.IntegerField(), required=False)
    status = serializers.CharField(required=False)
    allow_clash = serializers.BooleanField(required=False, default=False)


class ConfirmEndSerializer(serializers.Serializer):
    last_date = serializers.DateField()


class AddSessionsSerializer(serializers.Serializer):
    count = serializers.IntegerField(min_value=1)


# -- sessions -------------------------------------------------------------------------


def change_request_dict(change):
    return {
        'id': change.pk,
        'session': change.session_id,
        'kind': change.kind,
        'new_date': change.new_date,
        'new_start_time': _hhmm(change.new_start_time),
        'new_end_time': _hhmm(change.new_end_time),
        'reason': change.reason,
        'status': change.status,
        'requested_by_name': _name(change.requested_by),
        'created_at': change.created_at,
        'reviewed_by_name': _name(change.reviewed_by),
        'reviewed_at': change.reviewed_at,
        'reject_reason': change.reject_reason,
    }


class SessionSerializer(serializers.ModelSerializer):
    """List shape. context: request (for can_log), moment."""

    student_subject = serializers.IntegerField(source='student_subject_id', read_only=True)
    student = serializers.SerializerMethodField()
    subject = serializers.SerializerMethodField()
    tutor = serializers.SerializerMethodField()
    mode = serializers.CharField(source='student_subject.mode', read_only=True)
    start_time = serializers.SerializerMethodField()
    end_time = serializers.SerializerMethodField()
    display_status = serializers.SerializerMethodField()
    log_deadline = serializers.SerializerMethodField()
    can_log = serializers.SerializerMethodField()
    topics_covered = serializers.SerializerMethodField()
    planned_topics = serializers.SerializerMethodField()
    planned_topic_names = serializers.SerializerMethodField()
    moved_to = serializers.SerializerMethodField()
    pending_request = serializers.SerializerMethodField()
    latest_request = serializers.SerializerMethodField()
    logged_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = [
            'id',
            'student_subject',
            'student',
            'subject',
            'tutor',
            'mode',
            'slot',
            'date',
            'start_time',
            'end_time',
            'status',
            'display_status',
            'log_deadline',
            'can_log',
            'not_held_reason',
            'admin_note',
            'topics_covered',
            'planned_topics',
            'planned_topic_names',
            'logged_by_name',
            'logged_at',
            'moved_from',
            'moved_to',
            'pending_request',
            'latest_request',
        ]
        read_only_fields = fields

    def _moment(self):
        return self.context.get('moment') or times.now()

    def get_student(self, obj) -> dict:
        return student_ref(obj.student_subject.student)

    def get_subject(self, obj) -> dict:
        return subject_ref(obj.student_subject.subject)

    def get_tutor(self, obj) -> dict:
        return tutor_ref(obj.student_subject.tutor)

    def get_start_time(self, obj) -> str:
        return _hhmm(obj.start_time)

    def get_end_time(self, obj) -> str:
        return _hhmm(obj.end_time)

    def get_display_status(self, obj) -> str:
        return state.display_status(obj, self._moment(), moved_away=bool(obj.moved_to.all()))

    def get_log_deadline(self, obj):
        return times.log_deadline(obj).isoformat()

    def get_can_log(self, obj) -> bool:
        request = self.context.get('request')
        return bool(request and session_log.can_log(obj, request.user, self._moment()))

    def get_topics_covered(self, obj) -> list:
        return sorted(t.pk for t in obj.topics_covered.all())

    def get_planned_topics(self, obj) -> list:
        return sorted(t.pk for t in obj.planned_topics.all())

    def get_planned_topic_names(self, obj) -> list:
        return [t.name for t in sorted(obj.planned_topics.all(), key=lambda t: (t.order, t.pk))]

    def get_moved_to(self, obj):
        moved = list(obj.moved_to.all())
        if not moved:
            return None
        new = moved[0]
        return {'id': new.pk, 'date': new.date, 'start_time': _hhmm(new.start_time), 'end_time': _hhmm(new.end_time)}

    def get_pending_request(self, obj):
        pending = [c for c in obj.change_requests.all() if c.status == 'PENDING']
        return change_request_dict(pending[0]) if pending else None

    def get_latest_request(self, obj):
        changes = list(obj.change_requests.all())
        return change_request_dict(changes[0]) if changes else None

    def get_logged_by_name(self, obj):
        return _name(obj.logged_by)


def session_queryset():
    return Session.objects.select_related(
        'student_subject__student',
        'student_subject__subject__level',
        'student_subject__tutor__user',
        'logged_by',
    ).prefetch_related(
        'topics_covered',
        'planned_topics',
        'moved_to',
        'change_requests__requested_by',
        'change_requests__reviewed_by',
    )


class SessionEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = SessionLogEvent
        fields = ['id', 'action', 'actor_name', 'from_status', 'to_status', 'note', 'created_at']
        read_only_fields = fields

    def get_actor_name(self, obj):
        return _name(obj.actor)


class SessionDetailSerializer(SessionSerializer):
    """Adds history, every change request and the student's topics (for
    logging and planning)."""

    events = serializers.SerializerMethodField()
    change_requests = serializers.SerializerMethodField()
    topics = serializers.SerializerMethodField()
    moved_from_detail = serializers.SerializerMethodField()

    class Meta(SessionSerializer.Meta):
        fields = SessionSerializer.Meta.fields + ['events', 'change_requests', 'topics', 'moved_from_detail']
        read_only_fields = fields

    def get_events(self, obj) -> list:
        return SessionEventSerializer(obj.events.select_related('actor'), many=True).data

    def get_change_requests(self, obj) -> list:
        return [change_request_dict(c) for c in obj.change_requests.all()]

    def get_topics(self, obj) -> list:
        covered_elsewhere = set(
            Session.objects.filter(student_subject=obj.student_subject, status='HELD')
            .exclude(pk=obj.pk)
            .values_list('topics_covered', flat=True)
        )
        return [
            {
                'id': t.pk,
                'number': t.number,
                'name': t.name,
                'chapter': t.chapter,
                'covered_before': t.pk in covered_elsewhere,
            }
            for t in obj.student_subject.topics.order_by('order', 'id')
        ]

    def get_moved_from_detail(self, obj):
        if obj.moved_from is None:
            return None
        old = obj.moved_from
        return {'id': old.pk, 'date': old.date, 'start_time': _hhmm(old.start_time), 'end_time': _hhmm(old.end_time)}


class LogSessionSerializer(serializers.Serializer):
    held = serializers.BooleanField()
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    topic_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
    admin_note = serializers.CharField(required=False, allow_blank=True, default='')


class PlanSessionSerializer(serializers.Serializer):
    topic_ids = serializers.ListField(child=serializers.IntegerField())


class MoveSessionSerializer(serializers.Serializer):
    new_date = serializers.DateField()
    new_start_time = serializers.TimeField()
    new_end_time = serializers.TimeField()
    reason = serializers.CharField()
    allow_clash = serializers.BooleanField(required=False, default=False)


class CancelSessionSerializer(serializers.Serializer):
    reason = serializers.CharField()


class ChangeRequestCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=SessionChangeKind.choices)
    reason = serializers.CharField()
    new_date = serializers.DateField(required=False, allow_null=True)
    new_start_time = serializers.TimeField(required=False, allow_null=True)
    new_end_time = serializers.TimeField(required=False, allow_null=True)


class ApproveSerializer(serializers.Serializer):
    allow_clash = serializers.BooleanField(required=False, default=False)


class RejectSerializer(serializers.Serializer):
    reason = serializers.CharField()


class StaffChangeRequestSerializer(serializers.Serializer):
    """Review queue row: the request with the session's current time next
    to the requested one."""

    def to_representation(self, change):
        data = change_request_dict(change)
        session = change.session
        ss = session.student_subject
        data['current'] = {
            'date': session.date,
            'start_time': _hhmm(session.start_time),
            'end_time': _hhmm(session.end_time),
            'status': session.status,
        }
        data['student'] = student_ref(ss.student)
        data['subject'] = subject_ref(ss.subject)
        data['tutor'] = tutor_ref(ss.tutor)
        return data


def change_request_queryset():
    return SessionChangeRequest.objects.select_related(
        'session__student_subject__student',
        'session__student_subject__subject__level',
        'session__student_subject__tutor__user',
        'requested_by',
        'reviewed_by',
    )
