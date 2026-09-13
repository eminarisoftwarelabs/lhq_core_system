from datetime import time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from academics.models import Subject, TimetableSlot
from accounts.models import EmploymentType, Role, TutorProfile, User
from billing.services import record_payment
from clients.models import Guardianship, Parent, Student
from clients.services import generate_student_number
from enquiries.models import Enquiry, EnquiryStage
from enquiries.services import change_stage, create_enquiry, generate_invoice
from enrollments.models import LearningMode

# Fixed so re-running the command logs in as the same demo accounts instead
# of leaving forgotten one-off passwords behind.
DUMMY_PASSWORD = 'ChangeMe123!'

ADMIN = {
    'email': 'admin.demo@lhq.test',
    'full_name': 'Grace Kamanga',
    'employee_id': 'DUMMY-ADM-01',
    'phone': '0888112233',
}

TUTORS = [
    {
        'email': 'chisomo.phiri@lhq.test',
        'full_name': 'Chisomo Phiri',
        'employee_id': 'DUMMY-TUT-01',
        'phone': '0999223344',
        'hourly_rate': Decimal('6000.00'),
        'subjects': ['Mathematics', 'Chemistry'],
    },
    {
        'email': 'thandiwe.mvula@lhq.test',
        'full_name': 'Thandiwe Mvula',
        'employee_id': 'DUMMY-TUT-02',
        'phone': '0888334455',
        'hourly_rate': Decimal('5500.00'),
        'subjects': ['English'],
    },
    {
        'email': 'blessings.nyirenda@lhq.test',
        'full_name': 'Blessings Nyirenda',
        'employee_id': 'DUMMY-TUT-03',
        'phone': '0991556677',
        'hourly_rate': Decimal('6500.00'),
        'subjects': ['Physics', 'Biology'],
    },
]

# subject name -> (day_of_week, start_time, end_time). 0=Monday ... 6=Sunday.
SUBJECT_SLOTS = {
    'Mathematics': (0, time(14, 0), time(15, 30)),
    'English': (1, time(15, 0), time(16, 30)),
    'Physics': (2, time(14, 0), time(15, 30)),
    'Chemistry': (3, time(15, 0), time(16, 30)),
    'Biology': (4, time(14, 0), time(15, 30)),
}

PARENTS_AND_CHILDREN = [
    {
        'parent': {
            'full_name': 'Chikondi Banda',
            'phone': '0888123456',
            'email': 'chikondi.banda@example.mw',
            'address': 'Area 25',
            'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Takondwa Banda', 'year_group': 8, 'school': 'Bishop Mackenzie International School'},
            {'full_name': 'Chisomo Banda', 'year_group': 5, 'school': 'Bishop Mackenzie International School'},
        ],
    },
    {
        'parent': {
            'full_name': 'Loveness Chirwa',
            'phone': '0999456789',
            'email': 'loveness.chirwa@example.mw',
            'address': 'Chilomoni',
            'city': 'Blantyre',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Dalitso Chirwa', 'year_group': 10, 'school': 'St Andrews International High School'},
            {'full_name': 'Grace Chirwa', 'year_group': 3, 'school': 'St Andrews International High School'},
        ],
    },
    {
        'parent': {
            'full_name': 'Yamikani Gondwe',
            'phone': '0991223344',
            'email': 'yamikani.gondwe@example.mw',
            'address': 'Chibavi',
            'city': 'Mzuzu',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Ethel Gondwe', 'year_group': 12, 'school': 'Marist International School'},
        ],
    },
]

