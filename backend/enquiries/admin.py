from django.contrib import admin

from .models import Enquiry, EnquiryStageChange


class EnquiryStageChangeInline(admin.TabularInline):
    model = EnquiryStageChange
    extra = 0
    readonly_fields = ['from_stage', 'to_stage', 'changed_by', 'changed_at', 'note']
    can_delete = False


@admin.register(Enquiry)
class EnquiryAdmin(admin.ModelAdmin):
    list_display = ['student_name', 'parent', 'stage', 'desired_start_date', 'created_at']
    list_filter = ['stage', 'learning_mode']
    search_fields = ['student_name', 'parent__full_name']
    filter_horizontal = ['interested_subjects']
    inlines = [EnquiryStageChangeInline]
