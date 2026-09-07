from rest_framework import serializers

from .models import School, Subject, TimetableSlot, Topic


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
        if not 0 <= value <= 6:
            raise serializers.ValidationError('Must be between 0 (Monday) and 6 (Sunday).')
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
