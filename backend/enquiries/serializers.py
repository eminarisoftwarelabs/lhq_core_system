from academics.models import Subject
from clients.serializers import ParentSerializer
from rest_framework import serializers

from .models import Enquiry, EnquiryStage, EnquiryStageChange


class EnquiryStageChangeSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source='changed_by.full_name', read_only=True, default=None)

    class Meta:
        model = EnquiryStageChange
        fields = ['id', 'from_stage', 'to_stage', 'changed_by', 'changed_by_name', 'changed_at', 'note']
        read_only_fields = fields


class EnquirySubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'name', 'is_active']
        read_only_fields = fields


class EnquirySerializer(serializers.ModelSerializer):
    """Read serializer for GET /enquiries/ and GET /enquiries/{id}/."""

    parent = ParentSerializer(read_only=True)
    interested_subjects = EnquirySubjectSerializer(many=True, read_only=True)
    stage_history = EnquiryStageChangeSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default=None)

    class Meta:
        model = Enquiry
        fields = [
            'id',
            'parent',
            'student_name',
            'student_grade',
            'stage',
            'interested_subjects',
            'duration_weeks',
            'learning_mode',
            'desired_start_date',
            'meeting_datetime',
            'enrollment',
            'notes',
            'stage_history',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_name',
        ]
        read_only_fields = fields


class ParentInputSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField(required=False, allow_blank=True)
    location = serializers.CharField(max_length=255, required=False, allow_blank=True)


class EnquiryCreateSerializer(serializers.Serializer):
    """POST /enquiries/ body. Wraps enquiries.services.create_enquiry -
    creates a brand new (real, permanent) Parent plus the Enquiry in one
    transaction. No Student row yet."""

    parent = ParentInputSerializer()
    student_name = serializers.CharField(max_length=120)
    student_grade = serializers.CharField(max_length=20)
    subject_ids = serializers.PrimaryKeyRelatedField(
        source='subjects', queryset=Subject.objects.all(), many=True, required=False, default=list
    )
    duration_weeks = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    learning_mode = serializers.ChoiceField(
        choices=Enquiry._meta.get_field('learning_mode').choices, required=False, allow_null=True
    )
    desired_start_date = serializers.DateField(required=False, allow_null=True)

    def create(self, validated_data):
        from .services import create_enquiry

        return create_enquiry(
            parent_data=validated_data['parent'],
            student_name=validated_data['student_name'],
            student_grade=validated_data['student_grade'],
            subject_ids=[s.id for s in validated_data.get('subjects', [])],
            duration_weeks=validated_data.get('duration_weeks'),
            learning_mode=validated_data.get('learning_mode'),
            desired_start_date=validated_data.get('desired_start_date'),
            created_by=self.context['request'].user,
        )


class EnquiryUpdateSerializer(serializers.ModelSerializer):
    """PATCH /enquiries/{id}/ - everything except `stage`, which only ever
    moves through the audited change-stage endpoint."""

    interested_subjects = serializers.PrimaryKeyRelatedField(
        queryset=Subject.objects.all(), many=True, required=False
    )

    class Meta:
        model = Enquiry
        fields = [
            'student_name',
            'student_grade',
            'interested_subjects',
            'duration_weeks',
            'learning_mode',
            'desired_start_date',
            'meeting_datetime',
            'notes',
        ]


class ChangeStageSerializer(serializers.Serializer):
    new_stage = serializers.ChoiceField(choices=EnquiryStage.choices)
    note = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_new_stage(self, value):
        if value == EnquiryStage.ENROLLED:
            raise serializers.ValidationError(
                'ENROLLED is set automatically on first payment, not chosen manually.'
            )
        return value
