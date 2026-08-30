from django.urls import path

from .views import (
    EnquiryDetailView,
    EnquiryGenerateInvoiceView,
    EnquiryListCreateView,
    EnquiryStageView,
)

urlpatterns = [
    path('enquiries/', EnquiryListCreateView.as_view(), name='enquiry-list'),
    path('enquiries/<int:pk>/', EnquiryDetailView.as_view(), name='enquiry-detail'),
    path('enquiries/<int:pk>/stage/', EnquiryStageView.as_view(), name='enquiry-stage'),
    path(
        'enquiries/<int:pk>/generate-invoice/',
        EnquiryGenerateInvoiceView.as_view(),
        name='enquiry-generate-invoice',
    ),
]
