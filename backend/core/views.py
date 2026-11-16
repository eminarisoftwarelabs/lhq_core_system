from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .serializers import NotificationListSerializer, NotificationSerializer
from .services import mark_read

# The bell shows recent items only; older ones stay in the table.
RECENT_NOTIFICATIONS = 20


class HealthCheckSerializer(serializers.Serializer):
    status = serializers.CharField()
    time = serializers.DateTimeField()


class HealthCheckView(APIView):
    """Liveness probe. No auth required so load balancers/uptime checks can hit it."""

    permission_classes = [AllowAny]

    @extend_schema(responses=HealthCheckSerializer)
    def get(self, request):
        return Response({'status': 'ok', 'time': timezone.now()})


class NotificationListView(APIView):
    """GET /notifications/ - the signed-in user's most recent
    notifications plus their total unread count. Only ever their own."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=NotificationListSerializer)
    def get(self, request):
        mine = Notification.objects.filter(recipient=request.user)
        return Response(
            {
                'unread_count': mine.filter(read_at__isnull=True).count(),
                'results': NotificationSerializer(mine[:RECENT_NOTIFICATIONS], many=True).data,
            }
        )


class NotificationReadView(APIView):
    """POST /notifications/{id}/read/ - mark one as read. Idempotent.
    Someone else's notification is a 404."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=NotificationSerializer)
    def post(self, request, pk):
        notification = Notification.objects.filter(pk=pk, recipient=request.user).first()
        if notification is None:
            raise NotFound()
        return Response(NotificationSerializer(mark_read(notification)).data)
