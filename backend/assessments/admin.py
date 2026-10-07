from django.contrib import admin

from .models import Assessment


@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = ['student', 'subject', 'category', 'author_name', 'created_at']
    list_filter = ['category', 'subject']
    search_fields = ['student__full_name', 'student__student_number', 'comment']
