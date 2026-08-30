from rest_framework import serializers

from .models import Guardianship, Parent, Student


class ParentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Parent
        fields = ['id', 'full_name', 'phone', 'email', 'location']
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
        fields = ['id', 'student_number', 'full_name', 'grade', 'guardianships']
        read_only_fields = fields
