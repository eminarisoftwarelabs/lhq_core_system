from django.db import models


class LearningMode(models.TextChoices):
    IN_PERSON = 'IN_PERSON', 'In person'
    ONLINE = 'ONLINE', 'Online'


class EnrollmentStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    COMPLETED = 'COMPLETED', 'Completed'
    WITHDRAWN = 'WITHDRAWN', 'Withdrawn'


class Enrollment(models.Model):
    student = models.ForeignKey('clients.Student', on_delete=models.PROTECT, related_name='enrollments')
    subjects = models.ManyToManyField('academics.Subject', related_name='enrollments')

    start_date = models.DateField()
    end_date = models.DateField()
    learning_mode = models.CharField(max_length=20, choices=LearningMode.choices)

    status = models.CharField(max_length=20, choices=EnrollmentStatus.choices, default=EnrollmentStatus.ACTIVE)
    withdrawn_at = models.DateField(null=True, blank=True)
    withdrawal_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Enrollment<{self.student.student_number}, {self.status}>'
