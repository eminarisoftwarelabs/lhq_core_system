from datetime import date

from rest_framework.test import APITestCase

from academics.models import Subject, TimetableSlot
from accounts.models import Role, TutorProfile, User
from clients.models import Guardianship, Parent, Student, StudentNote
from enrollments.models import Enrollment, EnrollmentStatus, LearningMode


def make_user(role, email=None, **kwargs):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(
        email=email, full_name=kwargs.pop('full_name', role.title()), role=role, **kwargs
    )


class StudentSearchTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor = make_user(Role.TUTOR)
        self.alice = Student.objects.create(student_number='STU-000001', full_name='Alice Wang', grade='7')
        self.bob = Student.objects.create(student_number='STU-000002', full_name='Bob Chen', grade='8')

    def test_search_by_name(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/?q=alice')
        self.assertEqual(resp.status_code, 200)
        names = {row['full_name'] for row in resp.data['results']}
        self.assertEqual(names, {'Alice Wang'})

    def test_search_by_student_number(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/?q=000002')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['full_name'], 'Bob Chen')

    def test_search_alias_path(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/search/?q=alice')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)

    def test_no_query_returns_everyone(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get('/api/students/')
        self.assertEqual(resp.data['count'], 2)

    def test_tutor_forbidden(self):
        self.client.force_authenticate(self.tutor)
        resp = self.client.get('/api/students/')
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_unauthorized(self):
        resp = self.client.get('/api/students/')
        self.assertEqual(resp.status_code, 401)


class StudentDetailTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.student = Student.objects.create(
            student_number='STU-000001',
            full_name='Alice Wang',
            year_group=7,
            school='Kamuzu Academy',
            phone='0888123456',
            email='alice@example.com',
            grade='7',
        )
        parent = Parent.objects.create(
            full_name='Wanjiru Wang', phone='0999', address='15 Chilobwe Road', city='Blantyre'
        )
        Guardianship.objects.create(student=self.student, parent=parent, is_primary_contact=True)

    def test_detail_includes_guardianships(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/students/{self.student.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['guardianships']), 1)
        self.assertEqual(resp.data['guardianships'][0]['parent']['full_name'], 'Wanjiru Wang')
        self.assertTrue(resp.data['guardianships'][0]['is_primary_contact'])
        self.assertEqual(resp.data['guardianships'][0]['parent']['address'], '15 Chilobwe Road')
        self.assertEqual(resp.data['guardianships'][0]['parent']['city'], 'Blantyre')

    def test_detail_includes_year_group_school_and_contact_details(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/students/{self.student.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['year_group'], 7)
        self.assertEqual(resp.data['school'], 'Kamuzu Academy')
        self.assertEqual(resp.data['phone'], '0888123456')
        self.assertEqual(resp.data['email'], 'alice@example.com')


class StudentTimetableTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.student = Student.objects.create(student_number='STU-000001', full_name='Alice Wang', grade='7')
        self.subject = Subject.objects.create(name='Maths')
        TimetableSlot.objects.create(subject=self.subject, day_of_week=2, start_time='15:00', end_time='16:00')

    def test_active_enrollment_subject_appears_in_timetable(self):
        enrollment = Enrollment.objects.create(
            student=self.student,
            start_date=date(2026, 1, 5),
            end_date=date(2026, 4, 5),
            learning_mode=LearningMode.IN_PERSON,
            status=EnrollmentStatus.ACTIVE,
        )
        enrollment.subjects.set([self.subject])

        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/students/{self.student.id}/timetable/')

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['subject_name'], 'Maths')
        self.assertEqual(resp.data[0]['day_of_week'], 2)

    def test_withdrawn_enrollment_excluded(self):
        enrollment = Enrollment.objects.create(
            student=self.student,
            start_date=date(2026, 1, 5),
            end_date=date(2026, 4, 5),
            learning_mode=LearningMode.IN_PERSON,
            status=EnrollmentStatus.WITHDRAWN,
        )
        enrollment.subjects.set([self.subject])

        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/students/{self.student.id}/timetable/')

        self.assertEqual(resp.data, [])


class SubjectRosterTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.tutor_user = make_user(Role.TUTOR)
        self.tutor_profile = TutorProfile.objects.create(user=self.tutor_user)
        self.other_tutor_user = make_user(Role.TUTOR, email='other@lhq.test')
        self.other_tutor_profile = TutorProfile.objects.create(user=self.other_tutor_user)

        self.subject = Subject.objects.create(name='Maths', tutor=self.tutor_profile)
        self.student = Student.objects.create(student_number='STU-000001', full_name='Alice Wang', grade='7')

        enrollment = Enrollment.objects.create(
            student=self.student,
            start_date=date(2026, 1, 5),
            end_date=date(2026, 4, 5),
            learning_mode=LearningMode.IN_PERSON,
            status=EnrollmentStatus.ACTIVE,
        )
        enrollment.subjects.set([self.subject])

    def test_staff_sees_roster(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/subjects/{self.subject.id}/students/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['full_name'], 'Alice Wang')

    def test_owning_tutor_sees_roster(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get(f'/api/subjects/{self.subject.id}/students/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_non_owning_tutor_gets_404(self):
        self.client.force_authenticate(self.other_tutor_user)
        resp = self.client.get(f'/api/subjects/{self.subject.id}/students/')
        self.assertEqual(resp.status_code, 404)

    def test_withdrawn_student_excluded_from_roster(self):
        Enrollment.objects.filter(student=self.student).update(status=EnrollmentStatus.WITHDRAWN)
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/subjects/{self.subject.id}/students/')
        self.assertEqual(resp.data, [])


class TutorStudentFixtureMixin:
    """A tutor teaching Maths with one active student, a second tutor
    teaching Physics, and a student neither of them has (Cara)."""

    def make_fixture(self):
        self.owner = make_user(Role.OWNER)
        self.tutor_user = make_user(Role.TUTOR, full_name='Tessa Tutor')
        self.tutor_profile = TutorProfile.objects.create(user=self.tutor_user)
        self.other_user = make_user(Role.TUTOR, email='other@lhq.test', full_name='Otto Other')
        self.other_profile = TutorProfile.objects.create(user=self.other_user)
        self.stranger_user = make_user(Role.TUTOR, email='stranger@lhq.test')
        self.stranger_profile = TutorProfile.objects.create(user=self.stranger_user)

        self.maths = Subject.objects.create(name='Maths', tutor=self.tutor_profile)
        self.physics = Subject.objects.create(name='Physics', tutor=self.other_profile)
        self.biology = Subject.objects.create(name='Biology', tutor=self.stranger_profile)

        self.alice = Student.objects.create(
            student_number='STU-000001', full_name='Alice Wang', school='Kamuzu Academy', grade='7',
            phone='0999000111', email='alice@example.com',
        )
        parent = Parent.objects.create(full_name='Mrs Wang', phone='0888000222')
        Guardianship.objects.create(student=self.alice, parent=parent, relationship='MOTHER', is_primary_contact=True)
        self.enrol(self.alice, [self.maths, self.physics])

        self.cara = Student.objects.create(student_number='STU-000002', full_name='Cara Banda')
        self.enrol(self.cara, [self.biology])

    def enrol(self, student, subjects, status=EnrollmentStatus.ACTIVE):
        enrollment = Enrollment.objects.create(
            student=student,
            start_date=date(2026, 1, 5),
            end_date=date(2026, 4, 5),
            learning_mode=LearningMode.IN_PERSON,
            status=status,
        )
        enrollment.subjects.set(subjects)
        return enrollment


class TutorStudentAccessTests(TutorStudentFixtureMixin, APITestCase):
    def setUp(self):
        self.make_fixture()

    def test_tutor_sees_own_student_without_guardian_or_contact_details(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get(f'/api/students/{self.alice.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['full_name'], 'Alice Wang')
        self.assertEqual(resp.data['grade'], '7')
        for hidden in ('guardianships', 'phone', 'email'):
            self.assertNotIn(hidden, resp.data)

    def test_shared_subjects_lists_only_the_requesting_tutors_subjects(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get(f'/api/students/{self.alice.id}/')
        self.assertEqual(resp.data['shared_subjects'], [{'id': self.maths.id, 'name': 'Maths'}])

    def test_tutor_gets_404_for_a_student_outside_their_subjects(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get(f'/api/students/{self.cara.id}/')
        self.assertEqual(resp.status_code, 404)

    def test_withdrawn_enrollment_removes_tutor_access(self):
        Enrollment.objects.filter(student=self.alice).update(status=EnrollmentStatus.WITHDRAWN)
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get(f'/api/students/{self.alice.id}/')
        self.assertEqual(resp.status_code, 404)

    def test_staff_still_get_the_full_record(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/students/{self.alice.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['phone'], '0999000111')
        self.assertEqual(len(resp.data['guardianships']), 1)
        self.assertEqual(resp.data['shared_subjects'], [])

    def test_tutor_roster_omits_guardian_and_contact_details(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get(f'/api/subjects/{self.maths.id}/students/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data[0]['full_name'], 'Alice Wang')
        for hidden in ('guardianships', 'phone', 'email'):
            self.assertNotIn(hidden, resp.data[0])

    def test_staff_roster_keeps_guardians(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.get(f'/api/subjects/{self.maths.id}/students/')
        self.assertEqual(len(resp.data[0]['guardianships']), 1)

    def test_tutor_still_cannot_list_students_or_see_timetables(self):
        self.client.force_authenticate(self.tutor_user)
        self.assertEqual(self.client.get('/api/students/').status_code, 403)
        self.assertEqual(self.client.get(f'/api/students/{self.alice.id}/timetable/').status_code, 403)
        self.assertEqual(self.client.get('/api/enrollments/').status_code, 403)
        self.assertEqual(self.client.get('/api/enquiries/').status_code, 403)


class StudentNoteTests(TutorStudentFixtureMixin, APITestCase):
    def setUp(self):
        self.make_fixture()
        self.url = f'/api/students/{self.alice.id}/notes/'

    def post_note(self, user, **overrides):
        self.client.force_authenticate(user)
        payload = {'subject': self.maths.id, 'category': 'ACADEMIC', 'text': 'Solid grasp of fractions.'}
        payload.update(overrides)
        return self.client.post(self.url, payload, format='json')

    def test_tutor_adds_a_note_recorded_against_them(self):
        resp = self.post_note(self.tutor_user)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['author_name'], 'Tessa Tutor')
        self.assertEqual(resp.data['subject_name'], 'Maths')
        self.assertEqual(resp.data['category'], 'ACADEMIC')
        note = StudentNote.objects.get()
        self.assertEqual(note.student, self.alice)
        self.assertEqual(note.author, self.tutor_user)

    def test_behavioral_category_accepted(self):
        resp = self.post_note(self.tutor_user, category='BEHAVIORAL', text='Distracted in the second half.')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['category'], 'BEHAVIORAL')

    def test_author_and_student_cannot_be_forged_in_the_payload(self):
        resp = self.post_note(self.tutor_user, author=self.owner.id, author_name='Someone Else', student=self.cara.id)
        self.assertEqual(resp.status_code, 201)
        note = StudentNote.objects.get()
        self.assertEqual(note.author, self.tutor_user)
        self.assertEqual(note.author_name, 'Tessa Tutor')
        self.assertEqual(note.student, self.alice)

    def test_subject_must_be_one_the_tutor_teaches(self):
        resp = self.post_note(self.tutor_user, subject=self.physics.id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('subject', resp.data)
        self.assertEqual(StudentNote.objects.count(), 0)

    def test_subject_must_be_one_the_student_is_in(self):
        history = Subject.objects.create(name='History', tutor=self.tutor_profile)
        resp = self.post_note(self.tutor_user, subject=history.id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('subject', resp.data)

    def test_blank_text_and_unknown_category_rejected(self):
        self.assertEqual(self.post_note(self.tutor_user, text='   ').status_code, 400)
        self.assertEqual(self.post_note(self.tutor_user, category='GOSSIP').status_code, 400)
        self.assertEqual(StudentNote.objects.count(), 0)

    def test_tutor_without_access_to_the_student_gets_404_on_read_and_write(self):
        self.client.force_authenticate(self.stranger_user)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.post_note(self.stranger_user).status_code, 404)

    def test_staff_can_read_but_not_write_when_they_do_not_teach(self):
        StudentNote.objects.create(
            student=self.alice, subject=self.maths, author=self.tutor_user,
            author_name='Tessa Tutor', category='ACADEMIC', text='Good work.',
        )
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.url).data['count'], 1)
        self.assertEqual(self.post_note(self.owner).status_code, 403)

    def test_notes_are_visible_to_every_tutor_who_teaches_the_student(self):
        self.post_note(self.tutor_user)
        self.client.force_authenticate(self.other_user)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['author_name'], 'Tessa Tutor')

    def test_newest_first_and_category_filter(self):
        self.post_note(self.tutor_user, text='First')
        self.post_note(self.tutor_user, category='BEHAVIORAL', text='Second')
        self.client.force_authenticate(self.owner)
        texts = [n['text'] for n in self.client.get(self.url).data['results']]
        self.assertEqual(texts, ['Second', 'First'])
        filtered = self.client.get(self.url + '?category=behavioral').data['results']
        self.assertEqual([n['text'] for n in filtered], ['Second'])

    def test_notes_only_include_the_requested_student(self):
        self.client.force_authenticate(self.stranger_user)
        resp = self.client.post(
            f'/api/students/{self.cara.id}/notes/',
            {'subject': self.biology.id, 'category': 'ACADEMIC', 'text': 'Cara note'},
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.url).data['count'], 0)

    def test_notes_cannot_be_edited_or_deleted(self):
        note_resp = self.post_note(self.tutor_user)
        self.client.force_authenticate(self.tutor_user)
        self.assertEqual(self.client.patch(self.url, {'text': 'x'}, format='json').status_code, 405)
        self.assertEqual(self.client.delete(self.url).status_code, 405)
        detail = f'{self.url}{note_resp.data["id"]}/'
        self.assertEqual(self.client.patch(detail, {'text': 'x'}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(detail).status_code, 404)
        self.assertEqual(StudentNote.objects.get().text, 'Solid grasp of fractions.')

    def test_anonymous_is_unauthorized(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_note_survives_its_author_being_removed(self):
        self.post_note(self.tutor_user)
        Subject.objects.filter(pk=self.maths.pk).update(tutor=None)
        self.tutor_profile.delete()
        self.tutor_user.delete()
        note = StudentNote.objects.get()
        self.assertIsNone(note.author)
        self.assertEqual(note.author_name, 'Tessa Tutor')
