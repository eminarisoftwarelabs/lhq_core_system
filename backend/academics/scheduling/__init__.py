"""Timetable and session business rules (Feature 2). Views call these;
nothing here knows about HTTP.

- times: local time and interval arithmetic (pure)
- state: derived session states (unlogged, missed log, moved)
- generation: weekly slots -> dated sessions, within the plan budget
- clashes: double booking and working hours checks
- student_subjects: create and change student subjects and slots, end them
- session_log: log Held / Not held, plan topics
- changes: move and cancel, tutor requests and staff approval
- progress: sessions remaining, topics covered, expected end date
- availability: free time per day
- hours: held hours per month and the estimated amount
- reminders: end-of-day unlogged reminders
"""
