from django.urls import path

from .views import (
    SubjectDetailView,
    SubjectListCreateView,
    TopicDetailView,
    TopicListCreateView,
)

urlpatterns = [
    path('subjects/', SubjectListCreateView.as_view(), name='subject-list'),
    path('subjects/<int:pk>/', SubjectDetailView.as_view(), name='subject-detail'),
    path('subjects/<int:subject_id>/topics/', TopicListCreateView.as_view(), name='subject-topic-list'),
    path('topics/<int:pk>/', TopicDetailView.as_view(), name='topic-detail'),
]
