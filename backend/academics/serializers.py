from rest_framework import serializers

from .models import Level, School, StudentSubjectStatus, Subject, Topic


class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = ['id', 'name', 'is_active']
        read_only_fields = ['id']


class LevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Level
        fields = ['id', 'name', 'order', 'year_groups', 'is_active']
        read_only_fields = fields


class TopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Topic
        fields = ['id', 'number', 'name', 'extended_only', 'order']
        read_only_fields = fields


class ChapterSerializer(serializers.Serializer):
    chapter = serializers.CharField()
    topics = TopicSerializer(many=True)


class SubjectSerializer(serializers.ModelSerializer):
    """Read serializer, also the base for create/update below.

    `tutors` (who teaches it) is only included for staff; a tutor's
    response never lists other tutors. `taught_by_me` is for everyone, so
    the UI can tell which catalog subjects the viewer teaches."""

    level_name = serializers.CharField(source='level.name', read_only=True)
    taught_by_me = serializers.SerializerMethodField()

    class Meta:
        model = Subject
        fields = [
            'id',
            'level',
            'level_name',
            'name',
            'code',
            'has_paper',
            'is_active',
            'taught_by_me',
        ]
        read_only_fields = ['id']

    def _viewer(self):
        request = self.context.get('request')
        return getattr(request, 'user', None)

    def get_fields(self):
        fields = super().get_fields()
        viewer = self._viewer()
        if viewer is not None and getattr(viewer, 'is_staff_level', False):
            fields['tutors'] = serializers.SerializerMethodField()
            fields['tutor_count'] = serializers.SerializerMethodField()
            fields['active_student_count'] = serializers.SerializerMethodField()
        return fields

    def get_tutor_count(self, obj) -> int:
        # Annotated by views.subject_queryset; counted here for objects
        # that did not come from it (a just-created subject).
        count = getattr(obj, 'tutor_count', None)
        return count if count is not None else obj.tutor_links.count()

    def get_active_student_count(self, obj) -> int:
        count = getattr(obj, 'active_student_count', None)
        if count is not None:
            return count
        return obj.student_subjects.filter(status=StudentSubjectStatus.ACTIVE).count()

    def get_tutors(self, obj) -> list:
        links = sorted(obj.tutor_links.all(), key=lambda link: (link.tutor.user.full_name or '').lower())
        return [{'id': link.tutor_id, 'name': link.tutor.user.full_name or link.tutor.user.email} for link in links]

    def get_taught_by_me(self, obj) -> bool:
        viewer = self._viewer()
        profile = getattr(viewer, 'tutor_profile', None) if viewer is not None else None
        if profile is None:
            return False
        return any(link.tutor_id == profile.id for link in obj.tutor_links.all())
