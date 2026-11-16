from django.conf import settings
from django.db import models


class Notification(models.Model):
    """An in-app message for one user, shown under the header bell.
    `link` is a frontend path (e.g. "/users/change-requests")."""

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    message = models.CharField(max_length=255)
    link = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['recipient', 'read_at'], name='notification_unread_idx')]

    @property
    def is_read(self):
        return self.read_at is not None

    def __str__(self):
        return f'{self.recipient}: {self.message}'