# Each dict describes one dummy Enquiry and how far through the pipeline it
# should be pushed. `payments` is only used when target_stage is ENROLLED —
# a list of fractions of the invoice total, e.g. two partial installments.
ENQUIRIES = [
    {
        'student_name': 'Mphatso Kachingwe',
        'parent': {
            'full_name': 'Beatrice Kachingwe',
            'phone': '0888998877',
            'email': 'beatrice.kachingwe@example.mw',
            'address': 'Area 47',
            'city': 'Lilongwe',
        },
        'student_year_group': 6,
        'student_school': 'International School of Lilongwe',
        'subjects': ['Mathematics'],
        'duration_weeks': 4,
        'learning_mode': LearningMode.IN_PERSON,
        'start_offset_days': 21,
        'target_stage': EnquiryStage.INITIAL_CALL,
    },
    {
        'student_name': 'Wongani Msiska',
        'parent': {
            'full_name': 'Enock Msiska',
            'phone': '0999112233',
            'email': 'enock.msiska@example.mw',
            'address': 'Ndirande',
            'city': 'Blantyre',
        },
        'student_year_group': 9,
        'student_school': 'Robert Laws Secondary School',
        'subjects': ['English', 'Physics'],
        'duration_weeks': 8,
        'learning_mode': LearningMode.ONLINE,
        'start_offset_days': 14,
        'target_stage': EnquiryStage.MEETING_SET,
        'meeting_offset_days': 3,
    },
    {
        'student_name': 'Blessings Nkhoma',
        'parent': {
            'full_name': 'Faith Nkhoma',
            'phone': '0888556611',
            'email': 'faith.nkhoma@example.mw',
            'address': 'Katoto',
            'city': 'Mzuzu',
        },
        'student_year_group': 11,
        'student_school': 'Kamuzu Academy',
        'subjects': ['Chemistry', 'Biology'],
        'duration_weeks': 4,
        'learning_mode': LearningMode.IN_PERSON,
        'start_offset_days': 10,
        'target_stage': EnquiryStage.INVOICED,
    },
    {
        'student_name': 'Precious Zulu',
        'parent': {
            'full_name': 'Harold Zulu',
            'phone': '0991887766',
            'email': 'harold.zulu@example.mw',
            'address': 'Mzimba Road',
            'city': 'Mzuzu',
        },
        'student_year_group': 7,
        'student_school': 'International School of Lilongwe',
        'subjects': ['Mathematics'],
        'duration_weeks': 8,
        'learning_mode': LearningMode.IN_PERSON,
        'start_offset_days': -14,
        'target_stage': EnquiryStage.ENROLLED,
        'payments': [Decimal('1')],  # fully paid in one payment
    },
    {
        'student_name': 'Isaac Kanyenda',
        'parent': {
            'full_name': 'Rhoda Kanyenda',
            'phone': '0888223399',
            'email': 'rhoda.kanyenda@example.mw',
            'address': 'Area 18',
            'city': 'Lilongwe',
        },
        'student_year_group': 12,
        'student_school': 'Marist International School',
        'subjects': ['Physics', 'Chemistry', 'Biology'],
        'duration_weeks': 4,
        'learning_mode': LearningMode.ONLINE,
        'start_offset_days': -7,
        'target_stage': EnquiryStage.ENROLLED,
        'payments': [Decimal('0.4'), Decimal('0.2')],  # two installments, partially paid
    },
]


