from django.db import transaction
from django.db.models import ProtectedError
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import LessonPlan, School, Subject, Topic
from .serializers import (
    CopyWeekSerializer,
    LessonPlanRangeSerializer,
    LessonPlanSerializer,
    LessonPlanWriteSerializer,
    SchoolSerializer,
    SubjectSerializer,
    TopicSerializer,
)


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


def _tutor_scoped_or_none(qs, user):
    """Staff see everything; a Tutor sees only Subjects assigned to them."""
    if user.is_staff_level:
        return qs
    tutor_profile = getattr(user, 'tutor_profile', None)
    return qs.filter(tutor=tutor_profile) if tutor_profile else qs.none()


class SubjectListCreateView(generics.ListCreateAPIView):
    """GET: staff see every Subject; a Tutor sees only their own
    (subject.tutor == request.user.tutor_profile). ?is_active=true/false
    filters either way - the onboarding subject picker uses is_active=true.
    POST: staff only."""

    serializer_class = SubjectSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Subject.objects.select_related('tutor__user', 'timetable_slot').prefetch_related('topics')
        qs = _tutor_scoped_or_none(qs, self.request.user)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('1', 'true', 'yes'))
        return qs

    def perform_create(self, serializer):
        if not self.request.user.is_staff_level:
            raise PermissionDenied('You do not have permission to create subjects.')
        serializer.save()


class SubjectDetailView(APIView):
    """GET: staff any Subject, Tutor only their own (404 otherwise, hiding
    existence the same way accounts.UserDetailView does). PATCH: staff
    only, including reassigning tutor."""

    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        try:
            subject = Subject.objects.select_related('tutor__user', 'timetable_slot').prefetch_related(
                'topics'
            ).get(pk=pk)
        except Subject.DoesNotExist:
            raise NotFound()
        if not _tutor_scoped_or_none(Subject.objects.filter(pk=pk), request.user).exists():
            raise NotFound()
        return subject

    @extend_schema(responses=SubjectSerializer)
    def get(self, request, pk):
        return Response(SubjectSerializer(self._get(request, pk)).data)

    @extend_schema(request=SubjectSerializer, responses=SubjectSerializer)
    def patch(self, request, pk):
        subject = self._get(request, pk)
        if not request.user.is_staff_level:
            raise PermissionDenied('You do not have permission to edit subjects.')
        serializer = SubjectSerializer(subject, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SubjectSerializer(subject).data)


class TopicListCreateView(generics.ListCreateAPIView):
    """Nested under a Subject. GET: same visibility as the parent Subject.
    POST: staff, or the Subject's own Tutor - planning lessons ahead often
    needs a topic nobody has added yet (see LessonPlan)."""

    serializer_class = TopicSerializer
    permission_classes = [IsAuthenticated]

    def get_subject(self):
        try:
            subject = Subject.objects.get(pk=self.kwargs['subject_id'])
        except Subject.DoesNotExist:
            raise NotFound()
        if not _tutor_scoped_or_none(
            Subject.objects.filter(pk=subject.pk), self.request.user
        ).exists():
            raise NotFound()
        return subject

    def get_queryset(self):
        return Topic.objects.filter(subject=self.get_subject())

    def perform_create(self, serializer):
        # get_subject() already 404s a Tutor on anyone else's Subject.
        serializer.save(subject=self.get_subject())


class TopicDetailView(APIView):
    """PATCH/DELETE: staff only."""

    permission_classes = [IsAuthenticated]

    def _get(self, pk):
        try:
            return Topic.objects.select_related('subject').get(pk=pk)
        except Topic.DoesNotExist:
            raise NotFound()

    @extend_schema(request=TopicSerializer, responses=TopicSerializer)
    def patch(self, request, pk):
        if not request.user.is_staff_level:
            raise PermissionDenied('You do not have permission to edit topics.')
        topic = self._get(pk)
        serializer = TopicSerializer(topic, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(TopicSerializer(topic).data)

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        if not request.user.is_staff_level:
            raise PermissionDenied('You do not have permission to delete topics.')
        topic = self._get(pk)
        try:
            topic.delete()
        except ProtectedError:
            planned = topic.lesson_plans.count()
            raise ValidationError(
                {
                    'detail': f'"{topic.name}" is planned for {planned} lesson{"s" if planned != 1 else ""}. '
                    'Change those lesson plans first.'
                }
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


def _plannable_subject(request, subject_id):
    """The Subject a user may read or write lesson plans for: staff any,
    a Tutor only their own (404 otherwise, same as SubjectDetailView)."""
    subject = _tutor_scoped_or_none(Subject.objects.filter(pk=subject_id), request.user).first()
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
        subjects = _tutor_scoped_or_none(Subject.objects.all(), request.user)
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
        subjects = _tutor_scoped_or_none(Subject.objects.all(), request.user)

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
