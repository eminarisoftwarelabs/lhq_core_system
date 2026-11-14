# Task 3: Timetable, master view, clash detection, free slots

Branch: `task-3-timetable`. Backend and frontend. Read `docs/v2/README.md` first. Depends on Task 2.

## Why

The master timetable is the single source of truth for tutor availability. Tutors never keep a separate availability list. A tutor's free time = their working hours minus their booked sessions. Today `TimetableSlot` is one weekly slot per Subject (OneToOne), Monday to Friday only. In v2 a slot is one tutor's session, and a tutor can have many.

## Backend (academics)

1. **`TimetableSlot`** becomes a per-session model:
   - `tutor` (FK TutorProfile, required), `subject` (FK Subject), `weekday` (0 = Monday ... 6 = Sunday), `start_time`, `end_time`.
   - `mode`: choices `IN_PERSON`, `ONLINE`. `format`: choices `ONE_TO_ONE`, `GROUP`. Defaults `IN_PERSON`, `ONE_TO_ONE`.
   - `assignment`: nullable FK, added in Task 5 when the Assignment model exists. Do not add it now; leave a comment.
   - `student_label`: CharField, blank. Free text for sessions booked before the onboarding flow exists (e.g. existing students).
   - Recurrence: weekly, every week. No date ranges yet.
2. **Migration** from the old shape: each existing slot keeps its day and times, takes `tutor` from `Subject.tutor`. Slots whose subject has no tutor cannot be migrated: list them in the migration output and drop them (dev data only; confirm with Eddie before running against any real data). Then remove `Subject.tutor` and the OneToOne.
   - Code that still reads `Subject.tutor` must move to `TutorSubject` before the column goes. Known places: `academics/views.py` (tutor's subject queryset and detail permission), `academics/serializers.py` (`tutor_name`), `assessments/services.py` (subjects a tutor may assess), `accounts/views.py` (tutor has subjects check), `accounts/serializers.py`, and `core/management/commands/seed_dummy_data.py`. Grep for others. Existing tests for those features must keep passing with TutorSubject as the source.
3. **Validation:** start before end, weekday 0 to 6.
4. **Clash detection** in `academics/services.py`:
   - `find_clashes(tutor, weekday, start, end, exclude_slot=None)` returns the tutor's existing slots that overlap. Touching edges (one ends 16:00, next starts 16:00) are not a clash.
   - Creating or editing a slot that clashes returns HTTP 409 with the clashing slots in the body, unless the request sets `"allow_clash": true` (admin only). Admin override is allowed by design; the UI shows the warning first.
   - A slot outside the tutor's working hours is a warning, not an error (same 409 plus `allow_clash` pattern, with reason `OUTSIDE_WORKING_HOURS`).
5. **Free slots** in `academics/services.py`:
   - `free_slots(tutor)` returns, per weekday, the time ranges inside working hours not covered by booked slots. Merge adjacent ranges. Pure function over the data, no storage.
   - Unit tests cover: no sessions, sessions at the edges, back to back sessions, split working hours, a session partly outside working hours.

### API

- `GET /api/timetable/?tutor=<id>&weekday=<n>` list slots. Staff see all; a tutor sees only their own.
- `POST/PATCH/DELETE /api/timetable/<id>/` staff only. Tutors cannot change slots directly (spec rule); they get read access.
- `GET /api/tutors/<id>/free-slots/` returns the free ranges per weekday.
- Subject endpoints no longer carry `timetable_slot`. Update `fontend/BACKEND_API_BRIEF.md`.

## Frontend

1. **Master timetable** (`/timetable`, staff): a week grid Monday to Sunday with one column group or a filter per tutor. Options: filter by tutor, subject, mode. Each session shows subject, student label, time. Reuse `WeekGrid` where it fits.
2. **Tutor view** (`/timetable` as a tutor): their own sessions plus their free ranges shaded, read-only.
3. **Session dialog** (staff): pick tutor, subject (only subjects the tutor teaches, from TutorSubject), day, start, end, mode, format, student label. On a 409, show the clash in plain words, e.g. "Mr Banda already teaches IGCSE Physics on Monday 16:00 to 17:00", with "Cancel" and "Book anyway".
4. Remove or adapt the old "one slot per subject" UI (the unscheduled tray). Lesson plans stay as they are for now; if they break because they were keyed to the old slot, keep them working against Subject and note it in the PR.

## Out of scope

Linking slots to assignments, suggestions, date-specific changes (holidays, one-off moves).

## Done when

- A double booking for the same tutor is blocked with a clear message, and admin can override it.
- Free slots for any tutor are correct for the test cases above.
- A tutor sees only their own timetable and cannot edit it (test the permission).
- Weekend sessions work.
- All tests, lint and build pass.
