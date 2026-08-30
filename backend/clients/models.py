from django.db import models


class Parent(models.Model):
    full_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    location = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['full_name']

    def __str__(self):
        return self.full_name


class Student(models.Model):
    # Generated at enrollment time via clients.services.generate_student_number,
    # never assigned earlier — a Student row doesn't exist until enrollment.
    student_number = models.CharField(max_length=20, unique=True)
    full_name = models.CharField(max_length=120)
    grade = models.CharField(max_length=20)

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
