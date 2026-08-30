from .models import Student

STUDENT_NUMBER_PREFIX = 'STU-'
STUDENT_NUMBER_WIDTH = 6


def generate_student_number():
    """Sequential, prefixed, guaranteed-unique student number.

    Zero-padded to a fixed width so lexicographic ordering (used to find the
    highest existing number) matches numeric ordering. Walks forward past
    any collision until it finds a genuinely free number, so it stays
    correct even if a row was created out of band (e.g. via /admin/).
    """
    last = (
        Student.objects.filter(student_number__startswith=STUDENT_NUMBER_PREFIX)
        .order_by('-student_number')
        .values_list('student_number', flat=True)
        .first()
    )
    next_seq = 1
    if last:
        digits = last[len(STUDENT_NUMBER_PREFIX):]
        if digits.isdigit():
            next_seq = int(digits) + 1

    candidate = f'{STUDENT_NUMBER_PREFIX}{next_seq:0{STUDENT_NUMBER_WIDTH}d}'
    while Student.objects.filter(student_number=candidate).exists():
        next_seq += 1
        candidate = f'{STUDENT_NUMBER_PREFIX}{next_seq:0{STUDENT_NUMBER_WIDTH}d}'
    return candidate
