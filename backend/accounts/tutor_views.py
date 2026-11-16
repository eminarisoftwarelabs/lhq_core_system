"""Tutor subjects, working hours and change requests (Feature 1).

Privacy: a tutor only ever reaches their own rows. Any other tutor's id is
a 404, the same existence-hiding convention as UserDetailView."""

from contextlib import contextmanager

from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import ChangeStatus, Role, TutorChangeRequest, TutorProfile
from .permissions import IsStaffLevel
from .serializers import (
    ChangeRequestSerializer,
    ChangeRequestSubmitSerializer,
    RejectSerializer,
    StaffChangeRequestSerializer,
    TutorSubjectsWriteSerializer,
    WorkingHoursItemSerializer,
    WorkingHoursWriteSerializer,
    subjects_for_ids,
)

# A tutor's own history: enough to show the latest per kind and a few
# before it, without growing forever.
OWN_HISTORY_LIMIT = 20


@contextmanager
def as_api_errors():
    """Services raise Django's ValidationError; turn it into DRF's 400."""
    try:
        yield
    except DjangoValidationError as exc:
        raise ValidationError(exc.message_dict if hasattr(exc, 'error_dict') else {'detail': exc.messages})


def visible_tutor(request, pk):
    """The TutorProfile at pk if the requester may see it: any staff
    member, or the tutor themself. 404 otherwise."""
    tutor = TutorProfile.objects.select_related('user').filter(pk=pk).first()
    if tutor is None:
        raise NotFound()
    user = request.user
    if user.is_staff_level or tutor.user_id == user.pk:
        return tutor
    raise NotFound()


def editable_tutor(request, pk):
    tutor = visible_tutor(request, pk)
    if not services.can_review(request.user, tutor):
        raise PermissionDenied(
            'Only staff can change this directly. Tutors send a change request from My Profile instead.'
        )
    return tutor


def own_tutor_profile(request):
    profile = getattr(request.user, 'tutor_profile', None)
    if profile is None:
        raise NotFound('You do not have a tutor profile.')
    return profile


class TutorSubjectsView(APIView):
    """GET /tutors/{id}/subjects/ - the subjects this tutor teaches now.
    PUT body {subjects: [ids]} replaces them straight away (staff only, no
    approval)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request, pk):
        tutor = visible_tutor(request, pk)
        return Response(subjects_for_ids(services.current_subject_ids(tutor)))

    @extend_schema(request=TutorSubjectsWriteSerializer, responses={200: dict})
    def put(self, request, pk):
        tutor = editable_tutor(request, pk)
        body = TutorSubjectsWriteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with as_api_errors():
            ids = services.set_tutor_subjects(tutor, body.validated_data['subjects'])
        return Response(subjects_for_ids(ids))


class TutorWorkingHoursView(APIView):
    """GET /tutors/{id}/working-hours/ - [{weekday, start_time, end_time}],
    0 = Monday ... 6 = Sunday, times "HH:MM". PUT body {working_hours: [...]}
    replaces the whole week straight away (staff only)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=WorkingHoursItemSerializer(many=True))
    def get(self, request, pk):
        tutor = visible_tutor(request, pk)
        return Response(services.current_working_hours(tutor))

    @extend_schema(request=WorkingHoursWriteSerializer, responses=WorkingHoursItemSerializer(many=True))
    def put(self, request, pk):
        tutor = editable_tutor(request, pk)
        body = WorkingHoursWriteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with as_api_errors():
            hours = services.set_working_hours(tutor, body.validated_data['working_hours'])
        return Response(hours)


