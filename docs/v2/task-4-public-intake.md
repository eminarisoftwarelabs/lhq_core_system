# Task 4: Public intake link and pending cards

Branch: `task-4-public-intake`. Backend and frontend. Read `docs/v2/README.md` first. Depends on Task 2.

## Why

Parents and students fill in their tuition request through one public link, with no login. It replaces the Google Form and the checklist page in Wanangwa's tool. The link is a door that only lets a card in: it can submit, never read.

## Reference

Wanangwa's `checklist.html` (Eddie supplies it; ask if missing) is the design reference for the fields and the mobile flow. Match its steps and wording where they make sense. Do not copy its storage or WhatsApp link logic.

## Backend: new app `onboarding`

1. **`PendingCard`**:
   - `payload` (JSONField): the whole submission as sent, after validation.
   - `status`: `PENDING`, `APPROVED`, `REJECTED`. Default `PENDING`.
   - `submitted_at`, `reviewed_at`, `reviewed_by` (FK User, null), `reject_reason` (blank).
   - `source_ip_hash` (CharField): a salted hash of the IP, for rate limiting and abuse review. Never store the raw IP.
2. **Payload shape** (validate every field strictly: types, lengths, allowed values):
   - Student: `full_name` (required, max 120), `year_group` (from `YEAR_GROUP_CHOICES`), `school` (max 150), `phone`, `email` (optional).
   - Parent: `full_name` (required), `phone` (required), `email` (optional), `relationship` (Guardianship choices).
   - `exam_series` (optional, short text, e.g. "May/June 2027").
   - `subjects`: 1 to 10 items. Each: `subject_id` (must exist, be active, and belong to a level covering the year group), `paper` (`CORE`, `EXTENDED`, `NOT_SURE`; only when the subject `has_paper`), `cover` (`SELECTED`, `FULL`, `UNSURE`), `topic_ids` (must belong to that subject; required when cover is `SELECTED`; extended-only topics rejected when paper is `CORE`), `latest_grade` (A*, A to G, U, or blank).
   - Availability (decision 1): `days` (list of weekday numbers 0 to 6, at least one), `time_from`, `time_to` (from before to), `place` (`AT_LHQ`, `ONLINE`, `EITHER`), `notes` (max 1000).
3. **Endpoint** `POST /api/public/cards/`:
   - No authentication. Separate permission class that allows only POST on this view. No GET, no list, no detail on any public route.
   - Response is always `201 {"status": "received"}` for any valid submission, whatever it contains. Never reveal whether a student or parent already exists. Validation errors return 400 with field errors.
   - **Rate limit:** DRF throttling scoped to this view, 5 submissions per hour per IP hash. Return 429 when exceeded.
   - **Bot check:** a honeypot field (`website`) that must be empty, plus a minimum fill time (`started_at` timestamp from the page; reject if under 5 seconds). Rejected bots get the same 201 response but nothing is saved (log it).
   - Payload size cap (e.g. 20 KB).
4. **Public reference data** `GET /api/public/catalog/`: levels, active subjects per level (id, name, has_paper), and topics per subject (id, chapter, name, number, extended_only). No tutors, students, prices or anything else. Cache it.
5. **Admin alert:** on each saved submission, create an in-app notification for staff (simple `Notification` model in `core`: recipient, message, link, read_at) and show the count in the header. Email or WhatsApp alerts come later.
6. **Staff API** `GET /api/pending-cards/?status=PENDING` and `GET /api/pending-cards/<id>/` for Task 5. Staff only.

## Frontend

1. **Public route** `/apply` (no login, no sidebar, LHQ branding, mobile first). Steps like the checklist: student, parent, subjects (filtered to the chosen year's level), paper and topics per subject (topics grouped by chapter; hide extended-only when paper is Core; "whole course" and "not sure" options), latest grade, days, time window, place, notes, review, submit.
2. Keep a draft in `localStorage` (wrapped in try/catch) so a refresh doesn't lose answers. Clear it after submit.
3. Confirmation screen: "Thank you. LHQ will contact you shortly." Same message for every submission.
4. **Staff:** a "Pending cards" list page (read-only in this task) showing student, year, subjects count, submitted time. Nav item under Onboarding.

## Security checklist (test each)

- Public endpoints accept only the documented methods. GET on `/api/public/cards/` is 405.
- No public endpoint returns any student, parent, tutor, timetable or billing data.
- Unknown subject or topic ids, wrong-level subjects, extended topics with Core, oversize payloads, and too many subjects are rejected.
- Rate limit returns 429 after 5 posts in an hour from the same IP.
- Honeypot and too-fast submissions are silently dropped.
- Responses are identical whether or not the student already exists.

## Out of scope

Approving cards (Task 5), sending email or WhatsApp.

## Done when

A parent can fill the form on a phone, submit, and the card appears in the staff Pending cards list, with all security tests passing. All tests, lint and build pass.
