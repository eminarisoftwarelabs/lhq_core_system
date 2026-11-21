from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import generics
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from academics.models import StudentSubject, StudentSubjectStatus, Subject
from academics.scheduling.times import fmt_time
from academics.services import teaches
from accounts.permissions import IsStaffLevel

from .models import Student
from .serializers import StudentEnrolledOnSerializer, StudentSerializer


class StudentListView(generics.ListAPIView):
    """?q= searches by name or student_number. ?ordering= takes
    enrolled_on, -enrolled_on (default) or full_name, -full_name. Registered
    under both /students/ and /students/search/ - the handover doc names
    both paths for the same "returning student" lookup."""

    serializer_class = StudentSerializer
    permission_classes = [IsStaffLevel]

    ORDERINGS = {
        'enrolled_on': ('enrolled_on', 'full_name'),
        '-enrolled_on': ('-enrolled_on', 'full_name'),
        'full_name': ('full_name',),
        '-full_name': ('-full_name',),
    }

    def get_queryset(self):
        qs = Student.objects.prefetch_related('guardianships__parent')
        params = self.request.query_params
        q = params.get('q')
        if q:
            qs = qs.filter(Q(full_name__icontains=q) | Q(student_number__icontains=q))
        ordering = params.get('ordering', '-enrolled_on')
        if ordering not in self.ORDERINGS:
            raise ValidationError({'ordering': [f"Must be one of: {', '.join(self.ORDERINGS)}."]})
        return qs.order_by(*self.ORDERINGS[ordering], 'id')


class StudentDetailView(generics.RetrieveUpdateAPIView):
    """GET a student. PATCH (staff) changes only `enrolled_on`."""

    permission_classes = [IsStaffLevel]
    queryset = Student.objects.prefetch_related('guardianships__parent')
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_serializer_class(self):
        return StudentEnrolledOnSerializer if self.request.method == 'PATCH' else StudentSerializer

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        # Reply with the full student, not just the edited field.
        student = self.get_queryset().get(pk=kwargs['pk'])
        return Response(StudentSerializer(student).data)


class SubjectRosterView(APIView):
    """GET /api/subjects/{id}/students/ - who is learning this subject: one
    item per ACTIVE student subject, each a student plus the tutor, mode and
    weekly times. Staff see every student on the subject; a Tutor sees only
    their own students, and only on a subject they teach (404 otherwise,
    the existence-hiding convention of academics.SubjectDetailView)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=StudentSerializer(many=True))
    def get(self, request, pk):
        try:
            subject = Subject.objects.get(pk=pk)
        except Subject.DoesNotExist:
            raise NotFound()

        user = request.user
        if not user.is_staff_level and not teaches(user, subject):
            raise NotFound()

        links = (
            StudentSubject.objects.filter(subject=subject, status=StudentSubjectStatus.ACTIVE)
            .select_related('student', 'tutor__user')
            .prefetch_related('slots', 'student__guardianships__parent')
        )
        if not user.is_staff_level:
            links = links.filter(tutor=user.tutor_profile)

        rows = []
        for link in links:
            row = StudentSerializer(link.student).data
            row.update(
                {
                    'student_subject_id': link.pk,
                    'tutor': {'id': link.tutor_id, 'name': link.tutor.user.full_name or link.tutor.user.email},
                    'mode': link.mode,
                    'slots': [
                        {
                            'weekday': slot.weekday,
                            'start_time': fmt_time(slot.start_time),
                            'end_time': fmt_time(slot.end_time),
                        }
                        for slot in link.slots.all()
                    ],
                }
            )
            rows.append(row)
        return Response(rows)