class Command(BaseCommand):
    help = (
        'Populates realistic dummy data (tutors, subjects, parents, students, '
        'enquiries at every pipeline stage, enrollments, invoices, payments) '
        'for demoing the prototype. Idempotent — safe to run more than once. '
        'Never invoked automatically; run it by hand only.'
    )

    def handle(self, *args, **options):
        with transaction.atomic():
            admin = self._get_or_create_staff_user(ADMIN, Role.ADMIN, EmploymentType.FULL_TIME)
            tutors_by_subject = self._seed_tutors_and_subjects()
            self._seed_clients()
            self._seed_enquiries(admin, tutors_by_subject)

        self.stdout.write(self.style.SUCCESS('Dummy data seed complete.'))
        self.stdout.write(f'Demo login password for every seeded user: {DUMMY_PASSWORD}')
        self.stdout.write(f"  Admin:  {ADMIN['email']}")
        for tutor in TUTORS:
            self.stdout.write(f"  Tutor:  {tutor['email']}")

    # -- accounts -----------------------------------------------------

    def _get_or_create_staff_user(self, data, role, employment_type):
        user = User.objects.filter(email=data['email']).first()
        if user is not None:
            return user
        user = User.objects.create_user(
            email=data['email'],
            password=DUMMY_PASSWORD,
            full_name=data['full_name'],
            role=role,
            employee_id=data['employee_id'],
            employment_type=employment_type,
            phone=data['phone'],
            must_change_password=True,
        )
        self.stdout.write(f'Created user {user.email}')
        return user

    def _seed_tutors_and_subjects(self):
        """Returns {subject_name: Subject} for every subject in SUBJECT_SLOTS."""
        tutors_by_subject = {}
        for tutor_data in TUTORS:
            user = self._get_or_create_staff_user(tutor_data, Role.TUTOR, EmploymentType.PART_TIME)
            tutor_profile, _ = TutorProfile.objects.get_or_create(
                user=user,
                defaults={'hourly_rate': tutor_data['hourly_rate'], 'is_available': True},
            )
            for subject_name in tutor_data['subjects']:
                tutors_by_subject[subject_name] = tutor_profile

        subjects = {}
        for subject_name, (day, start, end) in SUBJECT_SLOTS.items():
            tutor_profile = tutors_by_subject.get(subject_name)
            subject, created = Subject.objects.get_or_create(
                name=subject_name,
                defaults={'tutor': tutor_profile, 'is_active': True},
            )
            if not created and subject.tutor_id is None and tutor_profile is not None:
                subject.tutor = tutor_profile
                subject.save(update_fields=['tutor'])
            if created:
                self.stdout.write(f'Created subject {subject.name}')

            TimetableSlot.objects.get_or_create(
                subject=subject,
                defaults={'day_of_week': day, 'start_time': start, 'end_time': end},
            )
            subjects[subject_name] = subject
        return subjects

    # -- clients --------------------------------------------------------

    def _seed_clients(self):
        for entry in PARENTS_AND_CHILDREN:
            parent, created = Parent.objects.get_or_create(
                full_name=entry['parent']['full_name'],
                defaults=entry['parent'],
            )
            if created:
                self.stdout.write(f'Created parent {parent.full_name}')

            for child in entry['children']:
                student, created = Student.objects.get_or_create(
                    full_name=child['full_name'],
                    defaults={
                        'student_number': generate_student_number(),
                        'year_group': child['year_group'],
                        'school': child['school'],
                    },
                )
                if created:
                    self.stdout.write(f'Created student {student.full_name} ({student.student_number})')

                Guardianship.objects.get_or_create(
                    student=student,
                    parent=parent,
                    defaults={'relationship': entry['relationship'], 'is_primary_contact': True},
                )

    # -- enquiries / enrollments / billing -------------------------------

    def _seed_enquiries(self, admin, subjects_by_name):
        for spec in ENQUIRIES:
            enquiry = Enquiry.objects.filter(student_name=spec['student_name']).first()
            if enquiry is None:
                enquiry = self._create_enquiry_from_spec(spec, admin, subjects_by_name)
                self.stdout.write(f'Created enquiry for {enquiry.student_name} ({enquiry.stage})')

            self._advance_enquiry(enquiry, spec, admin)

    def _create_enquiry_from_spec(self, spec, admin, subjects_by_name):
        subject_ids = [subjects_by_name[name].id for name in spec['subjects']]
        desired_start_date = timezone.now().date() + timedelta(days=spec['start_offset_days'])
        return create_enquiry(
            parent_data=spec['parent'],
            student_name=spec['student_name'],
            subject_ids=subject_ids,
            duration_weeks=spec['duration_weeks'],
            learning_mode=spec['learning_mode'],
            desired_start_date=desired_start_date,
            created_by=admin,
            student_year_group=spec['student_year_group'],
            student_school=spec['student_school'],
        )

    def _advance_enquiry(self, enquiry, spec, admin):
        target_stage = spec['target_stage']
        stages_reached = {change.to_stage for change in enquiry.stage_history.all()}

        if target_stage in (EnquiryStage.MEETING_SET, EnquiryStage.INVOICED, EnquiryStage.ENROLLED):
            if EnquiryStage.MEETING_SET not in stages_reached:
                change_stage(enquiry, EnquiryStage.MEETING_SET, admin, note='Seed data: meeting scheduled.')
                meeting_offset_days = spec.get('meeting_offset_days', 2)
                enquiry.meeting_datetime = timezone.now() + timedelta(days=meeting_offset_days)
                enquiry.save(update_fields=['meeting_datetime'])

        invoice = enquiry.invoices.first()
        if target_stage in (EnquiryStage.INVOICED, EnquiryStage.ENROLLED) and invoice is None:
            invoice = generate_invoice(enquiry, admin, note='Seed data: invoice generated.')

        if target_stage == EnquiryStage.ENROLLED and enquiry.enrollment_id is None:
            for fraction in spec['payments']:
                amount = (invoice.total * fraction).quantize(Decimal('0.01'))
                record_payment(invoice, amount, admin)
