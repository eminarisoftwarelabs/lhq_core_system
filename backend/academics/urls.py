from django.urls import path

from . import scheduling_views as sv
from .views import (
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
    # Feature 2: timetable and sessions
    path('student-subjects/', sv.StudentSubjectListView.as_view(), name='student-subject-list'),
    path('student-subjects/<int:pk>/', sv.StudentSubjectDetailView.as_view(), name='student-subject-detail'),
    path('student-subjects/<int:pk>/slots/', sv.StudentSubjectSlotsView.as_view(), name='student-subject-slots'),
    path('student-subjects/<int:pk>/confirm-end/', sv.ConfirmEndView.as_view(), name='student-subject-confirm-end'),
    path('student-subjects/<int:pk>/add-sessions/', sv.AddSessionsView.as_view(), name='student-subject-add-sessions'),
    path('slots/<int:pk>/', sv.SlotDetailView.as_view(), name='slot-detail'),
    path('students/<int:pk>/subjects/', sv.StudentSubjectsForStudentView.as_view(), name='student-subjects-of-student'),
    path('sessions/', sv.SessionListView.as_view(), name='session-list'),
    path('sessions/<int:pk>/', sv.SessionDetailView.as_view(), name='session-detail'),
    path('sessions/<int:pk>/log/', sv.SessionLogView.as_view(), name='session-log'),
    path('sessions/<int:pk>/plan/', sv.SessionPlanView.as_view(), name='session-plan'),
    path('sessions/<int:pk>/move/', sv.SessionMoveView.as_view(), name='session-move'),
    path('sessions/<int:pk>/cancel/', sv.SessionCancelView.as_view(), name='session-cancel'),
    path(
        'sessions/<int:pk>/change-requests/',
        sv.SessionChangeRequestCreateView.as_view(),
        name='session-change-request-create',
    ),
    path('session-change-requests/', sv.SessionChangeRequestListView.as_view(), name='session-change-request-list'),
    path(
        'session-change-requests/<int:pk>/approve/',
        sv.SessionChangeRequestApproveView.as_view(),
        name='session-change-request-approve',
    ),
    path(
        'session-change-requests/<int:pk>/reject/',
        sv.SessionChangeRequestRejectView.as_view(),
        name='session-change-request-reject',
    ),
    path(
        'session-change-requests/<int:pk>/withdraw/',
        sv.SessionChangeRequestWithdrawView.as_view(),
        name='session-change-request-withdraw',
    ),
    path('tutors/<int:pk>/free-slots/', sv.TutorFreeSlotsView.as_view(), name='tutor-free-slots'),
    path('tutors/<int:pk>/hours/', sv.TutorHoursView.as_view(), name='tutor-hours'),
]
