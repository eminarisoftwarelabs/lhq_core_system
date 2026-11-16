from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordView,
    CreateUserView,
    ListUsersView,
    LoginView,
    LogoutView,
    MeView,
    PasswordSetupConfirmView,
    UserDetailView,
)
from .tutor_views import (
    ChangeRequestApproveView,
    ChangeRequestListView,
    ChangeRequestRejectView,
    MyChangeRequestCancelView,
    MyChangeRequestsView,
    TutorSubjectsView,
    TutorWorkingHoursView,
)

urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path(
        'auth/setup-password/',
        PasswordSetupConfirmView.as_view(),
        name='setup-password',
    ),
    path(
        'auth/change-password/',
        ChangePasswordView.as_view(),
        name='change-password',
    ),
    path('me/', MeView.as_view(), name='me'),
    path('users/', ListUsersView.as_view(), name='user-list'),
    path('users/create/', CreateUserView.as_view(), name='user-create'),
    path('users/<int:pk>/', UserDetailView.as_view(), name='user-detail'),
    path('tutors/me/change-requests/', MyChangeRequestsView.as_view(), name='my-change-requests'),
    path(
        'tutors/me/change-requests/<int:pk>/cancel/',
        MyChangeRequestCancelView.as_view(),
        name='my-change-request-cancel',
    ),
    path('tutors/<int:pk>/subjects/', TutorSubjectsView.as_view(), name='tutor-subjects'),
    path('tutors/<int:pk>/working-hours/', TutorWorkingHoursView.as_view(), name='tutor-working-hours'),
    path('change-requests/', ChangeRequestListView.as_view(), name='change-request-list'),
    path('change-requests/<int:pk>/approve/', ChangeRequestApproveView.as_view(), name='change-request-approve'),
    path('change-requests/<int:pk>/reject/', ChangeRequestRejectView.as_view(), name='change-request-reject'),
]
