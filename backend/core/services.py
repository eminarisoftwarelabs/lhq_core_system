from django.utils import timezone

from .models import Notification

# Notification.message's max_length. Every message is built to fit (names
# are shortened, long reasons are left on the page they link to), so a
# message over this is a bug in the caller, not something to cut silently
# mid-sentence.
MAX_MESSAGE_LENGTH = 255


def notify(recipients, message, link=''):
    """Create one Notification per recipient (duplicates collapsed).
    Returns the created rows. Raises ValueError for a message that does
    not fit, rather than storing it cut off."""
    if len(message) > MAX_MESSAGE_LENGTH:
        raise ValueError(f'Notification message is {len(message)} characters; the limit is {MAX_MESSAGE_LENGTH}.')
    unique = {user.pk: user for user in recipients}
    return Notification.objects.bulk_create(
        [Notification(recipient=user, message=message, link=link) for user in unique.values()]
    )


def mark_read(notification):
    """Idempotent: a second call keeps the first read time."""
    if notification.read_at is None:
        notification.read_at = timezone.now()
        notification.save(update_fields=['read_at'])
    return notification
