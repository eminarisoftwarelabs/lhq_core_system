from django.urls import path

from .views import InvoiceDetailView, InvoiceListView, RecordPaymentView

urlpatterns = [
    path('invoices/', InvoiceListView.as_view(), name='invoice-list'),
    path('invoices/<int:pk>/', InvoiceDetailView.as_view(), name='invoice-detail'),
    path('invoices/<int:pk>/record-payment/', RecordPaymentView.as_view(), name='invoice-record-payment'),
]
