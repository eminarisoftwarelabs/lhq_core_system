from django.contrib import admin

from .models import Level, LessonPlan, School, Subject, TimetableSlot, Topic


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


class TimetableSlotInline(admin.StackedInline):
    model = TimetableSlot
    extra = 0
    max_num = 1


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ['name', 'level', 'code', 'has_paper', 'is_active']
    list_filter = ['level', 'has_paper', 'is_active']
    search_fields = ['name', 'code']
    inlines = [TimetableSlotInline, TopicInline]


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ['name', 'number', 'chapter', 'subject', 'extended_only']
    list_filter = ['subject__level', 'extended_only']
    search_fields = ['name', 'chapter', 'subject__name']


@admin.register(TimetableSlot)
class TimetableSlotAdmin(admin.ModelAdmin):
    list_display = ['subject', 'day_of_week', 'start_time', 'end_time']
    list_filter = ['day_of_week']


@admin.register(LessonPlan)
class LessonPlanAdmin(admin.ModelAdmin):
    list_display = ['week_start', 'subject', 'topic', 'updated_by', 'updated_at']
    list_filter = ['subject', 'week_start']
    date_hierarchy = 'week_start'
