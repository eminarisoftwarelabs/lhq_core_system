from django.contrib import admin

from .models import Guardianship, Parent, Student, StudentNote


class GuardianshipInline(admin.TabularInline):
    model = Guardianship
    extra = 1


@admin.register(Parent)
class ParentAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'phone', 'email', 'address', 'city']
    search_fields = ['full_name', 'phone', 'email']


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'student_number', 'year_group', 'school', 'grade']
    search_fields = ['full_name', 'student_number', 'school']
    inlines = [GuardianshipInline]


@admin.register(StudentNote)
class StudentNoteAdmin(admin.ModelAdmin):
    list_display = ['student', 'subject', 'category', 'author_name', 'created_at']
    list_filter = ['category', 'subject']
    search_fields = ['student__full_name', 'student__student_number', 'author_name', 'text']
    readonly_fields = ['created_at']
