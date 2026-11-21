"""Factories and a frozen clock for the timetable tests.

The clock is fixed at Wednesday 18 November 2026, 12:00 in Lilongwe
unless a test moves it (`at(...)`)."""

from contextlib import contextmanager
from datetime import date, datetime, time
from itertools import count
from unittest import mock

from django.utils import timezone

from academics.models import Topic
from academics.scheduling import student_subjects
from academics.testing import make_subject
from accounts.models import Role, TutorProfile, TutorSubject, User, WorkingHours
from clients.models import Student

MONDAY = date(2026, 11, 16)
TUESDAY = date(2026, 11, 17)
WEDNESDAY = date(2026, 11, 18)
THURSDAY = date(2026, 11, 19)
NOON_WEDNESDAY = (WEDNESDAY, time(12, 0))

_seq = count(1)


def local(day, clock):
    return timezone.make_aware(datetime.combine(day, clock))


@contextmanager
def at(day, clock=time(12, 0)):
    """Freeze "now" at `day` `clock`, local time."""
    moment = local(day, clock)
    with mock.patch('django.utils.timezone.now', return_value=moment):
        yield moment


def user(role=Role.ADMIN, name=None):
    n = next(_seq)
    return User.objects.create_user(
        email=f'{role.lower()}{n}@lhq.test', full_name=name or f'{role.title()} {n}', role=role
    )


def tutor(name='Mr Banda', hours=((0, '08:00', '20:00'), (1, '08:00', '20:00'), (2, '08:00', '20:00'),
                                     (3, '08:00', '20:00'), (4, '08:00', '20:00')), rate='6000.00', role=Role.TUTOR):
    profile = TutorProfile.objects.create(user=user(role, name), hourly_rate=rate)
    for weekday, start, end in hours:
        WorkingHours.objects.create(tutor=profile, weekday=weekday, start_time=start, end_time=end)
    return profile


def student(name=None):
    n = next(_seq)
    return Student.objects.create(student_number=f'STU-{n:06d}', full_name=name or f'Student {n}')


def subject_with_topics(name=None, topics=4, teachers=()):
    subject = make_subject(name or f'Subject {next(_seq)}')
    for i in range(topics):
        Topic.objects.create(subject=subject, chapter='Ch', name=f'Topic {i + 1}', order=i)
    for t in teachers:
        TutorSubject.objects.get_or_create(tutor=t, subject=subject)
    return subject


def slot(weekday, start, end):
    return {'weekday': weekday, 'start_time': start, 'end_time': end}


def book(
    actor,
    tutor_profile,
    slots=(slot(0, '16:00', '17:00'),),
    planned=10,
    start=MONDAY,
    the_student=None,
    the_subject=None,
    allow_clash=False,
    **extra,
):
    """A student subject via the real service (clash checks, generation)."""
    the_subject = the_subject or subject_with_topics(teachers=[tutor_profile])
    TutorSubject.objects.get_or_create(tutor=tutor_profile, subject=the_subject)
    ss, _ = student_subjects.create_student_subject(
        actor,
        student=the_student or student(),
        subject=the_subject,
        tutor=tutor_profile,
        planned_sessions=planned,
        start_date=start,
        slots=list(slots),
        allow_clash=allow_clash,
        **extra,
    )
    return ss


def statuses(ss):
    return [(s.date, s.start_time.strftime('%H:%M'), s.status) for s in ss.sessions.order_by('date', 'start_time')]
