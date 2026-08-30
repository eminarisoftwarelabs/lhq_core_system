from django.urls import path

from .views import EnrollmentDetailView, EnrollmentListCreateView, WithdrawEnrollmentView

urlpatterns = [
    path('enrollments/', EnrollmentListCreateView.as_view(), name='enrollment-list'),
    path('enrollments/<int:pk>/', EnrollmentDetailView.as_view(), name='enrollment-detail'),
    path('enrollments/<int:pk>/withdraw/', WithdrawEnrollmentView.as_view(), name='enrollment-withdraw'),
]
