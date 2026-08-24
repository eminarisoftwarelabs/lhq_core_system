from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers

from .models import Role, TutorProfile, User


class TutorProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = TutorProfile
        fields = ['hourly_rate', 'is_available']


class UserSerializer(serializers.ModelSerializer):
    """Read serializer: what comes back for /api/me/, /api/users/, etc."""

    tutor_profile = TutorProfileSerializer(read_only=True)
    teaches = serializers.BooleanField(read_only=True)
    is_staff_level = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'full_name',
            'phone',
            'role',
            'employee_id',
            'employment_type',
            'address',
            'start_date',
            'is_active',
            'date_joined',
            'last_login',
            'tutor_profile',
            'teaches',
            'is_staff_level',
            'must_change_password',
        ]
        read_only_fields = fields


def _normalize_employee_id(value):
    return value or None


def _ensure_tutor_profile(user, tutor_data):
    """role=TUTOR always requires a TutorProfile; having one doesn't
    require role=TUTOR. Called from both create and update so the
    invariant holds regardless of entry point."""
    if user.role == Role.TUTOR or tutor_data is not None:
        profile, _created = TutorProfile.objects.get_or_create(user=user)
        for attr, value in (tutor_data or {}).items():
            setattr(profile, attr, value)
        profile.save()


class UserCreateSerializer(serializers.ModelSerializer):
    tutor_profile = TutorProfileSerializer(required=False)
    # Optional stopgap until email sending exists: staff can set a starting
    # password here instead of the (currently unreachable) setup-link flow.
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, trim_whitespace=False
    )

    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'full_name',
            'phone',
            'role',
            'employee_id',
            'employment_type',
            'address',
            'start_date',
            'tutor_profile',
            'password',
        ]
        read_only_fields = ['id']

    def validate_employee_id(self, value):
        return _normalize_employee_id(value)

    def create(self, validated_data):
        tutor_data = validated_data.pop('tutor_profile', None)
        # '' and omitted both mean "no starting password" - collapse them
        # so a blank string can never produce a *usable* empty password.
        password = validated_data.pop('password', None) or None
        if password is not None:
            try:
                validate_password(password)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({'password': exc.messages})
        user = User.objects.create_user(password=password, **validated_data)
        if password is not None:
            user.must_change_password = True
            user.save(update_fields=['must_change_password'])
        _ensure_tutor_profile(user, tutor_data)
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """PATCH serializer. The view is responsible for restricting which of
    these fields a given actor may actually send (self-edit vs.
    staff-edit) before this is invoked."""

    tutor_profile = TutorProfileSerializer(required=False)

    class Meta:
        model = User
        fields = [
            'full_name',
            'phone',
            'employee_id',
            'employment_type',
            'address',
            'start_date',
            'role',
            'is_active',
            'tutor_profile',
        ]

    def validate_employee_id(self, value):
        return _normalize_employee_id(value)

    def update(self, instance, validated_data):
        tutor_data = validated_data.pop('tutor_profile', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        _ensure_tutor_profile(instance, tutor_data)
        return instance


class MessageSerializer(serializers.Serializer):
    detail = serializers.CharField()


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()
    user = UserSerializer()


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class PasswordSetupConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        try:
            pk = force_str(urlsafe_base64_decode(attrs['uid']))
            user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            raise serializers.ValidationError('Invalid setup link.')

        if not default_token_generator.check_token(user, attrs['token']):
            raise serializers.ValidationError('Invalid or expired setup link.')

        try:
            validate_password(attrs['new_password'], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': exc.messages})

        attrs['user'] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    """Used by ChangePasswordView, both for the forced first-change flow
    (starting password set by staff) and a voluntary password change by an
    already-authenticated user. current_password is checked unconditionally
    in both cases - the starting password IS the current password the user
    knows, and skipping the check for a logged-in session would let a
    hijacked access token silently take over the account."""

    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = self.context['request'].user
        if not user.check_password(attrs['current_password']):
            raise serializers.ValidationError({'current_password': ['Incorrect password.']})

        if attrs['new_password'] == attrs['current_password']:
            raise serializers.ValidationError(
                {'new_password': ['New password must be different from your current password.']}
            )

        try:
            validate_password(attrs['new_password'], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': exc.messages})

        return attrs
