from django.db import models

# Shared with enquiries.Enquiry.student_year_group - a student's class/form
# level (Year 1 through Year 13), distinct from `grade` below (the actual
# marks/grades a student brings from their previous school).
YEAR_GROUP_CHOICES = [(year, f'Year {year}') for year in range(1, 14)]


class Parent(models.Model):
    full_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ['full_name']

    def __str__(self):
        return self.full_name


class Student(models.Model):
    # Generated at enrollment time via clients.services.generate_student_number,
    # never assigned earlier — a Student row doesn't exist until enrollment.
    student_number = models.CharField(max_length=20, unique=True)
    full_name = models.CharField(max_length=120)
    year_group = models.PositiveSmallIntegerField(choices=YEAR_GROUP_CHOICES, null=True, blank=True)
    school = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    # The grades/marks a student brought from their previous school - not
    # always known at intake, unlike year_group above.
    grade = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ['full_name']

    def __str__(self):
        return f'{self.full_name} ({self.student_number})'


class Guardianship(models.Model):
    class Relationship(models.TextChoices):
        MOTHER = 'MOTHER', 'Mother'
        FATHER = 'FATHER', 'Father'
        GUARDIAN = 'GUARDIAN', 'Guardian'
        OTHER = 'OTHER', 'Other'

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='guardianships')
    parent = models.ForeignKey(Parent, on_delete=models.PROTECT, related_name='guardianships')
    relationship = models.CharField(max_length=20, choices=Relationship.choices)
    is_primary_contact = models.BooleanField(default=False)

    class Meta:
        unique_together = ('student', 'parent')

    def __str__(self):
        return f'{self.parent} -> {self.student} ({self.relationship})'
