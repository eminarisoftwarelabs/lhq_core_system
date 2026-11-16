from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import TutorChangeRequest, TutorProfile, TutorSubject, User, WorkingHours


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """SYS_ADMIN's fallback into /admin/ when the API isn't practical."""

    ordering = ['email']
    list_display = ['email', 'full_name', 'role', 'is_active', 'is_staff']
    list_filter = ['role', 'is_active', 'is_staff']
    search_fields = ['email', 'full_name', 'employee_id']
    filter_horizontal = ['groups', 'user_permissions']
    readonly_fields = ['date_joined']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('full_name', 'phone', 'address')}),
        (
            'Employment',
            {'fields': ('role', 'employee_id', 'employment_type', 'start_date')},
        ),
        (
            'Permissions',
            {
                'fields': (
                    'is_active',
                    'must_change_password',
                    'is_staff',
                    'is_superuser',
                    'groups',
                    'user_permissions',
                )
            },
        ),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': ('email', 'full_name', 'role', 'password1', 'password2'),
            },
        ),
    )


class TutorSubjectInline(admin.TabularInline):
    model = TutorSubject
    extra = 0
    autocomplete_fields = ['subject']


class WorkingHoursInline(admin.TabularInline):
    model = WorkingHours
    extra = 0


@admin.register(TutorProfile)
class TutorProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'hourly_rate', 'is_available']
    search_fields = ['user__email', 'user__full_name']
    inlines = [TutorSubjectInline, WorkingHoursInline]


@admin.register(TutorChangeRequest)
class TutorChangeRequestAdmin(admin.ModelAdmin):
    list_display = ['tutor', 'kind', 'status', 'created_at', 'reviewed_by', 'reviewed_at']
    list_filter = ['kind', 'status']
    readonly_fields = ['created_at']
