# Task 8: Admin queue and bulk assign

Branch: `task-8-admin-queue`. Backend and frontend. Read `docs/v2/README.md` first. Depends on Task 7.

## Why

Onboarding 50 students with 5 subjects each means 250 open assignments. Admin needs focused, filtered views across all cards, not one long list, and a way to send many requests in one action.

## Backend

1. `GET /api/assignments/` staff and owner (owner read-only), with:
   - `view`: `needs_tutor`, `waiting_on_tutor` (REQUESTED), `countered`, `with_parent`, `recently_confirmed` (CONFIRMED in the last 14 days), `overdue` (REQUESTED over 48 hours).
   - Filters: `subject`, `level`, `tutor`, `older_than_hours`, `q` (student name).
   - Sort: oldest first by default (time in current status), or by student.
   - Pagination (50 per page). Avoid N+1 queries: use `select_related` and `prefetch_related`, and add a test that asserts the query count stays flat as rows grow.
   - Each row: assignment id, student, year, subject, paper, status, tutor, time in status, is_overdue, card id.
2. `GET /api/assignments/counts/` returns the count per view, for tab badges.
3. **Bulk request** `POST /api/assignments/bulk-request/` `{items: [{assignment_id, tutor_id, slots, note}]}`, staff only:
   - Each item goes through the same service function as a single request (Task 7). No duplicated rules.
   - Partial success is allowed: return per item `ok` or the error (wrong status, clash, permission). Each item is its own transaction.
   - Cap at 50 items per call.

## Frontend

1. **Queue page** (`/onboarding/queue`, under the Onboarding nav item): tabs for the six views with count badges, filters for subject, level, tutor and age, a student search box, and the table above. Overdue rows are marked.
2. Row click opens the assignment detail (from Task 7).
3. **Bulk assign:** select rows in Needs tutor (checkboxes), then "Assign selected". For each selected row the dialog shows the top suggestion from Task 6 preselected (tutor and first overlapping slot), editable per row. Submit sends one bulk request and shows per row results, keeping failed rows selected.
4. Filters and the current tab are kept in the URL query string, so a view can be bookmarked or shared.
5. Owner sees the queue without action buttons.

## Out of scope

Billing, PDFs, sending, dashboard widgets beyond the counts.

## Done when

- With 250 seeded open assignments (add a management command `seed_onboarding_demo` that creates realistic demo cards, tutors, working hours and sessions, for local testing only), each view loads in one request per page and the query count test passes.
- Bulk assign of 20 rows works, with clear per row results when some fail.
- Owner can view but not act (test).
- All tests, lint and build pass.
