from django.contrib import admin

from .models import School, Subject, TimetableSlot, Topic


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name']


class TopicInline(admin.TabularInline):
    model = Topic
    extra = 1


class TimetableSlotInline(admin.StackedInline):
    model = TimetableSlot
    extra = 0
    max_num = 1


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ['name', 'tutor', 'is_active']
    list_filter = ['tutor', 'is_active']
    search_fields = ['name']
    inlines = [TimetableSlotInline, TopicInline]


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ['name', 'subject']
    search_fields = ['name', 'subject__name']


@admin.register(TimetableSlot)
class TimetableSlotAdmin(admin.ModelAdmin):
    list_display = ['subject', 'day_of_week', 'start_time', 'end_time']
    list_filter = ['day_of_week']
