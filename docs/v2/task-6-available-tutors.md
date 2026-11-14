# Task 6: See available tutors

Branch: `task-6-available-tutors`. Backend and frontend. Read `docs/v2/README.md` first. Depends on Task 5.

## Why

For each subject on a tuition card, admin presses "See available tutors" and gets a ranked list of tutors who teach it and have free time that fits the student. The system only suggests. It never assigns. Suggestions are computed on demand and never stored, so they always reflect the current timetable.

## Backend (`onboarding/services.py`)

`suggest_tutors(assignment, limit=5)`:

1. **Filter by subject:** tutors with a TutorSubject for the card subject's subject, whose user is active and `TutorProfile.is_available` is true, and who pass `tutor_can_take_new_students` (Task 2).
2. **Free slots:** use `free_slots(tutor)` from Task 3 (working hours minus booked sessions).
3. **Overlap with the student:** intersect each free range with the card's `availability_days` and `time_from` to `time_to`. Keep only overlaps at least as long as the session length (default 60 minutes; accept a `session_minutes` parameter).
4. **Drop** tutors with no qualifying overlap.
5. **Rank:** first by fit = total overlapping minutes (more is better), then by load = total booked minutes per week (fewer is better), then by name for a stable order.
6. **Return** per tutor: id, name, fit minutes, booked minutes per week, and the overlapping ranges (weekday, start, end).

Also `search_tutors_for_subject(assignment, query)` for manual override: every tutor who teaches the subject, matching the name query, with their overlaps (possibly none). No fit filter.

`check_request_clash(tutor, weekday, start, end)`: wraps `find_clashes` from Task 3, for the override warning.

### API

- `GET /api/assignments/<id>/suggestions/?session_minutes=60` staff only.
- `GET /api/assignments/<id>/tutor-search/?q=` staff only.
- `GET /api/tutors/<id>/clash-check/?weekday=&start=&end=` staff only.

## Frontend

1. On the tuition card page, each subject row with status Needs tutor (and later Countered) gets a **"See available tutors"** button.
2. It opens a panel listing the top 5 candidates: name, fit (for example "3 h overlap"), current load ("12 h booked a week"), and the overlapping slots as chips ("Mon 15:00 to 17:00").
3. **Empty state:** "No tutor teaching IGCSE Physics has free time on the student's days. Search all tutors or widen the student's availability."
4. **Search all tutors** box for manual override. Picking a time that clashes shows the clash warning in plain words, with "Choose another time" and "Continue anyway".
5. Choosing a tutor and a slot here only prepares the request. Sending it is Task 7. For this task, the panel ends with a disabled "Send request" button and a note that it arrives next.
6. The list refreshes each time the panel opens. No caching.

## Out of scope

Sending requests and statuses (Task 7), bulk actions (Task 8).

## Done when

- Unit tests prove the ranking: a tutor with more overlap ranks above one with less; on equal overlap, the lighter-loaded tutor ranks first; tutors who don't teach the subject, are unavailable, or have no working hours never appear.
- Booking a session in the timetable that removes a tutor's only overlap makes them drop out of the list the next time it opens (test it).
- Weekend availability is matched correctly.
- All tests, lint and build pass.
