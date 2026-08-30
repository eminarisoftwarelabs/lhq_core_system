from decimal import Decimal

from rest_framework import serializers

from .models import Invoice, Payment


class PaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source='recorded_by.full_name', read_only=True, default=None)

    class Meta:
        model = Payment
        fields = ['id', 'amount', 'paid_at', 'recorded_by', 'recorded_by_name']
        read_only_fields = fields


class InvoiceSerializer(serializers.ModelSerializer):
    payments = PaymentSerializer(many=True, read_only=True)
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
            'payments',
            'created_at',
        ]
        read_only_fields = fields


class RecordPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
