"""Timetable API (Feature 2). Thin: parse, check who may see the row,
call academics.scheduling, serialize.

Privacy: a tutor only ever reaches their own student subjects, sessions
and requests; anything else is a 404 (existence hidden), the same
convention as the Feature 1 tutor views."""

from contextlib import contextmanager
from datetime import date

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsStaffLevel
from accounts.tutor_views import visible_tutor
from clients.models import Student

from . import scheduling_serializers as s
from .models import SessionChangeStatus, StudentSubjectStatus, TimetableSlot
from .scheduling import availability, changes, clashes, generation, hours, session_log, student_subjects, times

# Longest range one GET /sessions/ may ask for.
MAX_RANGE_DAYS = 62


@contextmanager
def as_api_errors():
    """Service errors -> HTTP: ValidationError 400, PermissionDenied 403,
    BookingConflict 409 with the warnings."""
    try:
        yield
    except DjangoValidationError as exc:
        raise ValidationError(exc.message_dict if hasattr(exc, 'error_dict') else {'detail': exc.messages})
    except DjangoPermissionDenied as exc:
        raise PermissionDenied(str(exc) or None)


def conflict_response(request, exc):
    return Response(
        {
            'detail': exc.message,
            'code': 'BOOKING_CONFLICT',
            'warnings': exc.as_dict(),
            # Staff may resend with allow_clash: true; a tutor may not.
            'can_override': bool(request.user.is_staff_level),
        },
        status=status.HTTP_409_CONFLICT,
    )


def run(request, fn):
    """Calls fn() and maps BookingConflict to a 409 response. Returns
    (result, None) or (None, response)."""
    try:
        with as_api_errors():
            return fn(), None
    except clashes.BookingConflict as exc:
        return None, conflict_response(request, exc)


def _int_param(params, name):
    value = params.get(name)
    if value in (None, ''):
        return None
    if not str(value).isdigit():
        raise ValidationError({name: ['Must be an id.']})
    return int(value)


def _date_param(params, name, required=False):
    value = params.get(name)
    if not value:
        if required:
            raise ValidationError({name: ['Required (YYYY-MM-DD).']})
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValidationError({name: ['Use YYYY-MM-DD.']})


def own_profile_id(user):
    profile = getattr(user, 'tutor_profile', None)
    return profile.pk if profile else None


# -- student subjects ---------------------------------------------------------------


def visible_student_subjects(user):
    qs = s.student_subject_queryset()
    if user.is_staff_level:
        return qs
    return qs.filter(tutor_id=own_profile_id(user))


def get_student_subject(request, pk):
    ss = visible_student_subjects(request.user).filter(pk=pk).first()
    if ss is None:
        raise NotFound()
    return ss


def ss_response(request, pk, code=200):
    ss = get_student_subject(request, pk)
    return Response(s.StudentSubjectSerializer(ss, context={'request': request}).data, status=code)


