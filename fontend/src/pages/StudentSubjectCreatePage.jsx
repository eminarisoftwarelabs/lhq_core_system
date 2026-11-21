import { BookOpen, CalendarClock, GraduationCap, ListChecks, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { ConflictNotice } from '../components/timetable/ConflictNotice'
import { TopicChecklist } from '../components/timetable/TopicChecklist'
import { useToast } from '../components/toast/useToast'
import { WorkingHoursEditor } from '../components/tutors/WorkingHoursEditor'
import { DatePickerField } from '../components/ui/DatePickerField'
import { academicsApi, clientsApi, studentSubjectsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { toDateOnlyString } from '../lib/dateWindow'
import { bookingConflict, MODE_LABELS, newSlotRow } from '../lib/sessions'
import { fromRows, groupByLevel } from '../lib/tutorTeaching'
import { usePageTitle } from '../lib/usePageTitle'

const SESSION_LENGTHS = [30, 45, 60, 90, 120]

function StudentPicker({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (value || query.trim().length < 2) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      clientsApi
        .searchStudents(query.trim())
        .then((res) => {
          if (!cancelled) setResults(res.results)
        })
        .catch(() => {})
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, value])

  if (value) {
    return (
      <div className="ss-card__meta">
        <span>
          <GraduationCap size={14} strokeWidth={1.75} aria-hidden="true" />
          <strong>{value.full_name}</strong> ({value.student_number})
        </span>
        <button type="button" className="button--ghost button--compact" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    )
  }
  return (
    <div className="field field--full">
      <label htmlFor="student_search">Find the student</label>
      <div className="search-field">
        <div className="search-field__control">
          <Search className="search-field__icon" size={16} strokeWidth={1.75} aria-hidden="true" />
          <input
            id="student_search"
            type="search"
            placeholder="Name or student number"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {results.length > 0 && (
        <ul className="session-list" aria-label="Matching students">
          {results.map((student) => (
            <li key={student.id}>
              <button type="button" className="session-row button--ghost" onClick={() => onChange(student)}>
                <span className="session-row__body">
                  <span className="session-row__title">{student.full_name}</span>
                  <span className="session-row__sub">{student.student_number}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Book a student into a subject: tutor (only those who teach it), planned
 * sessions, session length, mode, start date, weekly times and topics.
 * Sessions are generated from the weekly times when it is saved. A clash
 * or a time outside the tutor's working hours comes back as a warning
 * with "Book anyway".
 */
export function StudentSubjectCreatePage() {
  usePageTitle('Book a student')
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [params] = useSearchParams()
  const [student, setStudent] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [subjectId, setSubjectId] = useState('')
  const [tutorId, setTutorId] = useState('')
  const [planned, setPlanned] = useState(12)
  const [minutes, setMinutes] = useState(60)
  const [mode, setMode] = useState('IN_PERSON')
  const [startDate, setStartDate] = useState(toDateOnlyString(new Date()))
  const [slots, setSlots] = useState(() => [newSlotRow([], 60)])
  const [topics, setTopics] = useState([])
  const [topicIds, setTopicIds] = useState([])
  const [errors, setErrors] = useState(null)
  const [conflict, setConflict] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const id = params.get('student')
    if (!id) return
    clientsApi
      .getStudent(id)
      .then(setStudent)
      .catch(() => {})
  }, [params])

  useEffect(() => {
    academicsApi
      .listAllSubjects({ is_active: true, taught: true })
      .then(setSubjects)
      .catch(() => setErrors({ detail: 'Could not load the subjects.' }))
  }, [])

  // A new subject: its topics, all ticked by default.
  useEffect(() => {
    if (!subjectId) return undefined
    let cancelled = false
    academicsApi
      .listTopics(subjectId)
      .then((chapters) => {
        if (cancelled) return
        const flat = chapters.flatMap((c) => c.topics.map((t) => ({ ...t, covered_before: false })))
        setTopics(flat)
        setTopicIds(flat.map((t) => t.id))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [subjectId])

  const subject = subjects.find((s) => s.id === Number(subjectId))
  const tutors = useMemo(() => subject?.tutors ?? [], [subject])
  const groups = groupByLevel(subjects)

  function chooseSubject(value) {
    setSubjectId(value)
    setTopics([])
    setTopicIds([])
    const next = subjects.find((s) => s.id === Number(value))
    setTutorId(next?.tutors?.length === 1 ? String(next.tutors[0].id) : '')
  }

  function changeMinutes(value) {
    const next = Number(value)
    setMinutes(next)
    // Keep each slot's start, stretch its end to the new length.
    setSlots((rows) =>
      rows.map((row) => {
        const [h, m] = row.start_time.split(':').map(Number)
        const total = Math.min(h * 60 + m + next, 23 * 60 + 59)
        return { ...row, end_time: `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` }
      }),
    )
  }

  async function submit(allowClash = false) {
    setSubmitting(true)
    setErrors(null)
    try {
      const created = await studentSubjectsApi.create(
        {
          student: student.id,
          subject: Number(subjectId),
          tutor: Number(tutorId),
          planned_sessions: Number(planned),
          session_minutes: minutes,
          mode,
          start_date: startDate,
          slots: fromRows(slots),
          topic_ids: topicIds,
        },
        allowClash,
      )
      showToast(`${created.student.name} booked for ${created.subject.display_name}`)
      navigate(`/students/${created.student.id}`)
    } catch (err) {
      const found = bookingConflict(err)
      if (found) setConflict(found)
      else setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not save this booking.' })
      setSubmitting(false)
    }
  }

  const ready = student && subjectId && tutorId && planned >= 1 && startDate && slots.length > 0

  return (
    <div className="page">
      <form
        className="form-card"
        onSubmit={(e) => {
          e.preventDefault()
          setConflict(null)
          submit(false)
        }}
      >
        <NonFieldErrors errors={errors} />

        <fieldset>
          <legend>
            <span className="icon-badge">
              <GraduationCap size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Student
          </legend>
          <StudentPicker value={student} onChange={setStudent} />
          <FieldErrors errors={errors} field="student" />
        </fieldset>

        <fieldset>
          <legend>
            <span className="icon-badge">
              <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Subject and tutor
          </legend>
          <div className="form-row form-row--2col">
            <div className="field field--required">
              <label htmlFor="subject">Subject</label>
              <select id="subject" value={subjectId} onChange={(e) => chooseSubject(e.target.value)}>
                <option value="">Choose a subject</option>
                {groups.map((group) => (
                  <optgroup key={group.levelId ?? 'none'} label={group.levelName}>
                    {group.subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <FieldErrors errors={errors} field="subject" />
            </div>
            <div className="field field--required">
              <label htmlFor="tutor">Tutor</label>
              <select id="tutor" value={tutorId} disabled={!subject} onChange={(e) => setTutorId(e.target.value)}>
                <option value="">{subject ? 'Choose a tutor' : 'Choose a subject first'}</option>
                {tutors.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <FieldErrors errors={errors} field="tutor" />
            </div>
            <div className="field field--required">
              <label htmlFor="planned">Planned sessions</label>
              <input id="planned" type="number" min="1" max="1000" value={planned} onChange={(e) => setPlanned(e.target.value)} />
              <FieldErrors errors={errors} field="planned_sessions" />
            </div>
            <div className="field field--required">
              <label htmlFor="minutes">Session length</label>
              <select id="minutes" value={minutes} onChange={(e) => changeMinutes(e.target.value)}>
                {SESSION_LENGTHS.map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </div>
            <div className="field field--required">
              <label htmlFor="mode">Mode</label>
              <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                {Object.entries(MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field--required">
              <label htmlFor="start_date">Start date</label>
              <DatePickerField id="start_date" value={startDate} onChange={setStartDate} />
              <FieldErrors errors={errors} field="start_date" />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>
            <span className="icon-badge">
              <CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Weekly times
          </legend>
          <WorkingHoursEditor
            rows={slots}
            onChange={setSlots}
            idPrefix="slots"
            itemLabel="weekly time"
            addLabel="Add a weekly time"
            emptyText="Add at least one weekly time."
            makeRow={(rows) => newSlotRow(rows, minutes)}
            disabled={submitting}
          />
          <FieldErrors errors={errors} field="slots" />
        </fieldset>

        <fieldset>
          <legend>
            <span className="icon-badge">
              <ListChecks size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Topics
          </legend>
          {!subjectId && <p className="form-note">Choose a subject to see its topics.</p>}
          {subjectId && (
            <>
              <div className="topic-picker__toolbar">
                <span>
                  {topicIds.length} of {topics.length} topics ticked
                </span>
                <span>
                  <button type="button" className="button--ghost button--compact" onClick={() => setTopicIds(topics.map((t) => t.id))}>
                    Tick all
                  </button>
                  <button type="button" className="button--ghost button--compact" onClick={() => setTopicIds([])}>
                    Untick all
                  </button>
                </span>
              </div>
              <TopicChecklist topics={topics} selected={topicIds} onChange={setTopicIds} label="Student's topics" />
            </>
          )}
          <FieldErrors errors={errors} field="topic_ids" />
        </fieldset>

        {conflict && (
          <ConflictNotice conflict={conflict} busy={submitting} onCancel={() => setConflict(null)} onOverride={() => submit(true)} />
        )}

        <div className="form-actions">
          <Link className="button button--secondary" to={student ? `/students/${student.id}` : '/students'}>
            Cancel
          </Link>
          <button type="submit" disabled={!ready || submitting || Boolean(conflict)}>
            {submitting ? 'Booking…' : 'Book student'}
          </button>
        </div>
      </form>
    </div>
  )
}
