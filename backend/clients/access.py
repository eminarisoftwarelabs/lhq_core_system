from academics.models import Subject
from enrollments.models import EnrollmentStatus

from .models import Student


def tutor_profile_of(user):
    return getattr(user, 'tutor_profile', None)


def students_visible_to(user, queryset=None):
    """Staff see every student. Anyone else sees only students actively
    enrolled in a subject they teach, and nothing at all without a tutor
    profile. A student outside that set is simply absent (callers 404),
    the same existence-hiding convention the subject roster uses."""
    queryset = Student.objects.all() if queryset is None else queryset
    if user.is_staff_level:
        return queryset
    profile = tutor_profile_of(user)
    if profile is None:
        return queryset.none()
    return queryset.filter(
        enrollments__status=EnrollmentStatus.ACTIVE, enrollments__subjects__tutor=profile
    ).distinct()


def shared_subjects(student, user):
    """Subjects `user` teaches in which `student` is actively enrolled."""
    profile = tutor_profile_of(user)
    if profile is None:
        return Subject.objects.none()
    return Subject.objects.filter(
        tutor=profile, enrollments__student=student, enrollments__status=EnrollmentStatus.ACTIVE
    ).distinct()
