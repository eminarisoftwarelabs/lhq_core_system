from rest_framework import serializers

from academics.models import Subject

from .access import shared_subjects
from .models import Guardianship, Parent, Student, StudentNote


class ParentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Parent
        fields = ['id', 'full_name', 'phone', 'email', 'address', 'city']
        read_only_fields = ['id']


class GuardianshipSerializer(serializers.ModelSerializer):
    parent = ParentSerializer(read_only=True)

    class Meta:
        model = Guardianship
        fields = ['id', 'parent', 'relationship', 'is_primary_contact']
        read_only_fields = fields


class StudentSerializer(serializers.ModelSerializer):
    """Read serializer. Students are never created directly through this
    app's API - they're created by enquiries.services.enroll_student on
    first payment, or via enrollments' own create-enrollment flow for a
    returning student."""

    guardianships = GuardianshipSerializer(many=True, read_only=True)

    class Meta:
        model = Student
        fields = [
            'id',
            'student_number',
            'full_name',
            'year_group',
            'school',
            'phone',
            'email',
            'grade',
            'guardianships',
        ]
        read_only_fields = fields


class SharedSubjectsMixin(serializers.Serializer):
    """Which of the requesting user's own subjects this student is actively
    in. Drives the subject picker on the add-note form, so it is computed
    per request rather than stored."""

    shared_subjects = serializers.SerializerMethodField()

    def get_shared_subjects(self, obj):
        request = self.context.get('request')
        if request is None:
            return []
        return [{'id': s.id, 'name': s.name} for s in shared_subjects(obj, request.user)]


class StudentDetailSerializer(SharedSubjectsMixin, StudentSerializer):
    class Meta(StudentSerializer.Meta):
        fields = StudentSerializer.Meta.fields + ['shared_subjects']
        read_only_fields = fields


class StudentBasicSerializer(serializers.ModelSerializer):
    """What a tutor gets about a student: enough to teach and assess them,
    without guardian or personal contact details."""

    class Meta:
        model = Student
        fields = ['id', 'student_number', 'full_name', 'year_group', 'school', 'grade']
        read_only_fields = fields


class TutorStudentSerializer(SharedSubjectsMixin, StudentBasicSerializer):
    class Meta(StudentBasicSerializer.Meta):
        fields = StudentBasicSerializer.Meta.fields + ['shared_subjects']
        read_only_fields = fields


class StudentNoteSerializer(serializers.ModelSerializer):
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    subject_name = serializers.CharField(source='subject.name', read_only=True)

    class Meta:
        model = StudentNote
        fields = ['id', 'subject', 'subject_name', 'category', 'text', 'author', 'author_name', 'created_at']
        read_only_fields = ['id', 'subject_name', 'author', 'author_name', 'created_at']

    def validate_subject(self, subject):
        allowed = self.context['allowed_subjects']
        if not allowed.filter(pk=subject.pk).exists():
            raise serializers.ValidationError('Choose a subject you teach this student in.')
        return subject
