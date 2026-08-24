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
]
