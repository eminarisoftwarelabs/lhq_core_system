from django.utils import timezone
from rest_framework import serializers

from .models import Guardianship, Parent, Student


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
            'enrolled_on',
            'guardianships',
        ]
        read_only_fields = fields


class StudentEnrolledOnSerializer(serializers.ModelSerializer):
    """Staff edit of the enrolment date, the only student field editable
    through this API. Students are created by the enrolment flow."""

    class Meta:
        model = Student
        fields = ['enrolled_on']

    def validate_enrolled_on(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('The enrolment date cannot be in the future.')
        return value
