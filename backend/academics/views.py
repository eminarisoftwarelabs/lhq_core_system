from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema
from rest_framework import generics
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Level, School, StudentSubjectStatus, Subject, Topic
from .serializers import ChapterSerializer, LevelSerializer, SchoolSerializer, SubjectSerializer
from .services import taught_subjects, topics_by_chapter


class SchoolListView(generics.ListAPIView):
    """Read-only reference list for the enquiry form's school picker.
    ?is_active=true/false filters, same convention as /api/subjects/."""

    serializer_class = SchoolSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = School.objects.all()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('1', 'true', 'yes'))
        return qs


class LevelListView(generics.ListAPIView):
    """GET /levels/ - every level, in curriculum order. Unpaginated (four
    rows)."""

    serializer_class = LevelSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    queryset = Level.objects.all()


def _truthy(value):
    return value is not None and value.lower() in ('1', 'true', 'yes')


def subject_queryset():
    # Counts for the staff thumbnail view, annotated in the same query so a
    # list of subjects stays one round trip (no per-subject counting).
    return (
        Subject.objects.select_related('level')
        .prefetch_related('tutor_links__tutor__user')
        .annotate(
            tutor_count=Count('tutor_links', distinct=True),
            active_student_count=Count(
                'student_subjects',
                filter=Q(student_subjects__status=StudentSubjectStatus.ACTIVE),
                distinct=True,
            ),
        )
    )


class SubjectListCreateView(generics.ListCreateAPIView):
    """GET: the subject catalog, visible to everyone signed in (a tutor
    needs it to pick what they teach). Filters: ?level=<id>,
    ?is_active=true/false, ?mine=true (subjects the viewer teaches),
    ?taught=true (subjects at least one tutor teaches).
    Staff responses list each subject's tutors; tutor responses do not.
    POST: staff only."""

    serializer_class = SubjectSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = subject_queryset()
        params = self.request.query_params
        level = params.get('level')
        if level:
            if not level.isdigit():
                raise ValidationError({'level': ['Must be a level id.']})
            qs = qs.filter(level_id=int(level))
        is_active = params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=_truthy(is_active))
        if _truthy(params.get('mine')):
            qs = qs.filter(pk__in=taught_subjects(self.request.user))
        if _truthy(params.get('taught')):
            qs = qs.filter(tutor_links__isnull=False).distinct()
        return qs

    def create(self, request, *args, **kwargs):
        # Refuse before validating, so a tutor gets 403 rather than a 400
        # describing fields they could never send.
        if not request.user.is_staff_level:
            raise PermissionDenied('You do not have permission to create subjects.')
        return super().create(request, *args, **kwargs)


class SubjectDetailView(APIView):
    """GET: any signed-in user (catalog entry). PATCH: staff only."""

    permission_classes = [IsAuthenticated]

    def _get(self, pk):
        try:
            return subject_queryset().get(pk=pk)
        except Subject.DoesNotExist:
            raise NotFound()

    @extend_schema(responses=SubjectSerializer)
    def get(self, request, pk):
        return Response(SubjectSerializer(self._get(pk), context={'request': request}).data)

    @extend_schema(request=SubjectSerializer, responses=SubjectSerializer)
    def patch(self, request, pk):
        subject = self._get(pk)
        if not request.user.is_staff_level:
            raise PermissionDenied('You do not have permission to edit subjects.')
        serializer = SubjectSerializer(subject, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SubjectSerializer(self._get(pk), context={'request': request}).data)


class SubjectTopicsView(APIView):
    """GET /subjects/{id}/topics/ - the subject's official syllabus,
    grouped by chapter in syllabus order: [{chapter, topics: [...]}].
    Read-only: topics come from seed_cambridge_topics, not typing."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ChapterSerializer(many=True))
    def get(self, request, subject_id):
        if not Subject.objects.filter(pk=subject_id).exists():
            raise NotFound()
        topics = Topic.objects.filter(subject_id=subject_id).order_by('order', 'id')
        return Response(ChapterSerializer(topics_by_chapter(topics), many=True).data)
