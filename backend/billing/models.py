from django.conf import settings
from django.db import models
from django.utils import timezone


class InvoiceStatus(models.TextChoices):
    SENT = 'SENT', 'Sent'
    PARTIALLY_PAID = 'PARTIALLY_PAID', 'Partially paid'
    PAID = 'PAID', 'Paid'


class Invoice(models.Model):
    enquiry = models.ForeignKey('enquiries.Enquiry', on_delete=models.PROTECT, related_name='invoices')
    enrollment = models.OneToOneField(
        'enrollments.Enrollment', on_delete=models.SET_NULL, null=True, blank=True, related_name='invoice'
    )
    total = models.DecimalField(max_digits=12, decimal_places=2)
    due_date = models.DateField()
    status = models.CharField(max_length=20, choices=InvoiceStatus.choices, default=InvoiceStatus.SENT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def amount_paid(self):
        return self.payments.aggregate(total=models.Sum('amount'))['total'] or 0

    @property
    def balance_due(self):
        return self.total - self.amount_paid

    @property
    def is_overdue(self):
        return self.balance_due > 0 and self.due_date < timezone.now().date()

    def __str__(self):
        return f'Invoice<{self.pk}, {self.status}>'


class InvoiceLineItem(models.Model):
    """The visible breakdown behind Invoice.total (tuition subtotal, any
    duration discount) - never recomputed, so the invoice/PDF always shows
    exactly what was charged even if the pricing rules change later."""

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='line_items')
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f'{self.description}: {self.amount}'


class Payment(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        ordering = ['paid_at']

    def __str__(self):
        return f'Payment<{self.amount} on invoice {self.invoice_id}>'
