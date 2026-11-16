from django.utils import timezone

from .models import Notification


def notify(recipients, message, link=''):
    """Create one Notification per recipient (duplicates collapsed).
    Returns the created rows."""
    unique = {user.pk: user for user in recipients}
    return Notification.objects.bulk_create(
        [Notification(recipient=user, message=message[:255], link=link) for user in unique.values()]
    )


def mark_read(notification):
    """Idempotent: a second call keeps the first read time."""
    if notification.read_at is None:
        notification.read_at = timezone.now()
        notification.save(update_fields=['read_at'])
    return notification
