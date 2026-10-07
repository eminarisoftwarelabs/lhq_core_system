from django.db import models


class AssessmentCategory(models.TextChoices):
    ACADEMIC = 'ACADEMIC', 'Academic'
    BEHAVIOURAL = 'BEHAVIOURAL', 'Behavioural'


class Assessment(models.Model):
    """A tutor's written comment on one student, either about their work
    (ACADEMIC) or their conduct (BEHAVIOURAL).

    Part of the student's permanent record: there is deliberately no edit
    or delete endpoint, and nothing cascades into this table, so removing
    a subject or a staff account can never take a student's history with
    it."""

    student = models.ForeignKey('clients.Student', on_delete=models.PROTECT, related_name='assessments')
    # The class the comment was made in - a tutor only ever comments on a
    # student through a Subject they teach (see services.can_assess).
    subject = models.ForeignKey('academics.Subject', on_delete=models.PROTECT, related_name='assessments')
    # SET_NULL, not PROTECT: accounts.UserDetailView hard-deletes accounts,
    # and a tutor leaving must not be blocked by (or erase) what they wrote.
    # author_name is the snapshot that keeps the comment attributed.
    author = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='assessments_written'
    )
    author_name = models.CharField(max_length=255)
    category = models.CharField(max_length=20, choices=AssessmentCategory.choices)
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.get_category_display()} assessment of {self.student} by {self.author_name}'
