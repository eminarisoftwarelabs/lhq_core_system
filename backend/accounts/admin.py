from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import Subject, TutorProfile, User


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


@admin.register(TutorProfile)
class TutorProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'hourly_rate', 'is_available']
    search_fields = ['user__email', 'user__full_name']


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ['name', 'tutor']
    list_filter = ['tutor']
    search_fields = ['name']