class MyChangeRequestsView(APIView):
    """GET /tutors/me/change-requests/ - the signed-in tutor's own requests,
    newest first. POST {kind, proposed, note} submits one; it replaces
    (cancels) any pending request of the same kind."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ChangeRequestSerializer(many=True))
    def get(self, request):
        tutor = own_tutor_profile(request)
        changes = tutor.change_requests.select_related('tutor__user', 'reviewed_by')[:OWN_HISTORY_LIMIT]
        return Response(ChangeRequestSerializer(changes, many=True).data)

    @extend_schema(request=ChangeRequestSubmitSerializer, responses={201: ChangeRequestSerializer})
    def post(self, request):
        tutor = own_tutor_profile(request)
        body = ChangeRequestSubmitSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with as_api_errors():
            change = services.submit_change(
                tutor, body.validated_data['kind'], body.validated_data['proposed'], body.validated_data.get('note', '')
            )
        return Response(ChangeRequestSerializer(change).data, status=201)


class MyChangeRequestCancelView(APIView):
    """POST /tutors/me/change-requests/{id}/cancel/ - withdraw a pending
    request. Another tutor's request id is a 404."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=ChangeRequestSerializer)
    def post(self, request, pk):
        tutor = own_tutor_profile(request)
        change = tutor.change_requests.filter(pk=pk).first()
        if change is None:
            raise NotFound()
        with as_api_errors():
            change = services.cancel_change(change, tutor)
        return Response(ChangeRequestSerializer(change).data)


def reviewable_requests(user):
    """Change requests `user` may review: OWNER/SYS_ADMIN all, ADMIN only
    those from role=TUTOR accounts (has_staff_scope_over)."""
    qs = TutorChangeRequest.objects.select_related('tutor__user', 'reviewed_by')
    if user.role == Role.ADMIN:
        qs = qs.filter(tutor__user__role=Role.TUTOR)
    return qs


class ChangeRequestListView(APIView):
    """GET /change-requests/?status=PENDING[&tutor=<tutor profile id>] -
    staff review queue, newest first, with each tutor's current values
    next to the proposed ones. Unpaginated."""

    permission_classes = [IsStaffLevel]

    @extend_schema(
        parameters=[
            OpenApiParameter('status', str, description='PENDING, APPROVED, REJECTED or CANCELLED.'),
            OpenApiParameter('tutor', int, description='Only this tutor profile.'),
        ],
        responses=StaffChangeRequestSerializer(many=True),
    )
    def get(self, request):
        qs = reviewable_requests(request.user)
        status_param = request.query_params.get('status')
        if status_param:
            if status_param not in ChangeStatus.values:
                raise ValidationError({'status': [f'Must be one of: {", ".join(ChangeStatus.values)}.']})
            qs = qs.filter(status=status_param)
        tutor_param = request.query_params.get('tutor')
        if tutor_param:
            if not tutor_param.isdigit():
                raise ValidationError({'tutor': ['Must be a tutor profile id.']})
            qs = qs.filter(tutor_id=int(tutor_param))
        return Response(StaffChangeRequestSerializer(qs, many=True).data)


def _reviewable(request, pk):
    change = reviewable_requests(request.user).filter(pk=pk).first()
    if change is None:
        raise NotFound()
    return change


class ChangeRequestApproveView(APIView):
    """POST /change-requests/{id}/approve/ - applies the proposal."""

    permission_classes = [IsStaffLevel]

    @extend_schema(request=None, responses=StaffChangeRequestSerializer)
    def post(self, request, pk):
        change = _reviewable(request, pk)
        with as_api_errors():
            change = services.approve_change(change, request.user)
        return Response(StaffChangeRequestSerializer(change).data)


class ChangeRequestRejectView(APIView):
    """POST /change-requests/{id}/reject/ body {reason} - live data stays."""

    permission_classes = [IsStaffLevel]

    @extend_schema(request=RejectSerializer, responses=StaffChangeRequestSerializer)
    def post(self, request, pk):
        change = _reviewable(request, pk)
        body = RejectSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with as_api_errors():
            change = services.reject_change(change, request.user, body.validated_data['reason'])
        return Response(StaffChangeRequestSerializer(change).data)
