from datetime import date

from rest_framework.test import APITestCase

from academics.models import Subject
from accounts.models import Role, TutorProfile, User
from assessments.models import Assessment, AssessmentCategory
from clients.models import Student
from enrollments.models import Enrollment, EnrollmentStatus, LearningMode


def make_user(role, email=None, full_name=None):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(email=email, full_name=full_name or role.title(), role=role)


def enroll(student, subjects, status=EnrollmentStatus.ACTIVE):
    enrollment = Enrollment.objects.create(
        student=student,
        start_date=date(2026, 1, 5),
        end_date=date(2026, 4, 5),
        learning_mode=LearningMode.IN_PERSON,
        status=status,
    )
    enrollment.subjects.set(subjects)
    return enrollment


class AssessmentApiTests(APITestCase):
    def setUp(self):
        self.owner = make_user(Role.OWNER)
        self.admin = make_user(Role.ADMIN)
        self.tutor_user = make_user(Role.TUTOR, full_name='Grace Banda')
        self.tutor = TutorProfile.objects.create(user=self.tutor_user)
        self.other_tutor_user = make_user(Role.TUTOR, email='other@lhq.test', full_name='Peter Phiri')
        self.other_tutor = TutorProfile.objects.create(user=self.other_tutor_user)

        self.maths = Subject.objects.create(name='Maths', tutor=self.tutor)
        self.physics = Subject.objects.create(name='Physics', tutor=self.other_tutor)
        self.unassigned = Subject.objects.create(name='Chemistry')

        # Alice takes both classes, Bob only Physics.
        self.alice = Student.objects.create(student_number='STU-000001', full_name='Alice Wang')
        self.bob = Student.objects.create(student_number='STU-000002', full_name='Bob Chen')
        self.alice_enrollment = enroll(self.alice, [self.maths, self.physics])
        enroll(self.bob, [self.physics])

    def _url(self, student):
        return f'/api/students/{student.id}/assessments/'

    def _post(self, student, subject, category=AssessmentCategory.ACADEMIC, comment='Strong on fractions.'):
        return self.client.post(
            self._url(student), {'subject': subject.id, 'category': category, 'comment': comment}, format='json'
        )

    def _make(self, student, subject, author, category=AssessmentCategory.ACADEMIC, comment='Note'):
        return Assessment.objects.create(
            student=student,
            subject=subject,
            author=author,
            author_name=author.full_name,
            category=category,
            comment=comment,
        )

    # -- writing -----------------------------------------------------------

    def test_tutor_assesses_a_student_in_their_own_subject(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self._post(self.alice, self.maths)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['student'], self.alice.id)
        self.assertEqual(resp.data['subject'], self.maths.id)
        self.assertEqual(resp.data['subject_name'], 'Maths')
        self.assertEqual(resp.data['author'], self.tutor_user.id)
        self.assertEqual(resp.data['author_name'], 'Grace Banda')
        self.assertEqual(resp.data['category'], 'ACADEMIC')
        self.assertEqual(resp.data['comment'], 'Strong on fractions.')
        self.assertIn('created_at', resp.data)

    def test_tutor_records_a_behavioural_comment(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self._post(self.alice, self.maths, AssessmentCategory.BEHAVIOURAL, 'Disrupted the class twice.')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['category'], 'BEHAVIOURAL')

    def test_author_and_student_cannot_be_spoofed_from_the_body(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.post(
            self._url(self.alice),
            {
                'subject': self.maths.id,
                'category': 'ACADEMIC',
                'comment': 'x',
                'author': self.owner.id,
                'author_name': 'Someone Else',
                'student': self.bob.id,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        saved = Assessment.objects.get()
        self.assertEqual(saved.author, self.tutor_user)
        self.assertEqual(saved.author_name, 'Grace Banda')
        self.assertEqual(saved.student, self.alice)

    def test_tutor_cannot_assess_under_a_subject_they_do_not_teach(self):
        # Alice is in Physics too, but Physics is Peter's class.
        self.client.force_authenticate(self.tutor_user)
        resp = self._post(self.alice, self.physics)
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(Assessment.objects.exists())

    def test_tutor_cannot_assess_a_student_outside_their_classes(self):
        # Bob isn't in Maths at all, so to Grace he doesn't exist.
        self.client.force_authenticate(self.tutor_user)
        resp = self._post(self.bob, self.maths)
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(Assessment.objects.exists())

    def test_tutor_cannot_assess_a_student_not_enrolled_in_that_subject(self):
        # Grace also teaches Chemistry, which Alice doesn't take.
        self.unassigned.tutor = self.tutor
        self.unassigned.save()
        self.client.force_authenticate(self.tutor_user)
        resp = self._post(self.alice, self.unassigned)
        self.assertEqual(resp.status_code, 403)

    def test_tutor_loses_access_once_the_student_withdraws(self):
        self.alice_enrollment.status = EnrollmentStatus.WITHDRAWN
        self.alice_enrollment.save()
        self.client.force_authenticate(self.tutor_user)
        self.assertEqual(self._post(self.alice, self.maths).status_code, 404)
        self.assertEqual(self.client.get(self._url(self.alice)).status_code, 404)

    def test_staff_who_do_not_teach_the_subject_cannot_write(self):
        for user in (self.owner, self.admin):
            self.client.force_authenticate(user)
            self.assertEqual(self._post(self.alice, self.maths).status_code, 403)
        self.assertFalse(Assessment.objects.exists())

    def test_staff_who_teach_the_subject_can_write(self):
        # TutorProfile isn't tied to role=TUTOR: an Owner can also teach.
        self.unassigned.tutor = TutorProfile.objects.create(user=self.owner)
        self.unassigned.save()
        enroll(self.bob, [self.unassigned])
        self.client.force_authenticate(self.owner)
        self.assertEqual(self._post(self.bob, self.unassigned).status_code, 201)

    def test_validation(self):
        self.client.force_authenticate(self.tutor_user)
        blank = self._post(self.alice, self.maths, comment='   ')
        self.assertEqual(blank.status_code, 400)
        self.assertIn('comment', blank.data)

        bad_category = self._post(self.alice, self.maths, category='SPORTY')
        self.assertEqual(bad_category.status_code, 400)
        self.assertIn('category', bad_category.data)

        missing = self.client.post(self._url(self.alice), {}, format='json')
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(set(missing.data), {'subject', 'category', 'comment'})

    def test_comment_is_trimmed(self):
        self.client.force_authenticate(self.tutor_user)
        resp = self._post(self.alice, self.maths, comment='  Good week.  ')
        self.assertEqual(resp.data['comment'], 'Good week.')

    # -- reading -----------------------------------------------------------

    def test_staff_see_every_comment_on_any_student(self):
        self._make(self.alice, self.maths, self.tutor_user)
        self._make(self.alice, self.physics, self.other_tutor_user, AssessmentCategory.BEHAVIOURAL)
        for user in (self.owner, self.admin):
            self.client.force_authenticate(user)
            resp = self.client.get(self._url(self.alice))
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(len(resp.data), 2)

    def test_tutor_sees_the_whole_record_of_a_student_they_teach(self):
        # Including what the student's other tutor wrote.
        self._make(self.alice, self.maths, self.tutor_user, comment='Mine')
        self._make(self.alice, self.physics, self.other_tutor_user, comment='Theirs')
        self.client.force_authenticate(self.tutor_user)
        resp = self.client.get(self._url(self.alice))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual({row['comment'] for row in resp.data}, {'Mine', 'Theirs'})

    def test_tutor_gets_404_for_a_student_they_do_not_teach(self):
        self._make(self.bob, self.physics, self.other_tutor_user)
        self.client.force_authenticate(self.tutor_user)
        self.assertEqual(self.client.get(self._url(self.bob)).status_code, 404)

    def test_unknown_student_is_404(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get('/api/students/99999/assessments/').status_code, 404)

    def test_anonymous_unauthorized(self):
        self.assertEqual(self.client.get(self._url(self.alice)).status_code, 401)
        self.assertEqual(self._post(self.alice, self.maths).status_code, 401)

    def test_newest_first(self):
        first = self._make(self.alice, self.maths, self.tutor_user, comment='first')
        second = self._make(self.alice, self.maths, self.tutor_user, comment='second')
        self.client.force_authenticate(self.owner)
        resp = self.client.get(self._url(self.alice))
        self.assertEqual([row['id'] for row in resp.data], [second.id, first.id])

    def test_filter_by_category_and_subject(self):
        self._make(self.alice, self.maths, self.tutor_user, AssessmentCategory.ACADEMIC, 'a')
        self._make(self.alice, self.maths, self.tutor_user, AssessmentCategory.BEHAVIOURAL, 'b')
        self._make(self.alice, self.physics, self.other_tutor_user, AssessmentCategory.ACADEMIC, 'c')
        self.client.force_authenticate(self.owner)

        behavioural = self.client.get(self._url(self.alice) + '?category=BEHAVIOURAL')
        self.assertEqual([row['comment'] for row in behavioural.data], ['b'])

        physics = self.client.get(self._url(self.alice) + f'?subject={self.physics.id}')
        self.assertEqual([row['comment'] for row in physics.data], ['c'])

        self.assertEqual(self.client.get(self._url(self.alice) + '?category=NOPE').status_code, 400)
        self.assertEqual(self.client.get(self._url(self.alice) + '?subject=abc').status_code, 400)

    # -- permanence --------------------------------------------------------

    def test_no_edit_or_delete(self):
        assessment = self._make(self.alice, self.maths, self.tutor_user)
        self.client.force_authenticate(self.tutor_user)
        for method in (self.client.put, self.client.patch, self.client.delete):
            self.assertEqual(method(self._url(self.alice), {}, format='json').status_code, 405)
        self.assertTrue(Assessment.objects.filter(pk=assessment.pk).exists())

    def test_comment_survives_its_author_being_deleted(self):
        assessment = self._make(self.alice, self.physics, self.other_tutor_user, comment='Keeps trying.')
        # Mirrors accounts.UserDetailView.delete's precondition: subjects
        # are reassigned before a teaching account can be removed.
        self.physics.tutor = None
        self.physics.save()
        self.other_tutor.delete()
        self.other_tutor_user.delete()

        assessment.refresh_from_db()
        self.assertIsNone(assessment.author)
        self.client.force_authenticate(self.owner)
        row = self.client.get(self._url(self.alice)).data[0]
        self.assertEqual(row['comment'], 'Keeps trying.')
        self.assertEqual(row['author_name'], 'Peter Phiri')
        self.assertIsNone(row['author'])

    def test_comment_survives_the_tutor_being_reassigned(self):
        self._make(self.alice, self.maths, self.tutor_user, comment='Before the handover.')
        self.maths.tutor = self.other_tutor
        self.maths.save()
        self.client.force_authenticate(self.other_tutor_user)
        resp = self.client.get(self._url(self.alice))
        self.assertEqual(resp.data[0]['comment'], 'Before the handover.')
        self.assertEqual(resp.data[0]['author_name'], 'Grace Banda')


class TutorBoundaryTests(APITestCase):
    """A tutor's whole surface is: their subjects, those subjects'
    rosters, and assessments. Everything else the centre runs on is
    refused - this pins that so a new endpoint can't quietly widen it."""

    def setUp(self):
        self.tutor_user = make_user(Role.TUTOR)
        self.tutor = TutorProfile.objects.create(user=self.tutor_user)
        self.maths = Subject.objects.create(name='Maths', tutor=self.tutor)
        self.physics = Subject.objects.create(name='Physics')
        self.alice = Student.objects.create(student_number='STU-000001', full_name='Alice Wang')
        enroll(self.alice, [self.maths])
        self.client.force_authenticate(self.tutor_user)

    def test_staff_only_reads_are_refused(self):
        for path in (
            '/api/students/',
            '/api/students/search/',
            f'/api/students/{self.alice.id}/',
            f'/api/students/{self.alice.id}/timetable/',
            '/api/enrollments/',
            '/api/enquiries/',
            '/api/invoices/',
        ):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 403)

    def test_user_directory_is_empty_for_a_tutor(self):
        # accounts.ListUsersView answers 200 with nothing rather than 403
        # (its filter falls out of can_create_role) - same outcome.
        make_user(Role.OWNER)
        resp = self.client.get('/api/users/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 0)

    def test_staff_only_writes_are_refused(self):
        for path, body in (
            ('/api/subjects/', {'name': 'History'}),
            ('/api/users/create/', {'email': 'new@lhq.test', 'full_name': 'New', 'role': 'TUTOR'}),
            ('/api/enquiries/', {}),
            ('/api/enrollments/', {}),
        ):
            with self.subTest(path=path):
                self.assertEqual(self.client.post(path, body, format='json').status_code, 403)
        self.assertEqual(
            self.client.patch(f'/api/subjects/{self.maths.id}/', {'name': 'Renamed'}, format='json').status_code, 403
        )

    def test_tutor_sees_only_their_own_subjects_and_rosters(self):
        subjects = self.client.get('/api/subjects/')
        self.assertEqual([row['name'] for row in subjects.data['results']], ['Maths'])
        self.assertEqual(self.client.get(f'/api/subjects/{self.physics.id}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/subjects/{self.physics.id}/students/').status_code, 404)

        roster = self.client.get(f'/api/subjects/{self.maths.id}/students/')
        self.assertEqual([row['full_name'] for row in roster.data], ['Alice Wang'])
