from django.urls import path

from .views import (
    LessonPlanCopyWeekView,
    LessonPlanListView,
    LessonPlanWeekView,
    SchoolListView,
    SubjectDetailView,
    SubjectListCreateView,
    TopicDetailView,
    TopicListCreateView,
)

urlpatterns = [
    path('schools/', SchoolListView.as_view(), name='school-list'),
    path('subjects/', SubjectListCreateView.as_view(), name='subject-list'),
    path('subjects/<int:pk>/', SubjectDetailView.as_view(), name='subject-detail'),
    path('subjects/<int:subject_id>/topics/', TopicListCreateView.as_view(), name='subject-topic-list'),
    path('topics/<int:pk>/', TopicDetailView.as_view(), name='topic-detail'),
    path('lesson-plans/', LessonPlanListView.as_view(), name='lesson-plan-list'),
    path('lesson-plans/copy-week/', LessonPlanCopyWeekView.as_view(), name='lesson-plan-copy-week'),
    path(
        'subjects/<int:subject_id>/lesson-plans/<str:week_start>/',
        LessonPlanWeekView.as_view(),
        name='subject-lesson-plan-week',
    ),
]
