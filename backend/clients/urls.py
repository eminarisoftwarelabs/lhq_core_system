from django.urls import path

from .views import (
    StudentDetailView,
    StudentListView,
    StudentNoteListCreateView,
    StudentTimetableView,
    SubjectRosterView,
)

urlpatterns = [
    path('students/', StudentListView.as_view(), name='student-list'),
    path('students/search/', StudentListView.as_view(), name='student-search'),
    path('students/<int:pk>/', StudentDetailView.as_view(), name='student-detail'),
    path('students/<int:pk>/notes/', StudentNoteListCreateView.as_view(), name='student-notes'),
    path('students/<int:pk>/timetable/', StudentTimetableView.as_view(), name='student-timetable'),
    path('subjects/<int:pk>/students/', SubjectRosterView.as_view(), name='subject-roster'),
]
