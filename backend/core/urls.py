from django.urls import path

from .views import HealthCheckView, NotificationListView, NotificationReadView

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('notifications/', NotificationListView.as_view(), name='notification-list'),
    path('notifications/<int:pk>/read/', NotificationReadView.as_view(), name='notification-read'),
]
