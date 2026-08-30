from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsStaffLevel
from billing.serializers import InvoiceSerializer

from .models import Enquiry
from .serializers import (
    ChangeStageSerializer,
    EnquiryCreateSerializer,
    EnquirySerializer,
    EnquiryUpdateSerializer,
)
from .services import change_stage, generate_invoice


def _base_queryset():
    return Enquiry.objects.select_related('parent', 'created_by', 'enrollment').prefetch_related(
        'interested_subjects', 'stage_history__changed_by'
    )


class EnquiryListCreateView(generics.ListCreateAPIView):
    """GET: filterable by ?stage=. POST: create_enquiry - staff level only,
    flat rule (no created_by ownership restriction), per
    onboarding_apps_handover.md."""

    permission_classes = [IsStaffLevel]

    def get_serializer_class(self):
        return EnquiryCreateSerializer if self.request.method == 'POST' else EnquirySerializer

    def get_serializer_context(self):
        return {'request': self.request}

    def get_queryset(self):
        qs = _base_queryset()
        stage = self.request.query_params.get('stage')
        if stage:
            qs = qs.filter(stage=stage)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = EnquiryCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        enquiry = serializer.save()
        return Response(EnquirySerializer(enquiry).data, status=status.HTTP_201_CREATED)


class EnquiryDetailView(APIView):
    """GET/PATCH. PATCH never accepts `stage` - see EnquiryUpdateSerializer
    and the dedicated stage-change endpoint."""

    permission_classes = [IsStaffLevel]

    def _get(self, pk):
        try:
            return _base_queryset().get(pk=pk)
        except Enquiry.DoesNotExist:
            raise NotFound()

    @extend_schema(responses=EnquirySerializer)
    def get(self, request, pk):
        return Response(EnquirySerializer(self._get(pk)).data)

    @extend_schema(request=EnquiryUpdateSerializer, responses=EnquirySerializer)
    def patch(self, request, pk):
        enquiry = self._get(pk)
        if 'stage' in request.data:
            raise ValidationError(
                {'stage': ['Change stage through PATCH /enquiries/{id}/stage/, not here.']}
            )
        serializer = EnquiryUpdateSerializer(enquiry, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(EnquirySerializer(enquiry).data)


class EnquiryStageView(APIView):
    """PATCH /enquiries/{id}/stage/ body: {new_stage, note}."""

    permission_classes = [IsStaffLevel]

    @extend_schema(request=ChangeStageSerializer, responses=EnquirySerializer)
    def patch(self, request, pk):
        try:
            enquiry = Enquiry.objects.get(pk=pk)
        except Enquiry.DoesNotExist:
            raise NotFound()

        serializer = ChangeStageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        change_stage(
            enquiry,
            serializer.validated_data['new_stage'],
            request.user,
            note=serializer.validated_data['note'],
        )
        return Response(EnquirySerializer(_base_queryset().get(pk=pk)).data)


class EnquiryGenerateInvoiceView(APIView):
    """POST /enquiries/{id}/generate-invoice/."""

    permission_classes = [IsStaffLevel]

    @extend_schema(responses=InvoiceSerializer)
    def post(self, request, pk):
        try:
            enquiry = Enquiry.objects.prefetch_related('interested_subjects').get(pk=pk)
        except Enquiry.DoesNotExist:
            raise NotFound()

        if not enquiry.duration_weeks:
            raise ValidationError({'duration_weeks': ['Required on the enquiry before an invoice can be generated.']})
        if not enquiry.desired_start_date:
            # enroll_student (triggered by the first payment against this
            # invoice) needs a start_date for the Enrollment it creates -
            # catch the gap here rather than at payment time.
            raise ValidationError(
                {'desired_start_date': ['Required on the enquiry before an invoice can be generated.']}
            )
        if not enquiry.interested_subjects.exists():
            raise ValidationError(
                {'interested_subjects': ['At least one interested subject is required to generate an invoice.']}
            )

        invoice = generate_invoice(enquiry, request.user, note=request.data.get('note', ''))
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)
