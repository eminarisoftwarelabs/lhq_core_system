from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsStaffLevel

from .models import Enrollment
from .serializers import EnrollmentCreateSerializer, EnrollmentSerializer
from .services import withdraw


class EnrollmentListCreateView(generics.ListCreateAPIView):
    """GET: optionally filtered by ?student=<id>, e.g. for a student detail
    page showing enrollment history. POST: the "returning student renewal"
    path - creates an Enrollment directly against an existing Student, no
    Enquiry involved."""

    permission_classes = [IsStaffLevel]
    queryset = Enrollment.objects.select_related('student').prefetch_related('subjects')

    def get_serializer_class(self):
        return EnrollmentCreateSerializer if self.request.method == 'POST' else EnrollmentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        student_id = self.request.query_params.get('student')
        if student_id:
            qs = qs.filter(student_id=student_id)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = EnrollmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enrollment = serializer.save()
        return Response(EnrollmentSerializer(enrollment).data, status=status.HTTP_201_CREATED)


class EnrollmentDetailView(generics.RetrieveAPIView):
    permission_classes = [IsStaffLevel]
    serializer_class = EnrollmentSerializer
    queryset = Enrollment.objects.select_related('student').prefetch_related('subjects')


class WithdrawEnrollmentView(APIView):
    """POST /api/enrollments/{id}/withdraw/ body: {reason}."""

    permission_classes = [IsStaffLevel]

    def _get(self, pk):
        try:
            return Enrollment.objects.get(pk=pk)
        except Enrollment.DoesNotExist:
            raise NotFound()

    @extend_schema(responses=EnrollmentSerializer)
    def post(self, request, pk):
        enrollment = self._get(pk)
        withdraw(enrollment, reason=request.data.get('reason', ''))
        return Response(EnrollmentSerializer(enrollment).data)
