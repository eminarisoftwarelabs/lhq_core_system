from rest_framework import serializers

from academics.models import Subject

from .models import Assessment


class AssessmentSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True)

    class Meta:
        model = Assessment
        fields = [
            'id',
            'student',
            'subject',
            'subject_name',
            'author',
            'author_name',
            'category',
            'comment',
            'created_at',
        ]
        read_only_fields = fields


class AssessmentCreateSerializer(serializers.ModelSerializer):
    """Body for POST /students/{id}/assessments/. student and author come
    from the URL and the request, never the body."""

    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())

    class Meta:
        model = Assessment
        fields = ['subject', 'category', 'comment']

    def validate_comment(self, value):
        # TextField's own blank check runs before trimming, so a
        # whitespace-only comment needs its own refusal.
        if not value.strip():
            raise serializers.ValidationError('This field may not be blank.')
        return value.strip()
