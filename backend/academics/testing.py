"""Test factories for the subject catalog, shared across apps' tests."""

from academics.models import Level, Subject


def default_level():
    # Seeded by migration 0006, so it exists in every test database.
    return Level.objects.get(name='IGCSE')


def make_subject(name='Mathematics', level=None, tutors=(), **fields):
    """A Subject at `level` (IGCSE by default), taught by each of `tutors`
    (TutorProfile instances)."""
    from accounts.models import TutorSubject

    subject = Subject.objects.create(level=level or default_level(), name=name, **fields)
    for tutor in tutors:
        TutorSubject.objects.create(tutor=tutor, subject=subject)
    return subject


def teach(tutor, *subjects):
    from accounts.models import TutorSubject

    for subject in subjects:
        TutorSubject.objects.get_or_create(tutor=tutor, subject=subject)
