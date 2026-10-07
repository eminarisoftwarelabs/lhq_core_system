from django.urls import path

from .views import StudentAssessmentListCreateView

urlpatterns = [
    path(
        'students/<int:pk>/assessments/',
        StudentAssessmentListCreateView.as_view(),
        name='student-assessment-list',
    ),
]
