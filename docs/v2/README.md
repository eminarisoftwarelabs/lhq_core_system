# LHQ v2: build plan

This folder is the handover from design to implementation. Each `task-N-*.md` file is one pull request. Build them in order; each depends only on the tasks before it.

How to run a task: "Implement `docs/v2/task-N-<name>.md`. Follow CLAUDE.md." Branch `task-N-<name>` off `v2-develop`, PR back into `v2-develop`, then stop.

Source of truth for the design: the spec "LHQ Spec: Tutor Assignment Flow" (Claude Docs). If a brief and the code disagree, or a brief is unclear, stop and ask. Do not guess.

## Order

| # | Task | Status |
|---|---|---|
| 0 | Restyle | Done (PR #3) |
| 1 | Setup: tag, branch, staging | Tag and branch done. Staging deferred until a backend host is chosen |
| 2 | Subjects, levels, topic lists, tutor subjects, working hours | To do |
| 3 | Timetable: per-session slots, master timetable, clash detection, free slots | To do |
| 4 | Public intake link and pending cards | To do |
| 5 | Card review: approve into student, tuition card, assignments | To do |
| 6 | See available tutors | To do |
| 7 | Request and negotiation | To do |
| 8 | Admin queue and bulk assign | To do |

Later features (briefs written when Feature 1 is done): billing chain (quote, invoice, receipt, price tiers, discounts, payment plans), tuition card PDF and share, sending (email, WhatsApp), dashboard and holiday mode.

## Decisions (made by Eddie, 2026-11-14)

1. **Student availability:** days of the week plus a time window (start, end), plus a free text notes box. Auto-suggest matches on the structured fields only.
2. **Core and Extended:** one subject (for example IGCSE Mathematics) with a `paper` choice on the student's card line: Core, Extended or Not sure. Not separate subjects. Topics flagged extended-only are hidden for Core.
3. **Tutor response:** a tutor can confirm, counter, or decline. Decline needs a reason and sends the assignment back to Needs tutor.
4. **Parent agreement:** admin records the parent's answer after contacting them (call or WhatsApp). Parents do not log in or get a link.

## Defaults (change only if Eddie says so)

- **Days:** sessions can run Monday to Sunday (0 = Monday ... 6 = Sunday). The old Monday to Friday cap is removed; a tutor's working hours decide which days they teach.
- **Unanswered requests:** flagged as overdue in the queue after 48 hours. No automatic action.
- **Group sessions:** session mode records one-on-one or group, but there is no capacity limit yet.
- **Currency:** MWK everywhere.

## Model map (target after Task 8)

```
academics:   Level ─< Subject ─< Topic (chapter, extended_only, order)
accounts:    TutorProfile ─< TutorSubject >─ Subject
             TutorProfile ─< WorkingHours (weekday, start, end)
academics:   TimetableSlot (tutor, subject, assignment?, weekday, start, end, mode)
onboarding:  PendingCard (raw public submission, status)
             TuitionCard (student, status) ─< CardSubject (subject, paper, topics, availability)
             CardSubject ─ Assignment (tutor?, status) ─< AssignmentProposal
```

Note on the spec: the spec links Assignment to Enrollment. Enrollment only starts on first payment, which comes after matching, so Assignment hangs off the card subject instead. Enrollment links to the tuition card when billing is built.
