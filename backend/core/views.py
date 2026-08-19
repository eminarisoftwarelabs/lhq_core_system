from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    """Liveness probe. No auth required so load balancers/uptime checks can hit it."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'status': 'ok', 'time': timezone.now()})
