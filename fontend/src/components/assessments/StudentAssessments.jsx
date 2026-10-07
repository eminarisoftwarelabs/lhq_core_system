import { NotebookPen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { assessmentsApi } from '../../lib/api'
import { ApiError } from '../../lib/apiClient'
import { ASSESSMENT_CATEGORIES, ASSESSMENT_CATEGORY_LABELS } from '../../lib/constants'
import { formatDateTime, formatShortDate } from '../../lib/dateWindow'
import { initials } from '../../lib/initials'
import { FieldErrors, NonFieldErrors } from '../FieldErrors'
import { useToast } from '../toast/useToast'

const FILTERS = ['ALL', ...ASSESSMENT_CATEGORIES]

function AssessmentForm({ studentId, studentName, subject, onCreated }) {
  const { showToast } = useToast()
  const [category, setCategory] = useState(ASSESSMENT_CATEGORIES[0])
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSubmitting(true)
    try {
      const created = await assessmentsApi.create(studentId, { subject: subject.id, category, comment })
      setComment('')
      showToast('Assessment added')
      onCreated(created)
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not save this assessment.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="assessment-form" onSubmit={handleSubmit}>
      <NonFieldErrors errors={errors} />

      <div className="assessment-form__top">
        <div className="period-toggle" role="radiogroup" aria-label="Assessment type">
          {ASSESSMENT_CATEGORIES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === category}
              className={`period-toggle__option${value === category ? ' period-toggle__option--active' : ''}`}
              onClick={() => setCategory(value)}
            >
              {ASSESSMENT_CATEGORY_LABELS[value]}
            </button>
          ))}
        </div>
        <span className="assessment-form__context">{subject.name}</span>
      </div>
      <FieldErrors errors={errors} field="category" />
      <FieldErrors errors={errors} field="subject" />

      <div className="field">
        <label htmlFor="assessment_comment" className="visually-hidden">
          Comment on {studentName}
        </label>
        <textarea
          id="assessment_comment"
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            category === 'ACADEMIC'
              ? `How is ${studentName} getting on with the work?`
              : `How is ${studentName} behaving in class?`
          }
          required
        />
        <FieldErrors errors={errors} field="comment" />
      </div>

      <div className="assessment-form__actions">
        <span className="assessment-form__hint">Stays on the student's record. It can't be edited or removed.</span>
        <button type="submit" disabled={submitting || !comment.trim()}>
          {submitting ? 'Saving…' : 'Add assessment'}
        </button>
      </div>
    </form>
  )
}

// A student's assessment record. Read-only unless `composeSubject` is
// given - the subject the viewer teaches this student in (see
// canAssessSubject) - in which case the add form sits above the list.
export function StudentAssessments({ studentId, studentName, composeSubject = null }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    let cancelled = false

    assessmentsApi
      .listForStudent(studentId)
      .then((res) => {
        if (!cancelled) setItems(res)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [studentId])

  const visible = filter === 'ALL' ? items : items.filter((item) => item.category === filter)

  return (
    <div className="detail-section">
      <div className="detail-section__header">
        <span className="icon-badge">
          <NotebookPen size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        Assessments
        {!loading && !failed && <span className="onboarding-section__count">{items.length}</span>}
        {items.length > 0 && (
          <div className="period-toggle assessment-filter" role="group" aria-label="Filter assessments">
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                className={`period-toggle__option${value === filter ? ' period-toggle__option--active' : ''}`}
                aria-pressed={value === filter}
                onClick={() => setFilter(value)}
              >
                {value === 'ALL' ? 'All' : ASSESSMENT_CATEGORY_LABELS[value]}
              </button>
            ))}
          </div>
        )}
      </div>

      {composeSubject && (
        <AssessmentForm
          studentId={studentId}
          studentName={studentName}
          subject={composeSubject}
          onCreated={(created) => setItems((prev) => [created, ...prev])}
        />
      )}

      {loading && <p className="form-note">Loading…</p>}
      {failed && (
        <p className="form-error" role="alert">
          Could not load assessments.
        </p>
      )}

      {!loading && !failed && items.length === 0 && (
        <div className="empty-state empty-state--compact">
          <span className="empty-state__icon">
            <NotebookPen size={22} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <p>No assessments yet.</p>
        </div>
      )}

      {!loading && !failed && items.length > 0 && visible.length === 0 && (
        <p className="form-note">No {ASSESSMENT_CATEGORY_LABELS[filter].toLowerCase()} assessments yet.</p>
      )}

      {visible.length > 0 && (
        <ul className="assessment-list">
          {visible.map((item) => {
            const createdAt = new Date(item.created_at)
            return (
              <li key={item.id} className="assessment-item">
                <span className="avatar-badge avatar-badge--sm" aria-hidden="true">
                  {initials(item.author_name)}
                </span>
                <div className="assessment-item__body">
                  <div className="assessment-item__meta">
                    <span className="assessment-item__author">{item.author_name}</span>
                    <span className="assessment-item__context">{item.subject_name}</span>
                    <span className={`assessment-badge assessment-badge--${item.category.toLowerCase()}`}>
                      {ASSESSMENT_CATEGORY_LABELS[item.category]}
                    </span>
                    <time
                      className="assessment-item__date"
                      dateTime={item.created_at}
                      title={formatDateTime(createdAt)}
                    >
                      {formatShortDate(createdAt)}
                    </time>
                  </div>
                  <p className="assessment-item__comment">{item.comment}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
