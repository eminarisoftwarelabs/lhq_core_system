from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import School, Subject, Topic
from .serializers import SchoolSerializer, SubjectSerializer, TopicSerializer


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
    POST: staff only."""

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
        if not self.request.user.is_staff_level:
            raise PermissionDenied('You do not have permission to add topics.')
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
        topic.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
