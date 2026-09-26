from decimal import Decimal

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsStaffLevel

from .models import Invoice
from .serializers import InvoiceListFilterSerializer, InvoiceSerializer, RecordPaymentSerializer
from .services import record_payment


class InvoiceListView(generics.ListAPIView):
    """GET /invoices/, optionally ?enquiry=<id> for one enquiry's invoices,
    or ?balance_due__gt=<n> for outstanding balances. balance_due is a
    computed property (never stored, so it can't go stale as payments come
    in) rather than a DB column, so that filter is applied in Python.

    ?issued_from=<iso datetime> (inclusive) and ?issued_to=<iso datetime>
    (exclusive) narrow by issue date (created_at) - see
    InvoiceListFilterSerializer. A malformed value is a 400, not a 500."""

    serializer_class = InvoiceSerializer
    permission_classes = [IsStaffLevel]

    def get_queryset(self):
        qs = Invoice.objects.select_related('enquiry').prefetch_related('payments', 'line_items')
        enquiry_id = self.request.query_params.get('enquiry')
        if enquiry_id:
            qs = qs.filter(enquiry_id=enquiry_id)

        filters = InvoiceListFilterSerializer(data=self.request.query_params.dict())
        filters.is_valid(raise_exception=True)
        issued_from = filters.validated_data.get('issued_from')
        issued_to = filters.validated_data.get('issued_to')
        if issued_from:
            qs = qs.filter(created_at__gte=issued_from)
        if issued_to:
            qs = qs.filter(created_at__lt=issued_to)
        return qs

    @extend_schema(
        parameters=[
            OpenApiParameter('enquiry', OpenApiTypes.INT, description='Only this enquiry\'s invoices.'),
            OpenApiParameter('balance_due__gt', OpenApiTypes.DECIMAL, description='Balance due above this amount.'),
            OpenApiParameter('issued_from', OpenApiTypes.DATETIME, description='Issued at or after (inclusive).'),
            OpenApiParameter('issued_to', OpenApiTypes.DATETIME, description='Issued before (exclusive).'),
        ]
    )
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        threshold = request.query_params.get('balance_due__gt')
        if threshold is not None:
            threshold = Decimal(threshold)
            queryset = [invoice for invoice in queryset if invoice.balance_due > threshold]

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)


class InvoiceDetailView(generics.RetrieveAPIView):
    serializer_class = InvoiceSerializer
    permission_classes = [IsStaffLevel]
    queryset = Invoice.objects.select_related('enquiry').prefetch_related('payments', 'line_items')


class RecordPaymentView(APIView):
    """POST /invoices/{id}/record-payment/ body: {amount}. Triggers
    enroll_student on the first payment against an invoice."""

    permission_classes = [IsStaffLevel]

    def _get(self, pk):
        try:
            return Invoice.objects.select_related('enquiry').get(pk=pk)
        except Invoice.DoesNotExist:
            raise NotFound()

    @extend_schema(request=RecordPaymentSerializer, responses=InvoiceSerializer)
    def post(self, request, pk):
        invoice = self._get(pk)
        serializer = RecordPaymentSerializer(data=request.data, context={'invoice': invoice})
        serializer.is_valid(raise_exception=True)

        # enroll_student (triggered when this is the first payment) needs a
        # start_date for the Enrollment it creates. generate-invoice checks
        # this too, but desired_start_date could have been cleared via
        # PATCH /enquiries/{id}/ in between - check again at the actual
        # point of failure rather than 500ing.
        if invoice.enrollment_id is None and not invoice.enquiry.desired_start_date:
            raise ValidationError(
                {'detail': ['This enquiry is missing a desired start date. Set one before recording payment.']}
            )

        record_payment(invoice, serializer.validated_data['amount'], request.user)
        invoice.refresh_from_db()
        return Response(InvoiceSerializer(invoice).data)
