from django.contrib import admin

from .models import (
    Level,
    School,
    Session,
    SessionChangeRequest,
    SessionLogEvent,
    StudentSubject,
    Subject,
    TimetableSlot,
    Topic,
)


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name']


@admin.register(Level)
class LevelAdmin(admin.ModelAdmin):
    list_display = ['name', 'order', 'year_groups', 'is_active']
    list_filter = ['is_active']


class TopicInline(admin.TabularInline):
    model = Topic
    extra = 0
    fields = ['order', 'chapter', 'number', 'name', 'extended_only']


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ['name', 'level', 'code', 'has_paper', 'is_active']
    list_filter = ['level', 'has_paper', 'is_active']
    search_fields = ['name', 'code']
    inlines = [TopicInline]


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ['name', 'number', 'chapter', 'subject', 'extended_only']
    list_filter = ['subject__level', 'extended_only']
    search_fields = ['name', 'chapter', 'subject__name']


# Scheduling rows are written through academics.scheduling (clash checks,
# session generation, history). The admin is for looking, not editing.


class TimetableSlotInline(admin.TabularInline):
    model = TimetableSlot
    extra = 0
    can_delete = False
    readonly_fields = ['weekday', 'start_time', 'end_time']


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(StudentSubject)
class StudentSubjectAdmin(ReadOnlyAdmin):
    list_display = ['student', 'subject', 'tutor', 'planned_sessions', 'start_date', 'confirmed_end_date', 'status']
    list_filter = ['status', 'mode', 'subject__level']
    search_fields = ['student__full_name', 'subject__name', 'tutor__user__full_name']
    inlines = [TimetableSlotInline]


@admin.register(Session)
class SessionAdmin(ReadOnlyAdmin):
    list_display = ['date', 'start_time', 'end_time', 'student_subject', 'status', 'logged_by']
    list_filter = ['status', 'date']
    date_hierarchy = 'date'
    search_fields = ['student_subject__student__full_name', 'student_subject__subject__name']


@admin.register(SessionLogEvent)
class SessionLogEventAdmin(ReadOnlyAdmin):
    list_display = ['created_at', 'session', 'action', 'from_status', 'to_status', 'actor']
    list_filter = ['action']


@admin.register(SessionChangeRequest)
class SessionChangeRequestAdmin(ReadOnlyAdmin):
    list_display = ['created_at', 'session', 'kind', 'status', 'requested_by', 'reviewed_by']
    list_filter = ['status', 'kind']
