from django.contrib import admin

from .models import Guardianship, Parent, Student


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
