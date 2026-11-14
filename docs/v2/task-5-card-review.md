# Task 5: Card review: approve into student, tuition card and assignments

Branch: `task-5-card-review`. Backend and frontend. Read `docs/v2/README.md` first. Depends on Tasks 3 and 4.

## Why

Public submissions never touch live records directly. Admin checks each pending card and approves it. Only then does it become a real student with a tuition card, and each subject on the card becomes its own assignment waiting for a tutor.

## Backend (onboarding)

1. **`TuitionCard`**: `student` (FK clients.Student), `number` (unique, series `TC-0001`, generated in the database safely so two admins can't get the same number), `exam_series`, `availability_days` (JSON list of 0 to 6), `time_from`, `time_to`, `place` (`AT_LHQ`, `ONLINE`, `EITHER`), `notes`, `pending_card` (OneToOne, null), `enquiry` (FK enquiries.Enquiry, null), `created_at`, `created_by`.
   - Computed `onboarding_status`: `IN_PROGRESS` while any assignment is open, `COMPLETE` when every assignment is Confirmed or Withdrawn.
2. **`CardSubject`**: `card` (FK), `subject` (FK), `paper` (`CORE`, `EXTENDED`, `NOT_SURE`, blank), `cover` (`SELECTED`, `FULL`, `UNSURE`), `topics` (M2M Topic), `latest_grade`. Unique together card + subject.
3. **`Assignment`**: `card_subject` (OneToOne), `tutor` (FK TutorProfile, null), `status`, `requested_at`, `responded_at`, `confirmed_at`, `withdrawn_reason`, `updated_at`.
   - Status choices: `NEEDS_TUTOR`, `REQUESTED`, `COUNTERED`, `WITH_PARENT`, `CONFIRMED`, `WITHDRAWN`. Default `NEEDS_TUTOR`.
   - Status changes only through functions in `onboarding/services.py` (Task 7 adds most of them). Write an `AssignmentEvent` row for every change: assignment, from status, to status, actor, note, created_at. This is the history.
   - This task only needs: create (NEEDS_TUTOR) and `withdraw(assignment, reason, actor)`.
4. **Approve** `POST /api/pending-cards/<id>/approve/` (staff), in one database transaction:
   - Body lets admin edit any field first, and choose: link to an existing Student and Parent (by id) or create new ones. Admin may also link an existing Enquiry.
   - Re-validate everything (same rules as Task 4).
   - Creates or links Parent, Student, Guardianship; creates TuitionCard, CardSubjects, and one Assignment per subject in `NEEDS_TUTOR`.
   - Marks the PendingCard `APPROVED` with reviewer and time. Approving twice is refused (409).
5. **Reject** `POST /api/pending-cards/<id>/reject/` with a reason. Nothing else is created.
6. **Duplicate hint:** the pending card detail for staff includes possible matches (students with a similar name and same year, parents with the same phone). Staff only; never on public routes.
7. **API:** `GET /api/tuition-cards/`, `GET /api/tuition-cards/<id>/` (card, subjects, topics, assignments with status and tutor). `POST /api/assignments/<id>/withdraw/`. Update `BACKEND_API_BRIEF.md`.
8. Add the nullable `assignment` FK to `TimetableSlot` now (Task 3 left it out).

## Frontend

1. **Pending card review** page: the submission laid out readably, editable fields, possible duplicates with "Use this student" buttons, and Approve and Reject (reject asks for a reason).
2. **Tuition card** page: student, availability, place, notes, and a row per subject showing paper, topics (collapsed list), grade, assignment status as a badge, and tutor once assigned. A "Withdraw" action per subject with a reason.
3. **Student detail:** a "Tuition cards" section linking to the cards.
4. Status badges use theme tokens, one style per status, readable in light and dark.

## Out of scope

Choosing tutors (Tasks 6 and 7), PDFs, billing.

## Done when

- Approving a pending card with 5 subjects creates the student (or links the chosen one), one tuition card, 5 card subjects and 5 assignments in Needs tutor, in one transaction (test that a failure mid-way creates nothing).
- Rejecting creates nothing. Approving twice is refused.
- Card numbers are unique under concurrent approval (test).
- All tests, lint and build pass.
