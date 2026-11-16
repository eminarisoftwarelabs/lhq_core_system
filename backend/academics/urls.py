from django.urls import path

from .views import (
    LessonPlanCopyWeekView,
    LessonPlanListView,
    LessonPlanWeekView,
    LevelListView,
    SchoolListView,
    SubjectDetailView,
    SubjectListCreateView,
    SubjectTopicsView,
)

urlpatterns = [
    path('schools/', SchoolListView.as_view(), name='school-list'),
    path('levels/', LevelListView.as_view(), name='level-list'),
    path('subjects/', SubjectListCreateView.as_view(), name='subject-list'),
    path('subjects/<int:pk>/', SubjectDetailView.as_view(), name='subject-detail'),
    path('subjects/<int:subject_id>/topics/', SubjectTopicsView.as_view(), name='subject-topic-list'),
    path('lesson-plans/', LessonPlanListView.as_view(), name='lesson-plan-list'),
    path('lesson-plans/copy-week/', LessonPlanCopyWeekView.as_view(), name='lesson-plan-copy-week'),
    path(
        'subjects/<int:subject_id>/lesson-plans/<str:week_start>/',
        LessonPlanWeekView.as_view(),
        name='subject-lesson-plan-week',
    ),
]
