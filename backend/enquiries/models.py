from django.conf import settings
from django.db import models

from clients.models import YEAR_GROUP_CHOICES
from enrollments.models import LearningMode


class EnquiryStage(models.TextChoices):
    INITIAL_CALL = 'INITIAL_CALL', 'Initial call'
    MEETING_SET = 'MEETING_SET', 'Meeting set'
    INVOICED = 'INVOICED', 'Invoiced'
    ENROLLED = 'ENROLLED', 'Enrolled'


class Enquiry(models.Model):
    parent = models.ForeignKey('clients.Parent', on_delete=models.PROTECT, related_name='enquiries')

    student_name = models.CharField(max_length=120)  # plain field, no Student row yet
    student_year_group = models.PositiveSmallIntegerField(choices=YEAR_GROUP_CHOICES, null=True, blank=True)
    student_school = models.CharField(max_length=150, blank=True)
    student_phone = models.CharField(max_length=20, blank=True)
    student_email = models.EmailField(blank=True)
    # The grades/marks the student brought from their previous school - not
    # always known at intake, unlike student_year_group above.
    student_grade = models.CharField(max_length=20, blank=True)

    stage = models.CharField(max_length=20, choices=EnquiryStage.choices, default=EnquiryStage.INITIAL_CALL)

    interested_subjects = models.ManyToManyField('academics.Subject', related_name='enquiries')
    duration_weeks = models.PositiveIntegerField(null=True, blank=True)
    learning_mode = models.CharField(max_length=20, choices=LearningMode.choices, null=True, blank=True)
    desired_start_date = models.DateField(null=True, blank=True)

    meeting_datetime = models.DateTimeField(null=True, blank=True)

    enrollment = models.OneToOneField(
        'enrollments.Enrollment', on_delete=models.SET_NULL, null=True, blank=True, related_name='source_enquiry'
    )

    notes = models.TextField(blank=True)  # general ongoing note on the record

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='enquiries_created'
    )

    class Meta:
        verbose_name_plural = 'enquiries'
        ordering = ['-created_at']

    def __str__(self):
        return f'Enquiry<{self.student_name}, {self.stage}>'


class EnquiryStageChange(models.Model):
    enquiry = models.ForeignKey(Enquiry, on_delete=models.CASCADE, related_name='stage_history')
    from_stage = models.CharField(max_length=20, choices=EnquiryStage.choices, null=True, blank=True)
    to_stage = models.CharField(max_length=20, choices=EnquiryStage.choices)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='enquiry_stage_changes'
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    note = models.TextField(blank=True)  # optional, staff-entered context for this specific transition

    class Meta:
        ordering = ['changed_at']
