import calendar
from datetime import date, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from academics.models import Level, Session, SessionStatus, StudentSubject, Subject
from academics.scheduling import student_subjects as student_subject_service
from academics.scheduling import times
from accounts.models import EmploymentType, Role, TutorProfile, TutorSubject, User, WorkingHours
from billing.services import record_payment
from clients.models import Guardianship, Parent, Student
from clients.services import generate_student_number
from enquiries.models import Enquiry, EnquiryStage
from enquiries.services import change_stage, create_enquiry, generate_invoice
from enrollments.models import Enrollment, LearningMode
from enrollments.services import compute_end_date

# Fixed so re-running the command logs in as the same demo accounts instead
# of leaving forgotten one-off passwords behind.
DUMMY_PASSWORD = 'ChangeMe123!'

# How long the roster students below (created already-enrolled, not via an
# Enquiry) have been signed up for.
ROSTER_ENROLLMENT_DURATION_WEEKS = 12

ADMIN = {
    'email': 'admin.demo@lhq.test',
    'full_name': 'Grace Kamanga',
    'employee_id': 'DUMMY-ADM-01',
    'phone': '0888112233',
}

TUTORS = [
    # Easy-to-remember login for manual testing.
    {
        'email': 'tutor@lhq.test',
        'full_name': 'Test Tutor',
        'employee_id': 'DUMMY-TUT-00',
        'phone': '0999000000',
        'hourly_rate': Decimal('6000.00'),
        'subjects': ['Mathematics', 'Physics'],
        'working_hours': [
            (0, time(14, 0), time(18, 0)),
            (2, time(14, 0), time(18, 0)),
            (4, time(14, 0), time(17, 0)),
        ],
    },
    {
        'email': 'chisomo.phiri@lhq.test',
        'full_name': 'Chisomo Phiri',
        'employee_id': 'DUMMY-TUT-01',
        'phone': '0999223344',
        'hourly_rate': Decimal('6000.00'),
        'subjects': ['Mathematics', 'Chemistry'],
        # Two blocks on Monday to show a split day, plus a Saturday.
        'working_hours': [
            (0, time(8, 0), time(12, 0)),
            (0, time(14, 0), time(17, 0)),
            (2, time(14, 0), time(18, 0)),
            (3, time(14, 0), time(18, 0)),
            (5, time(9, 0), time(12, 0)),
        ],
    },
    {
        'email': 'thandiwe.mvula@lhq.test',
        'full_name': 'Thandiwe Mvula',
        'employee_id': 'DUMMY-TUT-02',
        'phone': '0888334455',
        'hourly_rate': Decimal('5500.00'),
        'subjects': ['English Language'],
        # Deliberately none: shows the "won't be suggested for new
        # students" warning until hours are set.
        'working_hours': [],
    },
    {
        'email': 'blessings.nyirenda@lhq.test',
        'full_name': 'Blessings Nyirenda',
        'employee_id': 'DUMMY-TUT-03',
        'phone': '0991556677',
        'hourly_rate': Decimal('6500.00'),
        'subjects': ['Physics', 'Biology'],
        'working_hours': [
            (1, time(14, 0), time(18, 0)),
            (2, time(14, 0), time(16, 0)),
            (4, time(13, 0), time(17, 0)),
        ],
    },
]

# Every dummy subject is an IGCSE subject. Same (level, name) key as
# seed_cambridge_topics, so running both leaves one row per subject.
DUMMY_SUBJECT_LEVEL = 'IGCSE'
SUBJECTS_WITH_PAPER = {'Mathematics', 'Physics', 'Chemistry', 'Biology'}

DUMMY_SUBJECTS = ['Mathematics', 'English Language', 'Physics', 'Chemistry', 'Biology']



def enrolment_date(months_ago, day):
    """A fixed day in the month `months_ago` before this one, never in the
    future (this month's day is clamped to today)."""
    today = timezone.localdate()
    index = today.year * 12 + today.month - 1 - months_ago
    year, month = divmod(index, 12)
    month += 1
    result = date(year, month, min(day, calendar.monthrange(year, month)[1]))
    return min(result, today)


# How long ago the demo student subjects below started. Their past
# sessions are created and logged as Held, except the most recent one,
# which is left unlogged so the tutor dashboard has something to show.
STUDENT_SUBJECT_STARTED_WEEKS_AGO = 3

