from academics.models import Subject
from clients.models import Student
from rest_framework import serializers

from .models import Enrollment
from .services import compute_end_date


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    subject_names = serializers.SerializerMethodField()

    class Meta:
        model = Enrollment
        fields = [
            'id',
            'student',
            'student_name',
            'subjects',
            'subject_names',
            'start_date',
            'end_date',
            'learning_mode',
            'status',
            'withdrawn_at',
            'withdrawal_reason',
            'created_at',
        ]
        read_only_fields = ['id', 'status', 'withdrawn_at', 'withdrawal_reason', 'created_at']

    def get_subject_names(self, obj):
        return [subject.name for subject in obj.subjects.all()]


class EnrollmentCreateSerializer(serializers.Serializer):
    """Used only by the "returning student renewal" flow - a fresh
    Enrollment created directly against an existing Student, no Enquiry
    involved. Requires either end_date or duration_weeks; if only
    duration_weeks is given, end_date is derived the same way the
    enquiry-driven enrollment path derives it."""

    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    subjects = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all(), many=True)
    start_date = serializers.DateField()
    end_date = serializers.DateField(required=False)
    duration_weeks = serializers.IntegerField(required=False, min_value=1)
    learning_mode = serializers.ChoiceField(choices=Enrollment._meta.get_field('learning_mode').choices)

    def validate(self, attrs):
        if not attrs.get('subjects'):
            raise serializers.ValidationError({'subjects': ['At least one subject is required.']})
        if not attrs.get('end_date') and not attrs.get('duration_weeks'):
            raise serializers.ValidationError(
                {'end_date': ['Provide either end_date or duration_weeks.']}
            )
        return attrs

    def create(self, validated_data):
        subjects = validated_data.pop('subjects')
        duration_weeks = validated_data.pop('duration_weeks', None)
        if not validated_data.get('end_date'):
            validated_data['end_date'] = compute_end_date(validated_data['start_date'], duration_weeks)

        enrollment = Enrollment.objects.create(**validated_data)
        enrollment.subjects.set(subjects)
        return enrollment
