from django.urls import path

from .views import StudentDetailView, StudentListView, SubjectRosterView

urlpatterns = [
    path('students/', StudentListView.as_view(), name='student-list'),
    path('students/search/', StudentListView.as_view(), name='student-search'),
    path('students/<int:pk>/', StudentDetailView.as_view(), name='student-detail'),
    path('subjects/<int:pk>/students/', SubjectRosterView.as_view(), name='subject-roster'),
]
