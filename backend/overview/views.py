from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsOwnerLevel

from .serializers import OverviewSerializer
from .services import DEFAULT_PERIOD, PERIODS, build_overview


class OverviewView(APIView):
    """GET /overview/[?period=this_month|last_month|this_year] - the
    company at a glance for the Owner dashboard: headline counts, money,
    a six-month enrollment trend and the onboarding funnel.

    Owner and SYS_ADMIN only. An Admin can open individual invoices but
    does not get company-wide revenue figures; a Tutor gets none of it."""

    permission_classes = [IsOwnerLevel]

    @extend_schema(
        parameters=[OpenApiParameter('period', str, enum=list(PERIODS), default=DEFAULT_PERIOD)],
        responses=OverviewSerializer,
    )
    def get(self, request):
        period = request.query_params.get('period', DEFAULT_PERIOD)
        if period not in PERIODS:
            raise ValidationError({'period': [f'Must be one of: {", ".join(PERIODS)}.']})
        return Response(OverviewSerializer(build_overview(period)).data)
