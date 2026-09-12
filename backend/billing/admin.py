from django.contrib import admin

from .models import Invoice, InvoiceLineItem, Payment


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ['paid_at']


class InvoiceLineItemInline(admin.TabularInline):
    model = InvoiceLineItem
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['id', 'enquiry', 'total', 'status', 'due_date', 'balance_due']
    list_filter = ['status']
    search_fields = ['enquiry__student_name']
    inlines = [InvoiceLineItemInline, PaymentInline]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['invoice', 'amount', 'paid_at', 'recorded_by']
