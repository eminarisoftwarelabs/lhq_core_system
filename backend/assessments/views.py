from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from clients.models import Student

from .models import Assessment, AssessmentCategory
from .serializers import AssessmentCreateSerializer, AssessmentSerializer
from .services import can_assess, can_view_assessments


class StudentAssessmentListCreateView(APIView):
    """GET /students/{id}/assessments/[?category=ACADEMIC|BEHAVIOURAL][&subject=<id>]
    - the student's whole assessment record, newest first, unpaginated.
    Staff see any student's; a tutor sees it only for a student they
    currently teach (404 otherwise, hiding existence the same way
    clients.SubjectRosterView does) - including what other tutors wrote.

    POST body {subject, category, comment}: only the tutor assigned to
    that Subject, and only for a student actively enrolled in it."""

    permission_classes = [IsAuthenticated]

    def _get_student(self, request, pk):
        try:
            student = Student.objects.get(pk=pk)
        except Student.DoesNotExist:
            raise NotFound()
        if not can_view_assessments(request.user, student):
            raise NotFound()
        return student

    @extend_schema(
        parameters=[
            OpenApiParameter('category', str, enum=AssessmentCategory.values),
            OpenApiParameter('subject', int),
        ],
        responses=AssessmentSerializer(many=True),
    )
    def get(self, request, pk):
        student = self._get_student(request, pk)
        assessments = Assessment.objects.filter(student=student).select_related('subject')

        category = request.query_params.get('category')
        if category:
            if category not in AssessmentCategory.values:
                raise ValidationError({'category': [f'Must be one of: {", ".join(AssessmentCategory.values)}.']})
            assessments = assessments.filter(category=category)

        subject_id = request.query_params.get('subject')
        if subject_id:
            if not subject_id.isdigit():
                raise ValidationError({'subject': ['Must be a subject id.']})
            assessments = assessments.filter(subject_id=subject_id)

        return Response(AssessmentSerializer(assessments, many=True).data)

    @extend_schema(request=AssessmentCreateSerializer, responses={201: AssessmentSerializer})
    def post(self, request, pk):
        student = self._get_student(request, pk)
        payload = AssessmentCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        if not can_assess(request.user, student, payload.validated_data['subject']):
            raise PermissionDenied('You can only assess students enrolled in a subject you teach.')
        assessment = payload.save(
            student=student, author=request.user, author_name=request.user.full_name or request.user.email
        )
        return Response(AssessmentSerializer(assessment).data, status=status.HTTP_201_CREATED)
