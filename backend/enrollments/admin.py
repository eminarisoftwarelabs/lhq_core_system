from django.contrib import admin

from .models import Enrollment


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ['student', 'status', 'start_date', 'end_date', 'learning_mode']
    list_filter = ['status', 'learning_mode']
    search_fields = ['student__full_name', 'student__student_number']
    filter_horizontal = ['subjects']
