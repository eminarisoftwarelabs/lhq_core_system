import { MessageSquareText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { clientsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { NOTE_CATEGORIES, NOTE_CATEGORY_LABELS } from '../lib/constants'
import { formatShortDate } from '../lib/dateWindow'
import { FieldErrors, NonFieldErrors } from './FieldErrors'
import { useToast } from './toast/useToast'

function CategoryToggle({ value, onChange, ariaLabel, labelledBy, includeAll = false }) {
  const options = includeAll ? ['', ...NOTE_CATEGORIES] : NOTE_CATEGORIES
  return (
    <div className="period-toggle" role="group" aria-label={ariaLabel} aria-labelledby={labelledBy}>
      {options.map((option) => (
        <button
          key={option || 'all'}
          type="button"
          className={`period-toggle__option${option === value ? ' period-toggle__option--active' : ''}`}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {option ? NOTE_CATEGORY_LABELS[option] : 'All'}
        </button>
      ))}
    </div>
  )
}

function NoteForm({ studentId, subjects, preferredSubjectId, onAdded }) {
  const { showToast } = useToast()
  const preferred = subjects.find((s) => String(s.id) === String(preferredSubjectId))
  const [subjectId, setSubjectId] = useState(String((preferred ?? subjects[0]).id))
  const [category, setCategory] = useState(NOTE_CATEGORIES[0])
  const [text, setText] = useState('')
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSubmitting(true)
    try {
      const note = await clientsApi.addStudentNote(studentId, { subject: Number(subjectId), category, text })
      setText('')
      showToast('Assessment added')
      onAdded(note)
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not save this assessment.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="form note-form" onSubmit={handleSubmit}>
      <NonFieldErrors errors={errors} />

      <div className="form-row">
        <div className="field">
          <label id="note-category-label">Type</label>
          <CategoryToggle value={category} onChange={setCategory} labelledBy="note-category-label" />
          <FieldErrors errors={errors} field="category" />
        </div>

        {subjects.length > 1 && (
          <div className="field">
            <label htmlFor="note_subject">Subject</label>
            <select id="note_subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <FieldErrors errors={errors} field="subject" />
          </div>
        )}

        <div className="field field--full">
          <label htmlFor="note_text">
            {category === 'BEHAVIORAL' ? 'Behavioral comment' : 'Academic assessment'}
            {subjects.length === 1 && ` (${subjects[0].name})`}
          </label>
          <textarea id="note_text" rows={4} value={text} onChange={(e) => setText(e.target.value)} required />
          <FieldErrors errors={errors} field="text" />
          {subjects.length === 1 && <FieldErrors errors={errors} field="subject" />}
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" disabled={submitting || !text.trim()}>
          {submitting ? 'Saving…' : 'Add assessment'}
        </button>
      </div>
    </form>
  )
}

// Everything a tutor has written about this student, kept on the student
// record: anyone who can open the student sees it, only a tutor who teaches
// them can add to it (sharedSubjects is the subjects they teach the student
// in, empty for everyone else), and nothing can be edited or removed.
export function StudentNotesPanel({ studentId, sharedSubjects = [], preferredSubjectId }) {
  const [filter, setFilter] = useState('')
  const [notes, setNotes] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await clientsApi.listStudentNotes(studentId, { category: filter, page: 1 })
        if (cancelled) return
        setNotes(res.results)
        setPage(1)
        setHasMore(Boolean(res.next))
      } catch {
        if (!cancelled) setError('Could not load assessments.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [studentId, filter])

  async function loadMore() {
    setLoadingMore(true)
    setError(null)
    try {
      const res = await clientsApi.listStudentNotes(studentId, { category: filter, page: page + 1 })
      setNotes((prev) => [...prev, ...res.results])
      setPage((p) => p + 1)
      setHasMore(Boolean(res.next))
    } catch {
      setError('Could not load more assessments.')
    } finally {
      setLoadingMore(false)
    }
  }

  function handleAdded(note) {
    if (!filter || filter === note.category) setNotes((prev) => [note, ...prev])
  }

  const canAdd = sharedSubjects.length > 0

  return (
    <div className="detail-section">
      <div className="detail-section__header">
        <span className="icon-badge">
          <MessageSquareText size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        Assessments
        <div className="note-filter">
          <CategoryToggle value={filter} onChange={setFilter} ariaLabel="Filter assessments" includeAll />
        </div>
      </div>

      {canAdd ? (
        <NoteForm
          studentId={studentId}
          subjects={sharedSubjects}
          preferredSubjectId={preferredSubjectId}
          onAdded={handleAdded}
        />
      ) : (
        <p className="form-note">Tutors add assessments from their class roster.</p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p className="form-note">Loading…</p>}
      {!loading && !error && notes.length === 0 && (
        <p className="form-note">
          {filter ? `No ${NOTE_CATEGORY_LABELS[filter].toLowerCase()} assessments yet.` : 'No assessments yet.'}
        </p>
      )}

      {!loading && notes.length > 0 && (
        <ul className="note-list">
          {notes.map((note) => (
            <li key={note.id} className={`note note--${note.category.toLowerCase()}`}>
              <div className="note__meta">
                <span className={`stage-badge note-category-badge note-category-badge--${note.category.toLowerCase()}`}>
                  {NOTE_CATEGORY_LABELS[note.category]}
                </span>
                <span className="note__subject">{note.subject_name}</span>
                <span className="note__byline">
                  {note.author_name} · {formatShortDate(new Date(note.created_at))}
                </span>
              </div>
              <p className="note__text">{note.text}</p>
            </li>
          ))}
        </ul>
      )}

      {!loading && hasMore && (
        <button type="button" className="button button--secondary note-list__more" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? 'Loading…' : 'Show older assessments'}
        </button>
      )}
    </div>
  )
}
