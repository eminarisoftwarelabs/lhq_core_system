from decimal import Decimal

from rest_framework import serializers

from .models import Invoice, InvoiceLineItem, Payment


class PaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source='recorded_by.full_name', read_only=True, default=None)

    class Meta:
        model = Payment
        fields = ['id', 'amount', 'paid_at', 'recorded_by', 'recorded_by_name']
        read_only_fields = fields


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineItem
        fields = ['id', 'description', 'amount']
        read_only_fields = fields


class InvoiceSerializer(serializers.ModelSerializer):
    payments = PaymentSerializer(many=True, read_only=True)
    line_items = InvoiceLineItemSerializer(many=True, read_only=True)
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    enquiry_student_name = serializers.CharField(source='enquiry.student_name', read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id',
            'enquiry',
            'enquiry_student_name',
            'enrollment',
            'total',
            'due_date',
            'status',
            'amount_paid',
            'balance_due',
            'is_overdue',
            'line_items',
            'payments',
            'created_at',
        ]
        read_only_fields = fields


class RecordPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))

    def validate_amount(self, value):
        # The view passes the target invoice in via context - balance_due is
        # a live computed property (never stored), so this always checks the
        # real current balance, not a stale figure from when the page loaded.
        invoice = self.context['invoice']
        if invoice.balance_due <= 0:
            raise serializers.ValidationError('This invoice is already paid in full.')
        if value > invoice.balance_due:
            raise serializers.ValidationError('Amount cannot exceed the balance due.')
        return value
