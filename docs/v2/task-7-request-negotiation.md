# Task 7: Request and negotiation

Branch: `task-7-request-negotiation`. Backend and frontend. Read `docs/v2/README.md` first. Depends on Task 6.

## Why

Admin sends a request for one subject to one tutor. The tutor confirms, counters with other times, or declines. A counter goes to admin, who checks it with the parent and records the answer. When everyone agrees, the session locks into the master timetable.

## State machine

| From | Action | Who | To |
|---|---|---|---|
| NEEDS_TUTOR | send request (tutor, proposed slots, note) | Admin | REQUESTED |
| REQUESTED | confirm one proposed slot | Tutor (own only) | CONFIRMED |
| REQUESTED | counter (other slots, note) | Tutor (own only) | COUNTERED |
| REQUESTED | decline (reason required) | Tutor (own only) | NEEDS_TUTOR (tutor cleared) |
| COUNTERED | take to parent | Admin | WITH_PARENT |
| COUNTERED | send a new proposal to the same tutor | Admin | REQUESTED |
| WITH_PARENT | parent accepts one counter slot (admin records) | Admin | REQUESTED with that single slot, for the tutor's final confirmation |
| WITH_PARENT | parent rejects (admin records, note) | Admin | NEEDS_TUTOR (tutor cleared) |
| REQUESTED, COUNTERED, WITH_PARENT | cancel request | Admin | NEEDS_TUTOR |
| any open status | withdraw (reason) | Admin | WITHDRAWN |
| CONFIRMED | release (reason; frees the slot) | Admin | NEEDS_TUTOR |

Any other transition is refused with 409. Every transition writes an `AssignmentEvent` (Task 5).

## Backend (onboarding)

1. **`AssignmentProposal`**: `assignment` (FK), `proposed_by` (`ADMIN` or `TUTOR`), `author` (FK User), `slots` (JSON list of `{weekday, start, end}`, 1 to 5 items, validated), `note`, `created_at`. Every send, counter and parent answer creates one. This is the negotiation history.
2. One function per transition in `onboarding/services.py`, each in a transaction with `select_for_update` on the assignment, checking the current status and the actor's permission.
3. **Confirm and lock:** creating the CONFIRMED state also creates the `TimetableSlot` (tutor, subject, weekday, start, end, assignment, mode from the card's place: AT_LHQ to IN_PERSON, ONLINE to ONLINE, EITHER to IN_PERSON unless the tutor's confirmation says online). Run `find_clashes` inside the transaction; if the slot has been taken since the request, refuse with 409 and a clear message instead of double booking.
4. **Release** deletes the linked TimetableSlot.
5. **Permissions:** tutors act only on assignments where they are the requested tutor, and only via confirm, counter, decline. Owner gets read access to everything. Admin does the rest.
6. **Notifications** (the `core.Notification` model from Task 4): tutor on a new request; admin on a counter, decline or confirm.
7. **Overdue flag:** computed `is_overdue` on an assignment when status is REQUESTED for more than 48 hours (README default). Not stored.

### API

- `POST /api/assignments/<id>/request/` `{tutor_id, slots, note, allow_clash?}`
- `POST /api/assignments/<id>/confirm/` `{slot_index, mode?}`
- `POST /api/assignments/<id>/counter/` `{slots, note}`
- `POST /api/assignments/<id>/decline/` `{reason}`
- `POST /api/assignments/<id>/to-parent/`
- `POST /api/assignments/<id>/parent-answer/` `{accepted: bool, slot_index?, note}`
- `POST /api/assignments/<id>/cancel/`, `/release/` `{reason}`
- `GET /api/assignments/<id>/` includes proposals and events in order.
- `GET /api/my/requests/` for tutors: their open requests.
- Update `BACKEND_API_BRIEF.md`.

## Frontend

1. **Admin** (tuition card page and assignment detail): the Task 6 panel's "Send request" now works (pick tutor, pick 1 to 5 slots from the overlaps or type a time, add a note). Each subject row shows status, tutor, last proposal, and the next allowed actions only. A timeline of proposals and events per assignment.
2. **Parent step:** on COUNTERED, a "Take to parent" action; on WITH_PARENT, "Parent accepted" (pick which counter slot) and "Parent declined" (note). Show the parent's name and phone so admin can call.
3. **Tutor:** a "Requests" page and a dashboard widget. Each request shows the student's first name, year, subject, paper, topics, availability window, place, notes and the proposed slots. Actions: Confirm (pick a slot), Counter (add slots and a note), Decline (reason). Never show fees or parent contact to tutors.
4. Notification count in the header links to the relevant item.

## Out of scope

Bulk actions and queue views (Task 8), email or WhatsApp alerts.

## Done when

- The full path works end to end: request, counter, to parent, parent accepts, tutor confirms, and the session appears on the master timetable linked to the assignment.
- Every disallowed transition returns 409 (test the table row by row).
- A tutor cannot act on another tutor's request (test).
- Confirming into a slot that was booked in the meantime is refused, not double booked (test).
- When every subject on a card is Confirmed or Withdrawn, the card shows Complete.
- All tests, lint and build pass.