class StudentSubjectListView(APIView):
    """GET /student-subjects/?student=&tutor=&subject=&status= - staff all,
    a tutor only their own. Unpaginated. POST (staff) creates one with its
    weekly slots and generates its sessions; a clash is a 409 that staff
    may override with allow_clash."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter('student', int),
            OpenApiParameter('tutor', int, description='Tutor profile id.'),
            OpenApiParameter('subject', int),
            OpenApiParameter('status', str, description='ACTIVE, ENDED or CANCELLED.'),
        ],
        responses=s.StudentSubjectSerializer(many=True),
    )
    def get(self, request):
        params = request.query_params
        qs = visible_student_subjects(request.user)
        for name in ('student', 'tutor', 'subject'):
            value = _int_param(params, name)
            if value is not None:
                qs = qs.filter(**{f'{name}_id': value})
        status_param = params.get('status')
        if status_param:
            if status_param not in StudentSubjectStatus.values:
                raise ValidationError({'status': [f'Must be one of: {", ".join(StudentSubjectStatus.values)}.']})
            qs = qs.filter(status=status_param)
        generation.generate_sessions(student_subjects=list(qs.values_list('pk', flat=True)))
        return Response(s.StudentSubjectSerializer(qs, many=True, context={'request': request}).data)

    @extend_schema(request=s.StudentSubjectCreateSerializer, responses={201: s.StudentSubjectSerializer})
    def post(self, request):
        if not request.user.is_staff_level:
            raise PermissionDenied('Only staff can create student subjects.')
        body = s.StudentSubjectCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        allow = data.pop('allow_clash')
        result, error = run(request, lambda: student_subjects.create_student_subject(request.user, allow_clash=allow, **data))
        if error:
            return error
        return ss_response(request, result[0].pk, 201)


class StudentSubjectDetailView(APIView):
    """GET (staff, or the tutor's own) / PATCH (staff)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=s.StudentSubjectSerializer)
    def get(self, request, pk):
        ss = get_student_subject(request, pk)
        generation.regenerate(ss)
        return ss_response(request, pk)

    @extend_schema(request=s.StudentSubjectPatchSerializer, responses=s.StudentSubjectSerializer)
    def patch(self, request, pk):
        ss = get_student_subject(request, pk)
        if not request.user.is_staff_level:
            raise PermissionDenied('Only staff can change student subjects.')
        body = s.StudentSubjectPatchSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        allow = data.pop('allow_clash')
        _, error = run(request, lambda: student_subjects.update_student_subject(ss, request.user, data, allow))
        return error or ss_response(request, pk)


class StudentSubjectSlotsView(APIView):
    """POST /student-subjects/{id}/slots/ {weekday, start_time, end_time,
    allow_clash?} - staff."""

    permission_classes = [IsStaffLevel]

    @extend_schema(request=s.SlotCreateSerializer, responses={201: s.StudentSubjectSerializer})
    def post(self, request, pk):
        ss = get_student_subject(request, pk)
        body = s.SlotCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        allow = data.pop('allow_clash')
        _, error = run(request, lambda: student_subjects.add_slot(ss, request.user, data, allow))
        return error or ss_response(request, pk, 201)


class SlotDetailView(APIView):
    """PATCH / DELETE /slots/{id}/ - staff. Future sessions of the slot are
    regenerated; past and logged ones are kept."""

    permission_classes = [IsStaffLevel]

    def _get(self, pk):
        slot = TimetableSlot.objects.select_related('student_subject__tutor').filter(pk=pk).first()
        if slot is None:
            raise NotFound()
        return slot

    @extend_schema(request=s.SlotPatchSerializer, responses=s.StudentSubjectSerializer)
    def patch(self, request, pk):
        slot = self._get(pk)
        body = s.SlotPatchSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        allow = data.pop('allow_clash')
        _, error = run(request, lambda: student_subjects.update_slot(slot, request.user, data, allow))
        return error or ss_response(request, slot.student_subject_id)

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        slot = self._get(pk)
        with as_api_errors():
            student_subjects.delete_slot(slot, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConfirmEndView(APIView):
    """POST /student-subjects/{id}/confirm-end/ {last_date} - staff."""

    permission_classes = [IsStaffLevel]

    @extend_schema(request=s.ConfirmEndSerializer, responses=s.StudentSubjectSerializer)
    def post(self, request, pk):
        ss = get_student_subject(request, pk)
        body = s.ConfirmEndSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with as_api_errors():
            student_subjects.confirm_end(ss, body.validated_data['last_date'], request.user)
        return ss_response(request, pk)


class AddSessionsView(APIView):
    """POST /student-subjects/{id}/add-sessions/ {count} - staff."""

    permission_classes = [IsStaffLevel]

    @extend_schema(request=s.AddSessionsSerializer, responses=s.StudentSubjectSerializer)
    def post(self, request, pk):
        ss = get_student_subject(request, pk)
        body = s.AddSessionsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with as_api_errors():
            student_subjects.add_sessions(ss, body.validated_data['count'], request.user)
        return ss_response(request, pk)


class StudentSubjectsForStudentView(APIView):
    """GET /students/{id}/subjects/ - every student subject of the student,
    for the student page. Staff."""

    permission_classes = [IsStaffLevel]

    @extend_schema(responses=s.StudentSubjectSerializer(many=True))
    def get(self, request, pk):
        if not Student.objects.filter(pk=pk).exists():
            raise NotFound()
        qs = s.student_subject_queryset().filter(student_id=pk)
        generation.generate_sessions(student_subjects=list(qs.values_list('pk', flat=True)))
        return Response(s.StudentSubjectSerializer(qs, many=True, context={'request': request}).data)


# -- sessions --------------------------------------------------------------------------


def visible_sessions(user):
    qs = s.session_queryset()
    if user.is_staff_level:
        return qs
    return qs.filter(student_subject__tutor_id=own_profile_id(user))


def get_session(request, pk):
    session = visible_sessions(request.user).filter(pk=pk).first()
    if session is None:
        raise NotFound()
    return session


def session_detail(request, pk, code=200):
    session = get_session(request, pk)
    return Response(s.SessionDetailSerializer(session, context={'request': request}).data, status=code)


class SessionListView(APIView):
    """GET /sessions/?from=&to=[&tutor=&student=&subject=&student_subject=]
    - every session in the date range (inclusive, at most 62 days),
    generating any that are due first. Staff see all; a tutor only their
    own (filters cannot widen that). Unpaginated."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter('from', str, required=True, description='YYYY-MM-DD'),
            OpenApiParameter('to', str, required=True, description='YYYY-MM-DD, inclusive'),
            OpenApiParameter('tutor', int, description='Tutor profile id.'),
            OpenApiParameter('student', int),
            OpenApiParameter('subject', int),
            OpenApiParameter('student_subject', int),
        ],
        responses=s.SessionSerializer(many=True),
    )
    def get(self, request):
        params = request.query_params
        first = _date_param(params, 'from', required=True)
        last = _date_param(params, 'to', required=True)
        if last < first:
            raise ValidationError({'to': ['Must be on or after from.']})
        if (last - first).days > MAX_RANGE_DAYS:
            raise ValidationError({'to': [f'Ask for at most {MAX_RANGE_DAYS} days at a time.']})

        ss_qs = visible_student_subjects(request.user)
        qs = visible_sessions(request.user).filter(date__gte=first, date__lte=last)
        # query param -> (lookup on Session, lookup on StudentSubject)
        filters = {
            'tutor': ('student_subject__tutor_id', 'tutor_id'),
            'student': ('student_subject__student_id', 'student_id'),
            'subject': ('student_subject__subject_id', 'subject_id'),
            'student_subject': ('student_subject_id', 'pk'),
        }
        for name, (session_lookup, ss_lookup) in filters.items():
            value = _int_param(params, name)
            if value is not None:
                qs = qs.filter(**{session_lookup: value})
                ss_qs = ss_qs.filter(**{ss_lookup: value})
        generation.generate_sessions(until=last, student_subjects=list(ss_qs.values_list('pk', flat=True)))
        moment = times.now()
        return Response(s.SessionSerializer(qs, many=True, context={'request': request, 'moment': moment}).data)


class SessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=s.SessionDetailSerializer)
    def get(self, request, pk):
        return session_detail(request, pk)


class SessionLogView(APIView):
    """POST /sessions/{id}/log/ {held, reason?, topic_ids?, admin_note?}."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=s.LogSessionSerializer, responses=s.SessionDetailSerializer)
    def post(self, request, pk):
        session = get_session(request, pk)
        body = s.LogSessionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        with as_api_errors():
            session_log.log_session(
                session, request.user, data['held'], data['reason'], data['topic_ids'], data['admin_note']
            )
        return session_detail(request, pk)


class SessionPlanView(APIView):
    """PUT /sessions/{id}/plan/ {topic_ids} - the session's tutor or staff
    set the topics it will cover (replaces the old weekly lesson plans)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=s.PlanSessionSerializer, responses=s.SessionDetailSerializer)
    def put(self, request, pk):
        session = get_session(request, pk)
        body = s.PlanSessionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with as_api_errors():
            session_log.set_plan(session, request.user, body.validated_data['topic_ids'])
        return session_detail(request, pk)


class SessionMoveView(APIView):
    """POST /sessions/{id}/move/ - staff, directly. Answers with the new
    one-off session."""

    permission_classes = [IsStaffLevel]

    @extend_schema(request=s.MoveSessionSerializer, responses={201: s.SessionDetailSerializer})
    def post(self, request, pk):
        session = get_session(request, pk)
        body = s.MoveSessionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        d = body.validated_data
        result, error = run(
            request,
            lambda: changes.move_session(
                session, request.user, d['new_date'], d['new_start_time'], d['new_end_time'], d['reason'], d['allow_clash']
            ),
        )
        return error or session_detail(request, result[0].pk, 201)


class SessionCancelView(APIView):
    """POST /sessions/{id}/cancel/ {reason} - staff, directly."""

    permission_classes = [IsStaffLevel]

    @extend_schema(request=s.CancelSessionSerializer, responses=s.SessionDetailSerializer)
    def post(self, request, pk):
        session = get_session(request, pk)
        body = s.CancelSessionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with as_api_errors():
            changes.cancel_session(session, request.user, body.validated_data['reason'])
        return session_detail(request, pk)


class SessionChangeRequestCreateView(APIView):
    """POST /sessions/{id}/change-requests/ {kind, reason, new_date?,
    new_start_time?, new_end_time?} - the session's tutor asks."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=s.ChangeRequestCreateSerializer, responses={201: s.SessionDetailSerializer})
    def post(self, request, pk):
        session = get_session(request, pk)
        body = s.ChangeRequestCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        d = body.validated_data
        _, error = run(
            request,
            lambda: changes.request_session_change(
                session, request.user, d['kind'], d['reason'], d.get('new_date'), d.get('new_start_time'), d.get('new_end_time')
            ),
        )
        return error or session_detail(request, pk, 201)


def visible_change_requests(user):
    qs = s.change_request_queryset()
    if user.is_staff_level:
        return qs
    return qs.filter(session__student_subject__tutor_id=own_profile_id(user))


def get_change_request(request, pk):
    change = visible_change_requests(request.user).filter(pk=pk).first()
    if change is None:
        raise NotFound()
    return change


def change_response(request, pk):
    return Response(s.StaffChangeRequestSerializer(get_change_request(request, pk)).data)


class SessionChangeRequestListView(APIView):
    """GET /session-change-requests/?status=PENDING - staff all, a tutor
    their own. Newest first, unpaginated."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter('status', str, description='PENDING, APPROVED, REJECTED or CANCELLED.')],
        responses=s.StaffChangeRequestSerializer(many=True),
    )
    def get(self, request):
        qs = visible_change_requests(request.user)
        status_param = request.query_params.get('status')
        if status_param:
            if status_param not in SessionChangeStatus.values:
                raise ValidationError({'status': [f'Must be one of: {", ".join(SessionChangeStatus.values)}.']})
            qs = qs.filter(status=status_param)
        return Response(s.StaffChangeRequestSerializer(qs, many=True).data)


class SessionChangeRequestApproveView(APIView):
    """POST /session-change-requests/{id}/approve/ {allow_clash?} - staff.
    A move that now clashes is a 409 unless allow_clash."""

    permission_classes = [IsStaffLevel]

    @extend_schema(request=s.ApproveSerializer, responses=s.StaffChangeRequestSerializer)
    def post(self, request, pk):
        change = get_change_request(request, pk)
        body = s.ApproveSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        _, error = run(
            request, lambda: changes.approve_session_change(change, request.user, body.validated_data['allow_clash'])
        )
        return error or change_response(request, pk)


class SessionChangeRequestRejectView(APIView):
    """POST /session-change-requests/{id}/reject/ {reason} - staff."""

    permission_classes = [IsStaffLevel]

    @extend_schema(request=s.RejectSerializer, responses=s.StaffChangeRequestSerializer)
    def post(self, request, pk):
        change = get_change_request(request, pk)
        body = s.RejectSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with as_api_errors():
            changes.reject_session_change(change, request.user, body.validated_data['reason'])
        return change_response(request, pk)


class SessionChangeRequestWithdrawView(APIView):
    """POST /session-change-requests/{id}/withdraw/ - the tutor takes back
    their own pending request."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=s.StaffChangeRequestSerializer)
    def post(self, request, pk):
        change = get_change_request(request, pk)
        with as_api_errors():
            changes.withdraw_session_change(change, request.user)
        return change_response(request, pk)


# -- tutors ----------------------------------------------------------------------------------


class TutorFreeSlotsView(APIView):
    """GET /tutors/{id}/free-slots/?week=YYYY-MM-DD (any day; snapped to its
    Monday, default this week) - staff, or the tutor themself."""

    permission_classes = [IsAuthenticated]

    @extend_schema(parameters=[OpenApiParameter('week', str)], responses={200: dict})
    def get(self, request, pk):
        tutor = visible_tutor(request, pk)
        day = _date_param(request.query_params, 'week') or times.today()
        monday = times.week_start(day)
        days = availability.free_slots(tutor, monday)
        return Response({'week_start': monday, 'days': days})


class TutorHoursView(APIView):
    """GET /tutors/{id}/hours/?month=YYYY-MM (default this month) - staff,
    or the tutor themself."""

    permission_classes = [IsAuthenticated]

    @extend_schema(parameters=[OpenApiParameter('month', str)], responses={200: dict})
    def get(self, request, pk):
        tutor = visible_tutor(request, pk)
        month = request.query_params.get('month')
        if month:
            try:
                first = times.parse_month(month)
            except ValueError:
                raise ValidationError({'month': ['Use YYYY-MM.']})
        else:
            first = times.today().replace(day=1)
        return Response(hours.tutor_hours(tutor, first))