# Demo student subjects: (student, subject, tutor email, planned sessions,
# mode, [(weekday, start, end)]). Every slot sits inside the tutor's
# working hours above and none clash.
STUDENT_SUBJECTS = [
    ('Takondwa Banda', 'Mathematics', 'tutor@lhq.test', 24, 'IN_PERSON',
     [(0, time(15, 0), time(16, 0)), (2, time(15, 0), time(16, 0))]),
    ('Dalitso Chirwa', 'Physics', 'tutor@lhq.test', 12, 'ONLINE', [(4, time(14, 0), time(15, 0))]),
    ('Grace Chirwa', 'Mathematics', 'chisomo.phiri@lhq.test', 20, 'IN_PERSON',
     [(0, time(14, 0), time(15, 0)), (3, time(15, 0), time(16, 30))]),
    ('Dalitso Chirwa', 'Chemistry', 'chisomo.phiri@lhq.test', 12, 'ONLINE', [(2, time(16, 0), time(17, 0))]),
    ('Ethel Gondwe', 'Biology', 'blessings.nyirenda@lhq.test', 16, 'IN_PERSON',
     [(1, time(15, 0), time(16, 0)), (4, time(14, 0), time(15, 0))]),
    ('Tadala Mwale', 'Mathematics', 'tutor@lhq.test', 16, 'IN_PERSON', [(0, time(16, 0), time(17, 0))]),
    ('Limbani Phiri', 'Physics', 'blessings.nyirenda@lhq.test', 12, 'IN_PERSON', [(1, time(16, 0), time(17, 0))]),
    ('Zione Tembo', 'Chemistry', 'chisomo.phiri@lhq.test', 12, 'ONLINE', [(2, time(17, 0), time(18, 0))]),
    ('Stanley Kaunda', 'Mathematics', 'tutor@lhq.test', 12, 'ONLINE', [(0, time(14, 0), time(15, 0))]),
    ('Lameck Kalinga', 'Mathematics', 'chisomo.phiri@lhq.test', 12, 'IN_PERSON', [(0, time(15, 0), time(16, 0))]),
    ('Joyce Simbeye', 'Biology', 'blessings.nyirenda@lhq.test', 20, 'IN_PERSON', [(1, time(14, 0), time(15, 0))]),
    ('Nyasha Salima', 'Biology', 'blessings.nyirenda@lhq.test', 20, 'ONLINE', [(1, time(17, 0), time(18, 0))]),
    ('Lameck Manda', 'Mathematics', 'tutor@lhq.test', 24, 'IN_PERSON', [(0, time(17, 0), time(18, 0))]),
    ('Tamanda Msowoya', 'Physics', 'tutor@lhq.test', 20, 'ONLINE', [(2, time(14, 0), time(15, 0))]),
    ('Chikondi Kumwenda', 'Mathematics', 'chisomo.phiri@lhq.test', 24, 'ONLINE', [(0, time(16, 0), time(17, 0))]),
    ('Blessings Chimombo', 'Chemistry', 'chisomo.phiri@lhq.test', 20, 'ONLINE', [(2, time(14, 0), time(15, 0))]),
    ('Esther Mhango', 'Physics', 'blessings.nyirenda@lhq.test', 20, 'IN_PERSON', [(2, time(14, 0), time(15, 0))]),
    ('Madalitso Chapola', 'Chemistry', 'chisomo.phiri@lhq.test', 24, 'ONLINE', [(2, time(15, 0), time(16, 0))]),
    ('Patience Banda', 'Chemistry', 'chisomo.phiri@lhq.test', 24, 'IN_PERSON', [(3, time(14, 0), time(15, 0))]),
    ('Sungeni Ngwira', 'Biology', 'blessings.nyirenda@lhq.test', 16, 'IN_PERSON', [(2, time(15, 0), time(16, 0))]),
    ('Maxwell Soko', 'Physics', 'tutor@lhq.test', 12, 'IN_PERSON', [(2, time(16, 0), time(17, 0))]),
    ('Tamanda Kamwendo', 'Mathematics', 'tutor@lhq.test', 20, 'IN_PERSON', [(2, time(17, 0), time(18, 0))]),
    ('Priscilla Sakala', 'Chemistry', 'chisomo.phiri@lhq.test', 20, 'IN_PERSON', [(3, time(17, 0), time(18, 0))]),
]

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
            {
                'full_name': 'Takondwa Banda',
                'enrolled_months_ago': 0,
                'enrolled_day': 4,
                'year_group': 8,
                'school': 'Bishop Mackenzie International School',
                'subjects': ['Mathematics'],
                'learning_mode': LearningMode.IN_PERSON,
            },
            {
                'full_name': 'Chisomo Banda',
                'enrolled_months_ago': 0,
                'enrolled_day': 11,
                'year_group': 5,
                'school': 'Bishop Mackenzie International School',
                'subjects': ['English Language'],
                'learning_mode': LearningMode.IN_PERSON,
            },
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
            {
                'full_name': 'Dalitso Chirwa',
                'enrolled_months_ago': 1,
                'enrolled_day': 3,
                'year_group': 10,
                'school': 'St Andrews International High School',
                'subjects': ['Physics', 'Chemistry'],
                'learning_mode': LearningMode.ONLINE,
            },
            {
                'full_name': 'Grace Chirwa',
                'enrolled_months_ago': 1,
                'enrolled_day': 17,
                'year_group': 3,
                'school': 'St Andrews International High School',
                'subjects': ['Mathematics'],
                'learning_mode': LearningMode.IN_PERSON,
            },
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
            {
                'full_name': 'Ethel Gondwe',
                'enrolled_months_ago': 2,
                'enrolled_day': 9,
                'year_group': 12,
                'school': 'Marist International School',
                'subjects': ['Biology', 'Chemistry'],
                'learning_mode': LearningMode.IN_PERSON,
            },
        ],
    },
    {
        'parent': {
            'full_name': 'Memory Mwale',
            'phone': '0888345612',
            'email': 'memory.mwale@example.mw',
            'address': 'Area 10',
            'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {
                'full_name': 'Tadala Mwale',
                'enrolled_months_ago': 0,
                'enrolled_day': 18,
                'year_group': 7,
                'school': 'International School of Lilongwe',
                'subjects': ['Mathematics'],
                'learning_mode': LearningMode.IN_PERSON,
            },
        ],
    },
    {
        'parent': {
            'full_name': 'Patrick Phiri',
            'phone': '0999234501',
            'email': 'patrick.phiri@example.mw',
            'address': 'Falls Estate',
            'city': 'Blantyre',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {
                'full_name': 'Limbani Phiri',
                'enrolled_months_ago': 1,
                'enrolled_day': 22,
                'year_group': 9,
                'school': 'St Andrews International High School',
                'subjects': ['Physics'],
                'learning_mode': LearningMode.IN_PERSON,
            },
        ],
    },
    {
        'parent': {
            'full_name': 'Esnart Tembo',
            'phone': '0991667788',
            'email': 'esnart.tembo@example.mw',
            'address': 'Area 3',
            'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {
                'full_name': 'Zione Tembo',
                'enrolled_months_ago': 2,
                'enrolled_day': 15,
                'year_group': 11,
                'school': 'Marist International School',
                'subjects': ['Chemistry'],
                'learning_mode': LearningMode.ONLINE,
            },
            {
                'full_name': 'Mayamiko Tembo',
                'enrolled_months_ago': 2,
                'enrolled_day': 27,
                'year_group': 6,
                'school': 'Marist International School',
                'subjects': ['English Language'],
                'learning_mode': LearningMode.IN_PERSON,
            },
        ],
    },
    {
        'parent': {
            'full_name': 'Joseph Kalua',
            'phone': '0888771122',
            'email': 'joseph.kalua@example.mw',
            'address': 'Sunnyside',
            'city': 'Blantyre',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {
                'full_name': 'Chimwemwe Kalua',
                'enrolled_months_ago': 3,
                'enrolled_day': 5,
                'year_group': 10,
                'school': 'Kamuzu Academy',
                'subjects': ['Biology', 'Chemistry'],
                'learning_mode': LearningMode.IN_PERSON,
            },
            {
                'full_name': 'Tiyamike Kalua',
                'enrolled_months_ago': 3,
                'enrolled_day': 5,
                'year_group': 4,
                'school': 'Kamuzu Academy',
                'subjects': ['Mathematics'],
                'learning_mode': LearningMode.IN_PERSON,
            },
        ],
    },
    {
        'parent': {
            'full_name': 'Ruth Nyondo',
            'phone': '0999881234',
            'email': 'ruth.nyondo@example.mw',
            'address': 'Area 43',
            'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {
                'full_name': 'Thandizo Nyondo',
                'enrolled_months_ago': 3,
                'enrolled_day': 21,
                'year_group': 12,
                'school': 'Bishop Mackenzie International School',
                'subjects': ['Physics', 'Mathematics'],
                'learning_mode': LearningMode.ONLINE,
            },
        ],
    },
    # Generated families to fill out the Students tab (several per month,
    # one to three children each; about one in three has a student subject).
    {
        'parent': {
            'full_name': 'Joyce Kaunda', 'phone': '0991000000'[:10], 'email': 'joyce.kaunda@example.mw',
            'address': 'Area 12', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Stanley Kaunda', 'enrolled_months_ago': 0, 'enrolled_day': 2, 'year_group': 6, 'school': 'St Andrews International High School', 'subjects': ['English Language', 'Mathematics', 'Physics'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Thokozani Kanjira', 'phone': '0991000137'[:10], 'email': 'thokozani.kanjira@example.mw',
            'address': 'Area 49', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Frank Kanjira', 'enrolled_months_ago': 0, 'enrolled_day': 20, 'year_group': 3, 'school': 'Marist International School', 'subjects': ['English Language'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Pempho Kanjira', 'enrolled_months_ago': 0, 'enrolled_day': 20, 'year_group': 11, 'school': 'Marist International School', 'subjects': ['Mathematics'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Davie Kalinga', 'phone': '0991000274'[:10], 'email': 'davie.kalinga@example.mw',
            'address': 'Area 36', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Lameck Kalinga', 'enrolled_months_ago': 0, 'enrolled_day': 11, 'year_group': 5, 'school': 'Lilongwe Private School', 'subjects': ['Mathematics'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Dennis Simbeye', 'phone': '0991000411'[:10], 'email': 'dennis.simbeye@example.mw',
            'address': 'Mandala', 'city': 'Blantyre',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Nyasha Simbeye', 'enrolled_months_ago': 0, 'enrolled_day': 7, 'year_group': 9, 'school': 'International School of Lilongwe', 'subjects': ['Physics'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Davie Simbeye', 'enrolled_months_ago': 0, 'enrolled_day': 7, 'year_group': 3, 'school': 'Dedza Girls Secondary', 'subjects': ['Physics'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Joyce Simbeye', 'enrolled_months_ago': 0, 'enrolled_day': 7, 'year_group': 6, 'school': 'Kamuzu Academy', 'subjects': ['Biology', 'Chemistry', 'English Language'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Rose Kachale', 'phone': '0991000548'[:10], 'email': 'rose.kachale@example.mw',
            'address': 'Namiwawa', 'city': 'Blantyre',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Trevor Kachale', 'enrolled_months_ago': 0, 'enrolled_day': 13, 'year_group': 12, 'school': 'Bishop Mackenzie International School', 'subjects': ['Mathematics', 'Physics', 'English Language'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Felix Salima', 'phone': '0991000685'[:10], 'email': 'felix.salima@example.mw',
            'address': 'Luwinga', 'city': 'Mzuzu',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Lusungu Salima', 'enrolled_months_ago': 0, 'enrolled_day': 17, 'year_group': 12, 'school': 'International School of Lilongwe', 'subjects': ['English Language', 'Physics'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Nyasha Salima', 'enrolled_months_ago': 0, 'enrolled_day': 17, 'year_group': 12, 'school': 'Bishop Mackenzie International School', 'subjects': ['Biology', 'Chemistry'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Tamanda Lungu', 'phone': '0991000822'[:10], 'email': 'tamanda.lungu@example.mw',
            'address': 'Chinamwali', 'city': 'Zomba',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Yamikani Lungu', 'enrolled_months_ago': 0, 'enrolled_day': 5, 'year_group': 6, 'school': 'St Andrews International High School', 'subjects': ['Physics', 'Mathematics', 'Chemistry'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Mphatso Thindwa', 'phone': '0991000959'[:10], 'email': 'mphatso.thindwa@example.mw',
            'address': 'Area 15', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Sungeni Thindwa', 'enrolled_months_ago': 0, 'enrolled_day': 14, 'year_group': 3, 'school': 'St Andrews International High School', 'subjects': ['Biology'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Felix Manda', 'phone': '0991001096'[:10], 'email': 'felix.manda@example.mw',
            'address': 'Area 12', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Lameck Manda', 'enrolled_months_ago': 0, 'enrolled_day': 3, 'year_group': 5, 'school': 'Dedza Girls Secondary', 'subjects': ['Mathematics', 'Physics', 'Biology'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Yamikani Manda', 'enrolled_months_ago': 0, 'enrolled_day': 3, 'year_group': 13, 'school': 'Kamuzu Academy', 'subjects': ['Chemistry'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Gift Msowoya', 'phone': '0991001233'[:10], 'email': 'gift.msowoya@example.mw',
            'address': 'Area 49', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Fumbani Msowoya', 'enrolled_months_ago': 0, 'enrolled_day': 14, 'year_group': 4, 'school': 'Kamuzu Academy', 'subjects': ['Mathematics', 'Physics', 'English Language'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Tamanda Msowoya', 'enrolled_months_ago': 0, 'enrolled_day': 14, 'year_group': 5, 'school': 'International School of Lilongwe', 'subjects': ['Physics'], 'learning_mode': LearningMode.ONLINE},
            {'full_name': 'Wezi Msowoya', 'enrolled_months_ago': 0, 'enrolled_day': 14, 'year_group': 5, 'school': 'Lilongwe Private School', 'subjects': ['Mathematics', 'Chemistry', 'Biology'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Ben Matola', 'phone': '0991001370'[:10], 'email': 'ben.matola@example.mw',
            'address': 'Area 36', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Tamanda Matola', 'enrolled_months_ago': 0, 'enrolled_day': 3, 'year_group': 7, 'school': 'Lilongwe Private School', 'subjects': ['Chemistry'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Gift Mbewe', 'phone': '0991001507'[:10], 'email': 'gift.mbewe@example.mw',
            'address': 'Mandala', 'city': 'Blantyre',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Fumbani Mbewe', 'enrolled_months_ago': 0, 'enrolled_day': 8, 'year_group': 10, 'school': 'Kamuzu Academy', 'subjects': ['English Language'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Mercy Mbewe', 'enrolled_months_ago': 0, 'enrolled_day': 8, 'year_group': 4, 'school': 'International School of Lilongwe', 'subjects': ['Biology'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Dorothy Bwanali', 'phone': '0991001644'[:10], 'email': 'dorothy.bwanali@example.mw',
            'address': 'Namiwawa', 'city': 'Blantyre',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Eunice Bwanali', 'enrolled_months_ago': 0, 'enrolled_day': 9, 'year_group': 3, 'school': 'International School of Lilongwe', 'subjects': ['Physics'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Stanley Kumwenda', 'phone': '0991001781'[:10], 'email': 'stanley.kumwenda@example.mw',
            'address': 'Luwinga', 'city': 'Mzuzu',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Chikondi Kumwenda', 'enrolled_months_ago': 1, 'enrolled_day': 17, 'year_group': 12, 'school': 'Dedza Girls Secondary', 'subjects': ['Mathematics', 'English Language', 'Chemistry'], 'learning_mode': LearningMode.ONLINE},
            {'full_name': 'Luka Kumwenda', 'enrolled_months_ago': 1, 'enrolled_day': 17, 'year_group': 9, 'school': 'St Andrews International High School', 'subjects': ['Physics'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Mwayi Kumwenda', 'enrolled_months_ago': 1, 'enrolled_day': 17, 'year_group': 12, 'school': 'Kamuzu Academy', 'subjects': ['Biology'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Mphatso Chimombo', 'phone': '0991001918'[:10], 'email': 'mphatso.chimombo@example.mw',
            'address': 'Chinamwali', 'city': 'Zomba',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Blessings Chimombo', 'enrolled_months_ago': 1, 'enrolled_day': 5, 'year_group': 10, 'school': 'Bishop Mackenzie International School', 'subjects': ['Chemistry'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Joyce Mlenga', 'phone': '0991002055'[:10], 'email': 'joyce.mlenga@example.mw',
            'address': 'Area 15', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Amos Mlenga', 'enrolled_months_ago': 1, 'enrolled_day': 4, 'year_group': 5, 'school': 'Robert Laws Secondary School', 'subjects': ['Chemistry', 'Physics'], 'learning_mode': LearningMode.ONLINE},
            {'full_name': 'Isaac Mlenga', 'enrolled_months_ago': 1, 'enrolled_day': 4, 'year_group': 13, 'school': 'Dedza Girls Secondary', 'subjects': ['Physics'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Kondwani Mhango', 'phone': '0991002192'[:10], 'email': 'kondwani.mhango@example.mw',
            'address': 'Area 12', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Esther Mhango', 'enrolled_months_ago': 1, 'enrolled_day': 19, 'year_group': 3, 'school': 'Robert Laws Secondary School', 'subjects': ['Physics'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Eunice Nkosi', 'phone': '0991002329'[:10], 'email': 'eunice.nkosi@example.mw',
            'address': 'Area 49', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Maxwell Nkosi', 'enrolled_months_ago': 1, 'enrolled_day': 1, 'year_group': 6, 'school': 'Robert Laws Secondary School', 'subjects': ['Biology'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Kondwani Chapola', 'phone': '0991002466'[:10], 'email': 'kondwani.chapola@example.mw',
            'address': 'Area 36', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Yankho Chapola', 'enrolled_months_ago': 1, 'enrolled_day': 10, 'year_group': 9, 'school': 'Bishop Mackenzie International School', 'subjects': ['English Language'], 'learning_mode': LearningMode.ONLINE},
            {'full_name': 'Madalitso Chapola', 'enrolled_months_ago': 1, 'enrolled_day': 10, 'year_group': 6, 'school': 'St Andrews International High School', 'subjects': ['Chemistry', 'English Language', 'Mathematics'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Pempho Moyo', 'phone': '0991002603'[:10], 'email': 'pempho.moyo@example.mw',
            'address': 'Mandala', 'city': 'Blantyre',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Madalitso Moyo', 'enrolled_months_ago': 1, 'enrolled_day': 4, 'year_group': 9, 'school': 'Kamuzu Academy', 'subjects': ['Mathematics', 'Physics'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Luka Moyo', 'enrolled_months_ago': 1, 'enrolled_day': 4, 'year_group': 10, 'school': 'Kamuzu Academy', 'subjects': ['Biology', 'English Language', 'Mathematics'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Trevor Moyo', 'enrolled_months_ago': 1, 'enrolled_day': 4, 'year_group': 5, 'school': 'Robert Laws Secondary School', 'subjects': ['English Language'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Naomi Mkwapatira', 'phone': '0991002740'[:10], 'email': 'naomi.mkwapatira@example.mw',
            'address': 'Namiwawa', 'city': 'Blantyre',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Lameck Mkwapatira', 'enrolled_months_ago': 1, 'enrolled_day': 1, 'year_group': 12, 'school': 'Lilongwe Private School', 'subjects': ['Physics'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Charles Banda', 'phone': '0991002877'[:10], 'email': 'charles.banda@example.mw',
            'address': 'Luwinga', 'city': 'Mzuzu',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Maxwell Banda', 'enrolled_months_ago': 2, 'enrolled_day': 1, 'year_group': 12, 'school': 'Robert Laws Secondary School', 'subjects': ['English Language'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Patience Banda', 'enrolled_months_ago': 2, 'enrolled_day': 1, 'year_group': 8, 'school': 'Robert Laws Secondary School', 'subjects': ['Chemistry', 'Physics', 'English Language'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Davie Jere', 'phone': '0991003014'[:10], 'email': 'davie.jere@example.mw',
            'address': 'Chinamwali', 'city': 'Zomba',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Stanley Jere', 'enrolled_months_ago': 2, 'enrolled_day': 11, 'year_group': 10, 'school': 'Kamuzu Academy', 'subjects': ['Physics', 'Biology'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Chikondi Ngwira', 'phone': '0991003151'[:10], 'email': 'chikondi.ngwira@example.mw',
            'address': 'Area 15', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Chifundo Ngwira', 'enrolled_months_ago': 2, 'enrolled_day': 4, 'year_group': 10, 'school': 'Bishop Mackenzie International School', 'subjects': ['Physics', 'Biology', 'Chemistry'], 'learning_mode': LearningMode.ONLINE},
            {'full_name': 'Sungeni Ngwira', 'enrolled_months_ago': 2, 'enrolled_day': 4, 'year_group': 8, 'school': 'International School of Lilongwe', 'subjects': ['Biology', 'Physics', 'Chemistry'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Naomi Ngwira', 'enrolled_months_ago': 2, 'enrolled_day': 4, 'year_group': 10, 'school': 'Robert Laws Secondary School', 'subjects': ['Mathematics'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Lusungu Mponda', 'phone': '0991003288'[:10], 'email': 'lusungu.mponda@example.mw',
            'address': 'Area 12', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Chancy Mponda', 'enrolled_months_ago': 3, 'enrolled_day': 8, 'year_group': 5, 'school': 'Bishop Mackenzie International School', 'subjects': ['Chemistry'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Frank Soko', 'phone': '0991003425'[:10], 'email': 'frank.soko@example.mw',
            'address': 'Area 49', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.FATHER,
        'children': [
            {'full_name': 'Maxwell Soko', 'enrolled_months_ago': 3, 'enrolled_day': 20, 'year_group': 10, 'school': 'Marist International School', 'subjects': ['English Language', 'Physics'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Priscilla Soko', 'enrolled_months_ago': 3, 'enrolled_day': 20, 'year_group': 9, 'school': 'Bishop Mackenzie International School', 'subjects': ['Mathematics'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Joyce Zimba', 'phone': '0991003562'[:10], 'email': 'joyce.zimba@example.mw',
            'address': 'Area 36', 'city': 'Lilongwe',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Madalitso Zimba', 'enrolled_months_ago': 4, 'enrolled_day': 21, 'year_group': 8, 'school': 'Dedza Girls Secondary', 'subjects': ['English Language', 'Physics'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Bernadette Kamwendo', 'phone': '0991003699'[:10], 'email': 'bernadette.kamwendo@example.mw',
            'address': 'Mandala', 'city': 'Blantyre',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Tamanda Kamwendo', 'enrolled_months_ago': 4, 'enrolled_day': 23, 'year_group': 12, 'school': 'Robert Laws Secondary School', 'subjects': ['Mathematics', 'Biology'], 'learning_mode': LearningMode.IN_PERSON},
        ],
    },
    {
        'parent': {
            'full_name': 'Madalitso Mtonga', 'phone': '0991003836'[:10], 'email': 'madalitso.mtonga@example.mw',
            'address': 'Namiwawa', 'city': 'Blantyre',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Alinafe Mtonga', 'enrolled_months_ago': 4, 'enrolled_day': 13, 'year_group': 12, 'school': 'Bishop Mackenzie International School', 'subjects': ['Chemistry'], 'learning_mode': LearningMode.ONLINE},
            {'full_name': 'Priscilla Mtonga', 'enrolled_months_ago': 4, 'enrolled_day': 13, 'year_group': 7, 'school': 'Kamuzu Academy', 'subjects': ['Biology'], 'learning_mode': LearningMode.ONLINE},
        ],
    },
    {
        'parent': {
            'full_name': 'Towera Sakala', 'phone': '0991003973'[:10], 'email': 'towera.sakala@example.mw',
            'address': 'Luwinga', 'city': 'Mzuzu',
        },
        'relationship': Guardianship.Relationship.MOTHER,
        'children': [
            {'full_name': 'Priscilla Sakala', 'enrolled_months_ago': 5, 'enrolled_day': 9, 'year_group': 4, 'school': 'Lilongwe Private School', 'subjects': ['Chemistry', 'Physics'], 'learning_mode': LearningMode.IN_PERSON},
            {'full_name': 'Kondwani Sakala', 'enrolled_months_ago': 5, 'enrolled_day': 9, 'year_group': 10, 'school': 'Marist International School', 'subjects': ['Physics', 'Biology'], 'learning_mode': LearningMode.ONLINE},
            {'full_name': 'Chikondi Sakala', 'enrolled_months_ago': 5, 'enrolled_day': 9, 'year_group': 7, 'school': 'Robert Laws Secondary School', 'subjects': ['Chemistry', 'Mathematics'], 'learning_mode': LearningMode.ONLINE},
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
        'subjects': ['English Language', 'Physics'],
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
        'enrolled_months_ago': 1,
        'enrolled_day': 24,
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
        'enrolled_months_ago': 2,
        'enrolled_day': 2,
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
            subjects_by_name = self._seed_tutors_and_subjects()
            self._seed_clients(subjects_by_name)
            self._seed_student_subjects(admin, subjects_by_name)
            self._seed_enquiries(admin, subjects_by_name)

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
        """Returns {subject_name: Subject} for every subject in DUMMY_SUBJECTS."""
        level = Level.objects.get(name=DUMMY_SUBJECT_LEVEL)  # seeded by academics migration 0006
        subjects = {}
        for subject_name in DUMMY_SUBJECTS:
            subject, created = Subject.objects.get_or_create(
                level=level,
                name=subject_name,
                defaults={'is_active': True, 'has_paper': subject_name in SUBJECTS_WITH_PAPER},
            )
            if created:
                self.stdout.write(f'Created subject {subject}')
            subjects[subject_name] = subject

        for tutor_data in TUTORS:
            user = self._get_or_create_staff_user(tutor_data, Role.TUTOR, EmploymentType.PART_TIME)
            tutor_profile, _ = TutorProfile.objects.get_or_create(
                user=user,
                defaults={'hourly_rate': tutor_data['hourly_rate'], 'is_available': True},
            )
            for subject_name in tutor_data['subjects']:
                TutorSubject.objects.get_or_create(tutor=tutor_profile, subject=subjects[subject_name])
            # Only seed hours for a tutor with none, so hours someone set
            # by hand survive a re-run.
            if not tutor_profile.working_hours.exists():
                WorkingHours.objects.bulk_create(
                    [
                        WorkingHours(tutor=tutor_profile, weekday=weekday, start_time=start, end_time=end)
                        for weekday, start, end in tutor_data['working_hours']
                    ]
                )
        return subjects

    # -- clients --------------------------------------------------------

    def _seed_clients(self, subjects_by_name):
        # A Student row is only ever meant to exist once someone has
        # actually enrolled (see clients.models.Student's docstring) — so
        # every roster student created here gets a real Enrollment with
        # subjects, not just a bare Student + Guardianship.
        # Each child carries its own enrolment month (enrolled_months_ago +
        # enrolled_day) so the Students tab (grouped by enrolment month) has
        # something to group. Rows that already exist are corrected too.
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
                        'enrolled_on': enrolment_date(child['enrolled_months_ago'], child['enrolled_day']),
                    },
                )
                self._set_enrolled_on(student, child['enrolled_months_ago'], child['enrolled_day'])
                if created:
                    self.stdout.write(f'Created student {student.full_name} ({student.student_number})')

                Guardianship.objects.get_or_create(
                    student=student,
                    parent=parent,
                    defaults={'relationship': entry['relationship'], 'is_primary_contact': True},
                )

                if not Enrollment.objects.filter(student=student).exists():
                    start_date = timezone.now().date() - timedelta(weeks=6)
                    enrollment = Enrollment.objects.create(
                        student=student,
                        start_date=start_date,
                        end_date=compute_end_date(start_date, ROSTER_ENROLLMENT_DURATION_WEEKS),
                        learning_mode=child['learning_mode'],
                    )
                    enrollment.subjects.set(subjects_by_name[name] for name in child['subjects'])
                    self.stdout.write(f'Enrolled {student.full_name} in {", ".join(child["subjects"])}')

    def _set_enrolled_on(self, student, months_ago, day):
        # Only ever called for students named in this file, so a real
        # student's enrolment date is never touched.
        wanted = enrolment_date(months_ago, day)
        if student.enrolled_on != wanted:
            student.enrolled_on = wanted
            student.save(update_fields=['enrolled_on'])

    # -- timetable --------------------------------------------------------

    def _seed_student_subjects(self, admin, subjects_by_name):
        start = times.week_start(times.today()) - timedelta(weeks=STUDENT_SUBJECT_STARTED_WEEKS_AGO)
        for student_name, subject_name, tutor_email, planned, mode, slots in STUDENT_SUBJECTS:
            student = Student.objects.get(full_name=student_name)
            subject = subjects_by_name[subject_name]
            # Any earlier one (even ended) means this was seeded already.
            if StudentSubject.objects.filter(student=student, subject=subject).exists():
                continue
            tutor = TutorProfile.objects.get(user__email=tutor_email)
            ss, _ = student_subject_service.create_student_subject(
                admin,
                student=student,
                subject=subject,
                tutor=tutor,
                planned_sessions=planned,
                start_date=start,
                mode=mode,
                slots=[{'weekday': d, 'start_time': a, 'end_time': b} for d, a, b in slots],
                allow_clash=True,
            )
            self._seed_past_sessions(ss, tutor)
            self.stdout.write(f'Booked {student_name} for {subject} with {tutor.user.full_name}')

    def _seed_past_sessions(self, ss, tutor):
        """Sessions only generate forwards from today, so a demo that started
        weeks ago gets its past sessions here: all Held (ticking topics in
        syllabus order), except the latest, left for the tutor to log."""
        moment = times.now()
        past = []
        for day in times.daterange(ss.start_date, moment.date()):
            for slot in ss.slots.all():
                if slot.weekday == day.weekday() and times.at(day, slot.start_time) < moment:
                    past.append(
                        Session(student_subject=ss, slot=slot, date=day, start_time=slot.start_time, end_time=slot.end_time)
                    )
        past.sort(key=lambda s: (s.date, s.start_time))
        topics = list(ss.topics.order_by('order', 'id'))
        for index, session in enumerate(past):
            if index < len(past) - 1:
                session.status = SessionStatus.HELD
                session.logged_by = tutor.user
                session.logged_at = times.session_end(session)
            session.save()
            if session.status == SessionStatus.HELD and topics:
                session.topics_covered.set(topics[index * 2 : index * 2 + 2])

    # -- enquiries / enrollments / billing -------------------------------

    def _seed_enquiries(self, admin, subjects_by_name):
        for spec in ENQUIRIES:
            enquiry = Enquiry.objects.filter(student_name=spec['student_name']).first()
            if enquiry is None:
                enquiry = self._create_enquiry_from_spec(spec, admin, subjects_by_name)
                self.stdout.write(f'Created enquiry for {enquiry.student_name} ({enquiry.stage})')

            self._advance_enquiry(enquiry, spec, admin)
            if 'enrolled_months_ago' in spec:
                enquiry.refresh_from_db()
                if enquiry.enrollment_id:
                    self._set_enrolled_on(enquiry.enrollment.student, spec['enrolled_months_ago'], spec['enrolled_day'])

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
