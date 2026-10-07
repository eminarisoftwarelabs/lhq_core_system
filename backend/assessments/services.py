from academics.models import Subject
from clients.models import Student
from enrollments.models import EnrollmentStatus


def taught_subjects(user):
    """The Subjects `user` is the assigned tutor of. Keyed on the
    TutorProfile, not role=TUTOR: an Owner or Admin can also teach."""
    tutor_profile = getattr(user, 'tutor_profile', None)
    return Subject.objects.filter(tutor=tutor_profile) if tutor_profile else Subject.objects.none()


def is_actively_enrolled(student, subject):
    return Student.objects.filter(
        pk=student.pk, enrollments__subjects=subject, enrollments__status=EnrollmentStatus.ACTIVE
    ).exists()


def teaches_student(user, student):
    """Whether `student` is on the active roster of any Subject `user`
    teaches - the same roster clients.SubjectRosterView serves."""
    return Student.objects.filter(
        pk=student.pk,
        enrollments__subjects__in=taught_subjects(user),
        enrollments__status=EnrollmentStatus.ACTIVE,
    ).exists()


def can_view_assessments(user, student):
    """Staff read any student's record; a tutor only reads the record of a
    student they currently teach."""
    return user.is_staff_level or teaches_student(user, student)


def can_assess(user, student, subject):
    """Only the Subject's own tutor writes, and only about a student
    actively enrolled in it. Staff who don't teach the Subject read but
    never write."""
    return taught_subjects(user).filter(pk=subject.pk).exists() and is_actively_enrolled(student, subject)
