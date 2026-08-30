from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from academics.models import Subject
from accounts.permissions import IsStaffLevel
from enrollments.models import Enrollment, EnrollmentStatus

from .models import Student
from .serializers import StudentSerializer


class StudentListView(generics.ListAPIView):
    """?q= searches by name or student_number. Registered under both
    /students/ and /students/search/ - the handover doc names both paths
    for the same "returning student" lookup."""

    serializer_class = StudentSerializer
    permission_classes = [IsStaffLevel]

    def get_queryset(self):
        qs = Student.objects.prefetch_related('guardianships__parent')
        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(Q(full_name__icontains=q) | Q(student_number__icontains=q))
        return qs


class StudentDetailView(generics.RetrieveAPIView):
    serializer_class = StudentSerializer
    permission_classes = [IsStaffLevel]
    queryset = Student.objects.prefetch_related('guardianships__parent')


class TimetableEntrySerializer(serializers.Serializer):
    subject_id = serializers.IntegerField()
    subject_name = serializers.CharField()
    day_of_week = serializers.IntegerField(allow_null=True)
    start_time = serializers.TimeField(allow_null=True)
    end_time = serializers.TimeField(allow_null=True)


class StudentTimetableView(APIView):
    """Derived read: student -> active enrollment(s) -> subjects ->
    timetable_slot. No stored data - see onboarding_apps_handover.md."""

    permission_classes = [IsStaffLevel]

    @extend_schema(responses=TimetableEntrySerializer(many=True))
    def get(self, request, pk):
        try:
            student = Student.objects.get(pk=pk)
        except Student.DoesNotExist:
            raise NotFound()

        entries = []
        seen_subject_ids = set()
        active_enrollments = Enrollment.objects.filter(
            student=student, status=EnrollmentStatus.ACTIVE
        ).prefetch_related('subjects__timetable_slot')
        for enrollment in active_enrollments:
            for subject in enrollment.subjects.all():
                if subject.id in seen_subject_ids:
                    continue
                seen_subject_ids.add(subject.id)
                slot = getattr(subject, 'timetable_slot', None)
                entries.append(
                    {
                        'subject_id': subject.id,
                        'subject_name': subject.name,
                        'day_of_week': slot.day_of_week if slot else None,
                        'start_time': slot.start_time if slot else None,
                        'end_time': slot.end_time if slot else None,
                    }
                )
        return Response(TimetableEntrySerializer(entries, many=True).data)


class SubjectRosterView(APIView):
    """GET /api/subjects/{id}/students/ - class roster: active students
    enrolled in this subject. Staff see any subject's roster; a Tutor sees
    only their own subject's roster (the "tutor's class roster" the
    handover doc describes), 404 otherwise - same existence-hiding
    convention as academics.SubjectDetailView."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=StudentSerializer(many=True))
    def get(self, request, pk):
        try:
            subject = Subject.objects.select_related('tutor').get(pk=pk)
        except Subject.DoesNotExist:
            raise NotFound()

        user = request.user
        if not user.is_staff_level:
            tutor_profile = getattr(user, 'tutor_profile', None)
            if not tutor_profile or subject.tutor_id != tutor_profile.id:
                raise NotFound()

        students = (
            Student.objects.filter(enrollments__subjects=subject, enrollments__status=EnrollmentStatus.ACTIVE)
            .distinct()
            .prefetch_related('guardianships__parent')
        )
        return Response(StudentSerializer(students, many=True).data)
