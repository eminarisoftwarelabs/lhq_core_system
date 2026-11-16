from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers

from academics.models import Subject

from .models import ChangeKind, Role, TutorChangeRequest, TutorProfile, User
from .services import current_value, tutor_can_take_new_students


class TutorProfileSerializer(serializers.ModelSerializer):
    # False until the tutor has at least one subject and one working-hours
    # block (and is active and available) - see
    # accounts.services.tutor_can_take_new_students.
    can_take_new_students = serializers.SerializerMethodField()

    class Meta:
        model = TutorProfile
        # 'id' is read-only by default (it's the PK) - exposed because the
        # /tutors/{id}/... endpoints are keyed by TutorProfile id, not User id.
        fields = ['id', 'hourly_rate', 'is_available', 'can_take_new_students']
        read_only_fields = ['id', 'can_take_new_students']

    def get_can_take_new_students(self, obj) -> bool:
        return tutor_can_take_new_students(obj)


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


# -- tutor subjects, working hours, change requests --------------------------


class TutorSubjectItemSerializer(serializers.Serializer):
    """A subject as it appears on a tutor's profile."""

    id = serializers.IntegerField()
    name = serializers.CharField()
    level = serializers.IntegerField(source='level_id')
    level_name = serializers.CharField(source='level.name')
    code = serializers.CharField()
    has_paper = serializers.BooleanField()


class WorkingHoursItemSerializer(serializers.Serializer):
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    start_time = serializers.CharField()
    end_time = serializers.CharField()


class TutorSubjectsWriteSerializer(serializers.Serializer):
    # Shape only; accounts.services.validate_subject_ids owns the rules.
    subjects = serializers.ListField(child=serializers.JSONField())


class WorkingHoursWriteSerializer(serializers.Serializer):
    working_hours = serializers.ListField(child=serializers.JSONField())


class ChangeRequestSubmitSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=ChangeKind.choices)
    proposed = serializers.JSONField()
    note = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class RejectSerializer(serializers.Serializer):
    reason = serializers.CharField(allow_blank=True, max_length=1000)


def subjects_for_ids(ids):
    """Subject ids -> serialised subjects in id order. An id no longer in
    the catalog shows as a placeholder rather than vanishing, so a
    reviewer still sees that the tutor asked for it."""
    by_id = {s.id: s for s in Subject.objects.select_related('level').filter(id__in=ids)}
    out = []
    for i in ids:
        subject = by_id.get(i)
        if subject is None:
            out.append({'id': i, 'name': f'Subject {i} (removed)', 'level': None, 'level_name': '', 'code': '', 'has_paper': False})
        else:
            out.append(TutorSubjectItemSerializer(subject).data)
    return sorted(out, key=lambda s: (s['level'] is None, s['level_name'], s['name']))


def resolve_value(kind, value):
    return subjects_for_ids(value) if kind == ChangeKind.SUBJECTS else value


class ChangeRequestSerializer(serializers.ModelSerializer):
    """`proposed` comes resolved (subjects as objects, not ids). Staff
    review responses also carry `current` - the tutor's live set now - so
    the two can be compared side by side."""

    tutor_name = serializers.SerializerMethodField()
    # The tutor's User id, for linking to their profile page.
    tutor_user = serializers.IntegerField(source='tutor.user_id', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name', read_only=True, default=None)
    proposed = serializers.SerializerMethodField()

    class Meta:
        model = TutorChangeRequest
        fields = [
            'id',
            'tutor',
            'tutor_user',
            'tutor_name',
            'kind',
            'proposed',
            'note',
            'status',
            'created_at',
            'reviewed_by_name',
            'reviewed_at',
            'reject_reason',
        ]
        read_only_fields = fields

    def get_tutor_name(self, obj) -> str:
        return obj.tutor.user.full_name or obj.tutor.user.email

    def get_proposed(self, obj) -> list:
        return resolve_value(obj.kind, obj.proposed)


class StaffChangeRequestSerializer(ChangeRequestSerializer):
    current = serializers.SerializerMethodField()

    class Meta(ChangeRequestSerializer.Meta):
        fields = ChangeRequestSerializer.Meta.fields + ['current']
        read_only_fields = fields

    def get_current(self, obj) -> list:
        return resolve_value(obj.kind, current_value(obj.tutor, obj.kind))
