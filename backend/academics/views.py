from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import LessonPlan, Level, School, Subject, Topic
from .serializers import (
    ChapterSerializer,
    CopyWeekSerializer,
    LessonPlanRangeSerializer,
    LessonPlanSerializer,
    LessonPlanWriteSerializer,
    LevelSerializer,
    SchoolSerializer,
    SubjectSerializer,
)
from .services import plannable_subjects, taught_subjects, topics_by_chapter


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
    return Subject.objects.select_related('level', 'timetable_slot').prefetch_related('tutor_links__tutor__user')


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


def _plannable_subject(request, subject_id):
    """The Subject a user may read or write lesson plans for: staff any,
    anyone else only a subject they teach (404 otherwise)."""
    subject = plannable_subjects(request.user).filter(pk=subject_id).first()
    if subject is None:
        raise NotFound()
    return subject


class LessonPlanListView(APIView):
    """GET /lesson-plans/?from=<monday>[&to=<monday>] - every plan in that
    range of weeks (inclusive) the user can see: staff all, a Tutor only
    their own subjects'. Unpaginated; the range is capped at a year."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter('from', str, required=True, description='First week (a Monday, YYYY-MM-DD).'),
            OpenApiParameter('to', str, description='Last week (a Monday), inclusive. Defaults to `from`.'),
        ],
        responses=LessonPlanSerializer(many=True),
    )
    def get(self, request):
        params = LessonPlanRangeSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        subjects = plannable_subjects(request.user)
        plans = LessonPlan.objects.select_related('topic', 'updated_by').filter(
            subject__in=subjects,
            week_start__gte=params.validated_data['from_week'],
            week_start__lte=params.validated_data['to_week'],
        )
        return Response(LessonPlanSerializer(plans, many=True).data)


class LessonPlanWeekView(APIView):
    """PUT /subjects/{id}/lesson-plans/{week_start}/ body {topic} sets or
    changes that week's plan (upsert); {topic: null} clears it (204).
    Staff, or the Subject's own Tutor."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=LessonPlanWriteSerializer, responses={200: LessonPlanSerializer, 204: None})
    def put(self, request, subject_id, week_start):
        subject = _plannable_subject(request, subject_id)
        payload = LessonPlanWriteSerializer(
            data={'week_start': week_start, 'topic': request.data.get('topic')}, context={'subject': subject}
        )
        payload.is_valid(raise_exception=True)
        week = payload.validated_data['week_start']
        topic = payload.validated_data['topic']

        if topic is None:
            LessonPlan.objects.filter(subject=subject, week_start=week).delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        plan, _ = LessonPlan.objects.update_or_create(
            subject=subject, week_start=week, defaults={'topic': topic, 'updated_by': request.user}
        )
        return Response(LessonPlanSerializer(plan).data)


class LessonPlanCopyWeekView(APIView):
    """POST /lesson-plans/copy-week/ body {from_week, to_week}: re-use one
    week's topics for another. Only fills subjects with no plan yet in
    to_week - it never overwrites something already planned. A Tutor
    copies only their own subjects. Returns {copied, skipped}."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=CopyWeekSerializer, responses={200: dict})
    def post(self, request):
        payload = CopyWeekSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        source, target = payload.validated_data['from_week'], payload.validated_data['to_week']
        subjects = plannable_subjects(request.user)

        copied = skipped = 0
        with transaction.atomic():
            already = set(
                LessonPlan.objects.filter(subject__in=subjects, week_start=target).values_list('subject_id', flat=True)
            )
            for plan in LessonPlan.objects.filter(subject__in=subjects, week_start=source):
                if plan.subject_id in already:
                    skipped += 1
                    continue
                LessonPlan.objects.create(
                    subject_id=plan.subject_id, week_start=target, topic_id=plan.topic_id, updated_by=request.user
                )
                copied += 1
        return Response({'copied': copied, 'skipped': skipped})
