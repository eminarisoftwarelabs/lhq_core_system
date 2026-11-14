# Task 2: Subjects, levels, topic lists, tutor subjects, working hours

Branch: `task-2-subjects-and-tutors`. Backend and frontend. Read `docs/v2/README.md` first.

## Why

Today a `Subject` is effectively one class with one tutor (`Subject.tutor`) and one weekly slot. In v2 a Subject is a catalog entry (for example "IGCSE Physics"). Many tutors can teach it, and each student's subject is matched to a tutor separately (later tasks). Matching needs to know which tutor teaches which subject at which level, and when each tutor works.

## Backend

### academics

1. **`Level`** model: `name` (unique, e.g. "Primary (Year 6)", "Lower Secondary (Years 7 to 9)", "IGCSE", "A Level"), `order` (for sorting), `year_groups` (the `YEAR_GROUP_CHOICES` values it covers, e.g. IGCSE = 10, 11; store as a JSON list), `is_active`.
2. **`Subject`** changes:
   - Add `level` (FK to Level, nullable for now so existing rows survive), `code` (Cambridge syllabus code, blank allowed), `has_paper` (bool: true where Core and Extended apply, i.e. IGCSE Mathematics, Biology, Chemistry, Physics, Combined Science).
   - Unique together: `level`, `name`.
   - Keep `Subject.tutor` for now, but stop using it in new code. Mark it deprecated in a comment. It is removed in Task 3.
3. **`Topic`** changes: add `chapter` (CharField, blank; the group heading from the topic list), `extended_only` (bool, default false), `order` (int). Ordering becomes `chapter order, order`. Existing topics keep working.
4. **Seed command** `uv run python manage.py seed_cambridge_topics`:
   - Reads `backend/academics/data/cambridge_topics.json`. Create that file by converting Wanangwa's `topics.js` (Eddie supplies it; ask if missing): strip the `window.TOPICS =` prefix and keep the object as JSON. Shape: `{ level: { subject: { code, years, skills?, topics: [...] } } }`. A `topics` array mixes three entry kinds:
     - `{"group": "Number"}`: starts a new chapter; the plain strings after it are topics in that chapter.
     - `"Counting and sequences"`: a topic in the current chapter.
     - `{"t": "Number", "sub": [{"n": "1.17", "t": "Exponential growth and decay", "ext": true}, ...]}`: `t` is the chapter, each `sub` item is a topic with a syllabus number `n` and an optional `ext: true` meaning Extended only.
   - Add a `number` CharField (blank allowed) on Topic for the syllabus number, and map `ext` to `extended_only`.
   - Idempotent: running twice creates nothing new. Matches on (level name, subject name) and (subject, chapter, topic name).
   - Sets `has_paper` for the five IGCSE subjects listed above.
   - Never deletes existing rows. Existing subjects with no level stay as they are; the command prints them so Eddie can map each to a seeded subject or deactivate it. Do not merge or delete them automatically.
5. **Data migration**: for each existing `Subject` that has a `tutor`, create a `TutorSubject` row (below). This keeps today's tutor links.

### accounts

6. **`TutorSubject`**: `tutor` (FK TutorProfile), `subject` (FK Subject). Unique together. The level comes from the subject.
7. **`WorkingHours`**: `tutor` (FK TutorProfile), `weekday` (0 = Monday ... 6 = Sunday), `start_time`, `end_time`. Validation: start before end, weekday 0 to 6, no overlapping rows for the same tutor and weekday. A tutor can have more than one block per day (e.g. 08:00 to 12:00 and 14:00 to 17:00).
8. Business rules in `accounts/services.py` (or `academics/services.py` for subject logic). A helper `tutor_can_take_new_students(tutor)` returns true only when the tutor has at least one TutorSubject and at least one WorkingHours row. Later tasks use it.

### API

- `GET /api/levels/` list (any logged in user).
- `GET /api/subjects/?level=<id>` filter by level. Subject responses include `level`, `level_name`, `code`, `has_paper`, and `tutors` (list of `{id, name}` from TutorSubject).
- `GET /api/subjects/<id>/topics/` returns topics grouped by chapter, with `extended_only`.
- `GET/PUT /api/tutors/<id>/subjects/` read or replace a tutor's subject list (PUT takes a list of subject ids). Staff only to write; a tutor can read their own.
- `GET/PUT /api/tutors/<id>/working-hours/` read or replace a tutor's working hours (list of `{weekday, start_time, end_time}`). Staff can write any; a tutor can write their own.
- Update `fontend/BACKEND_API_BRIEF.md`.

## Frontend

1. **Subjects page:** group or filter by level. Show each subject's code, paper flag and the tutors who teach it.
2. **Subject detail:** topics grouped by chapter, extended-only topics marked with a small "Extended" badge.
3. **Tutor profile (user detail and My Profile):** two new sections.
   - "Subjects taught": multi-select of subjects grouped by level. Reuse `SubjectMultiSelect` if it fits.
   - "Working hours": rows of day, start, end, with add and remove. Show a warning when the tutor has none: "This tutor won't be suggested for new students until working hours are set."
4. Keep the existing pages working. The old single-tutor field on Subject can stay visible but read-only, labelled "Legacy tutor".

## Out of scope

Timetable changes (Task 3), any matching or suggestions, removing `Subject.tutor`.

## Done when

- `seed_cambridge_topics` loads all four levels, runs twice without duplicates, and tests prove it.
- Admin can set a tutor's subjects and working hours, and the Subjects page shows who teaches what at which level.
- Overlapping working hours for one tutor are rejected with a clear error.
- A tutor can edit their own working hours but not another tutor's (test it).
- Existing tests still pass; new tests cover models, the seed command, permissions and the new endpoints and components.
- `uv run python manage.py test`, `npm test`, `npm run lint`, `npm run build` all pass.
