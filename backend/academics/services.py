from itertools import groupby

from .models import Subject


def taught_subjects(user):
    """The Subjects `user` teaches (accounts.TutorSubject). Keyed on the
    TutorProfile, not role=TUTOR: an Owner or Admin can also teach."""
    tutor_profile = getattr(user, 'tutor_profile', None)
    if tutor_profile is None:
        return Subject.objects.none()
    return Subject.objects.filter(tutor_links__tutor=tutor_profile)


def teaches(user, subject):
    return taught_subjects(user).filter(pk=subject.pk).exists()


def plannable_subjects(user):
    """Subjects whose lesson plans `user` may read and write: staff all,
    anyone else only the ones they teach."""
    return Subject.objects.all() if user.is_staff_level else taught_subjects(user)


def topics_by_chapter(topics):
    """Ordered topics -> [{chapter, topics: [...]}], chapters in the order
    they first appear. Topic.order runs across the whole subject, so
    consecutive runs are whole chapters."""
    return [
        {'chapter': chapter, 'topics': list(items)}
        for chapter, items in groupby(topics, key=lambda t: t.chapter)
    ]
