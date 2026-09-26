from rest_framework import serializers

from .models import (
    FIRST_WEEKDAY,
    LAST_WEEKDAY,
    WEEKDAY_RANGE_MESSAGE,
    LessonPlan,
    School,
    Subject,
    TimetableSlot,
    Topic,
)


class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = ['id', 'name', 'is_active']
        read_only_fields = ['id']


class TimetableSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimetableSlot
        fields = ['day_of_week', 'start_time', 'end_time']

    def validate_day_of_week(self, value):
        if not FIRST_WEEKDAY <= value <= LAST_WEEKDAY:
            raise serializers.ValidationError(WEEKDAY_RANGE_MESSAGE)
        return value

    def validate(self, attrs):
        start = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        end = attrs.get('end_time', getattr(self.instance, 'end_time', None))
        if start is not None and end is not None and start >= end:
            raise serializers.ValidationError({'end_time': ['Must be after start_time.']})
        return attrs


class TopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Topic
        fields = ['id', 'subject', 'name']
        read_only_fields = ['id', 'subject']


class SubjectSerializer(serializers.ModelSerializer):
    """Read serializer, also the base for create/update below."""

    timetable_slot = TimetableSlotSerializer(required=False, allow_null=True)
    topics = TopicSerializer(many=True, read_only=True)
    tutor_name = serializers.SerializerMethodField()

    class Meta:
        model = Subject
        fields = ['id', 'name', 'tutor', 'tutor_name', 'is_active', 'timetable_slot', 'topics']
        read_only_fields = ['id']

    def get_tutor_name(self, obj):
        return obj.tutor.user.full_name if obj.tutor_id else None

    def _set_timetable_slot(self, subject, slot_data):
        if slot_data is None:
            TimetableSlot.objects.filter(subject=subject).delete()
            return
        slot = TimetableSlot.objects.filter(subject=subject).first() or TimetableSlot(subject=subject)
        for attr, value in slot_data.items():
            setattr(slot, attr, value)
        slot.full_clean()
        slot.save()

    def create(self, validated_data):
        slot_data = validated_data.pop('timetable_slot', None)
        subject = Subject.objects.create(**validated_data)
        if slot_data is not None:
            self._set_timetable_slot(subject, slot_data)
        return subject

    def update(self, instance, validated_data):
        slot_data = validated_data.pop('timetable_slot', serializers.empty)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if slot_data is not serializers.empty:
            self._set_timetable_slot(instance, slot_data)
        return instance


MONDAY_MESSAGE = 'Must be a Monday (the start of a week).'
# A year of weeks either side is plenty for planning ahead or looking back,
# and keeps one request from scanning the whole table.
MAX_PLAN_RANGE_DAYS = 371


def validate_monday(value):
    if value.weekday() != 0:
        raise serializers.ValidationError(MONDAY_MESSAGE)
    return value


class LessonPlanSerializer(serializers.ModelSerializer):
    topic_name = serializers.CharField(source='topic.name', read_only=True)
    updated_by_name = serializers.CharField(source='updated_by.full_name', read_only=True, default=None)

    class Meta:
        model = LessonPlan
        fields = ['id', 'subject', 'week_start', 'topic', 'topic_name', 'updated_by_name', 'updated_at']
        read_only_fields = fields


class LessonPlanWriteSerializer(serializers.Serializer):
    """Body + path for PUT /subjects/{id}/lesson-plans/{week_start}/.
    topic=null clears that week's plan."""

    week_start = serializers.DateField(validators=[validate_monday])
    topic = serializers.PrimaryKeyRelatedField(queryset=Topic.objects.all(), allow_null=True)

    def validate(self, attrs):
        topic = attrs.get('topic')
        if topic is not None and topic.subject_id != self.context['subject'].id:
            raise serializers.ValidationError({'topic': ['This topic belongs to a different subject.']})
        return attrs


class LessonPlanRangeSerializer(serializers.Serializer):
    """Query params for GET /lesson-plans/: ?from=<monday>[&to=<monday>],
    both inclusive; `to` defaults to `from` (a single week)."""

    from_week = serializers.DateField(validators=[validate_monday])
    to_week = serializers.DateField(validators=[validate_monday], required=False)

    def to_internal_value(self, data):
        mapped = {'from_week': data.get('from')}
        if data.get('to'):
            mapped['to_week'] = data.get('to')
        return super().to_internal_value(mapped)

    def validate(self, attrs):
        attrs.setdefault('to_week', attrs['from_week'])
        span = (attrs['to_week'] - attrs['from_week']).days
        if span < 0:
            raise serializers.ValidationError({'to': ['Must be on or after from.']})
        if span > MAX_PLAN_RANGE_DAYS:
            raise serializers.ValidationError({'to': ['Ask for at most a year of weeks at a time.']})
        return attrs


class CopyWeekSerializer(serializers.Serializer):
    from_week = serializers.DateField(validators=[validate_monday])
    to_week = serializers.DateField(validators=[validate_monday])

    def validate(self, attrs):
        if attrs['from_week'] == attrs['to_week']:
            raise serializers.ValidationError({'to_week': ['Pick a different week to copy into.']})
        return attrs
