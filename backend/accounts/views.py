from django.contrib.auth import authenticate
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import (
    AuthenticationFailed,
    NotFound,
    PermissionDenied,
    ValidationError,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Role, User
from .permissions import can_create_role, has_staff_scope_over
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    LogoutSerializer,
    PasswordSetupConfirmSerializer,
    TokenPairSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)

STAFF_EDITABLE_FIELDS = set(UserUpdateSerializer.Meta.fields)
SELF_EDITABLE_FIELDS = {'full_name', 'phone', 'address'}
assert SELF_EDITABLE_FIELDS <= STAFF_EDITABLE_FIELDS, (
    'SELF_EDITABLE_FIELDS must stay a subset of what UserUpdateSerializer exposes'
)


class LoginView(APIView):
    """Authenticates by email and password, returns a JWT access/refresh
    pair plus the user's profile."""

    permission_classes = [AllowAny]

    @extend_schema(request=LoginSerializer, responses=TokenPairSerializer)
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=serializer.validated_data['email'],
            password=serializer.validated_data['password'],
        )
        if user is None:
            raise AuthenticationFailed('Invalid email or password.')
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': UserSerializer(user).data,
            }
        )


class LogoutView(APIView):
    """Blacklists the given refresh token."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data['refresh']).blacklist()
        except TokenError:
            raise ValidationError({'refresh': ['Invalid or expired refresh token.']})
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordSetupConfirmView(APIView):
    """Sets a new password given a valid uid/token pair."""

    permission_classes = [AllowAny]

    @extend_schema(request=PasswordSetupConfirmSerializer, responses={204: None})
    def post(self, request):
        serializer = PasswordSetupConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        user.set_password(serializer.validated_data['new_password'])
        user.must_change_password = False
        user.save(update_fields=['password', 'must_change_password'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordView(APIView):
    """Changes the authenticated user's own password. Used both for the
    forced first-change flow (must_change_password) and a voluntary change
    from an already-authenticated session - current_password is required
    either way. Blacklists the user's outstanding refresh tokens on
    success, since a staff-set starting password is a shared secret until
    the real owner changes it: anyone who used it first would otherwise
    keep a valid token pair after the account holder resets it."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.must_change_password = False
        request.user.save(update_fields=['password', 'must_change_password'])
        for token in OutstandingToken.objects.filter(user=request.user):
            BlacklistedToken.objects.get_or_create(token=token)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Returns the authenticated user's own profile."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ListUsersView(generics.ListAPIView):
    """Lists users the actor could create/manage, per can_create_role:
    Admin sees only Tutors, Owner sees Tutors and Admins (not other Owners
    or SYS_ADMIN), SYS_ADMIN sees everyone. A non-staff actor sees nothing
    - can_create_role is False for every role for a Tutor, so that falls
    out of the same filter rather than needing a separate branch."""

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = User.objects.select_related('tutor_profile').all()
        allowed_roles = [role for role in Role.values if can_create_role(self.request.user, role)]
        return qs.filter(role__in=allowed_roles)


class CreateUserView(APIView):
    """Creates a new user account if the requester is permitted, per
    can_create_role, to assign the given role. If a starting password is
    supplied the new user must change it on first login (must_change_password);
    otherwise the account has no usable password until one is set through
    PasswordSetupConfirmView."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=UserCreateSerializer, responses=UserSerializer)
    def post(self, request):
        target_role = request.data.get('role')
        if not can_create_role(request.user, target_role):
            raise PermissionDenied(
                'You do not have permission to create this role.'
            )
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    """Retrieves, partially updates, or deletes a single user. GET: any
    staff-level user can view any account; a non-staff user can only view
    their own. PATCH: has_staff_scope_over restricts editing to
    Owner/SYS_ADMIN over anyone or Admin over Tutors, plus self-edit with a
    smaller field set (SELF_EDITABLE_FIELDS) that excludes role and
    is_active. DELETE: gated by can_create_role instead (the hierarchy an
    actor can create/manage), narrower than has_staff_scope_over for an
    Owner - see delete() for why."""

    permission_classes = [IsAuthenticated]

    def _get_for_view(self, request, pk):
        """Returns the user at pk if the requester may view them; raises
        NotFound (not PermissionDenied) otherwise, so the response can't
        be used to confirm which ids exist."""
        instance = self._get(pk)
        actor = request.user
        if getattr(actor, 'is_staff_level', False) or actor.pk == instance.pk:
            return instance
        raise NotFound()

    def _get(self, pk):
        try:
            return User.objects.select_related('tutor_profile').get(pk=pk)
        except User.DoesNotExist:
            raise NotFound()

    @extend_schema(responses=UserSerializer)
    def get(self, request, pk):
        instance = self._get_for_view(request, pk)
        return Response(UserSerializer(instance).data)

    @extend_schema(request=UserUpdateSerializer, responses=UserSerializer)
    def patch(self, request, pk):
        """Fetches with the view-scope, then applies the (narrower) edit
        check separately: a viewable-but-not-editable record 403s rather
        than 404ing, since its existence is already visible via GET."""
        instance = self._get_for_view(request, pk)
        actor = request.user
        if not (has_staff_scope_over(actor, instance) or actor.pk == instance.pk):
            raise PermissionDenied('You do not have permission to edit this user.')

        allowed = (
            STAFF_EDITABLE_FIELDS
            if has_staff_scope_over(actor, instance)
            else SELF_EDITABLE_FIELDS
        )
        extra = set(request.data) - allowed
        if extra:
            raise ValidationError(
                {field: ['You cannot edit this field.'] for field in extra}
            )

        new_role = request.data.get('role')
        if new_role is not None and new_role != instance.role:
            if not can_create_role(actor, new_role):
                raise PermissionDenied(
                    'You do not have permission to assign this role.'
                )

        serializer = UserUpdateSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(instance).data)

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        """Permanently removes the account - unlike PATCH is_active,
        there's no undo. Gated by can_create_role (the same hierarchy that
        governs who can create/assign a role): Owner can delete Admins and
        Tutors but not other Owners or SYS_ADMIN, Admin can delete Tutors
        only, SYS_ADMIN can delete anyone. Self-deletion is always blocked,
        even for SYS_ADMIN (who could otherwise "create" a SYS_ADMIN and
        so would pass the hierarchy check on their own account)."""
        instance = self._get_for_view(request, pk)
        actor = request.user

        if actor.pk == instance.pk:
            raise PermissionDenied('You cannot delete your own account.')
        if not can_create_role(actor, instance.role):
            raise PermissionDenied('You do not have permission to delete this user.')

        tutor_profile = getattr(instance, 'tutor_profile', None)
        if tutor_profile is not None and tutor_profile.subjects.exists():
            raise ValidationError(
                {
                    'detail': [
                        'Cannot delete: this user has subjects assigned. '
                        'Reassign or remove those first.'
                    ]
                }
            )

        with transaction.atomic():
            if tutor_profile is not None:
                tutor_profile.delete()
            instance.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)
