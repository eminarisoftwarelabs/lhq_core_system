import { BookOpen, CalendarClock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { useToast } from '../components/toast/useToast'
import { academicsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { usePageTitle } from '../lib/usePageTitle'

export function SubjectCreatePage() {
  usePageTitle('Add subject')
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [levels, setLevels] = useState([])
  const [name, setName] = useState('')
  const [level, setLevel] = useState('')
  const [code, setCode] = useState('')
  const [hasPaper, setHasPaper] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    academicsApi
      .listLevels()
      .then((list) => {
        if (!cancelled) setLevels(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSubmitting(true)

    const payload = { name, level: level ? Number(level) : null, code, has_paper: hasPaper, is_active: isActive }

    try {
      const created = await academicsApi.createSubject(payload)
      showToast('Subject created')
      navigate(`/subjects/${created.id}`, { replace: true })
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not create the subject.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="form-card">
        <form className="form" onSubmit={handleSubmit}>
          <NonFieldErrors errors={errors} />

          <fieldset>
            <legend>
              <span className="icon-badge">
                <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              Subject details
            </legend>
            <div className="form-row">
              <div className="field field--required">
                <label htmlFor="level">Level</label>
                <select id="level" value={level} onChange={(e) => setLevel(e.target.value)} required>
                  <option value="">Choose a level</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <FieldErrors errors={errors} field="level" />
              </div>

              <div className="field field--required">
                <label htmlFor="name">Name</label>
                <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                <FieldErrors errors={errors} field="name" />
              </div>

              <div className="field">
                <label htmlFor="code">Syllabus code</label>
                <input id="code" type="text" value={code} onChange={(e) => setCode(e.target.value)} />
                <FieldErrors errors={errors} field="code" />
              </div>
            </div>

            <label htmlFor="has_paper" className="checkbox-label">
              <input
                id="has_paper"
                type="checkbox"
                checked={hasPaper}
                onChange={(e) => setHasPaper(e.target.checked)}
              />
              Core and Extended papers
            </label>

            <label htmlFor="is_active" className="checkbox-label">
              <input
                id="is_active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active (offered to onboarding)
            </label>
          </fieldset>

          <p className="form-note form-note--icon">
            <CalendarClock size={14} strokeWidth={1.75} aria-hidden="true" />
            Tutors pick the subjects they teach on their profile. Students are booked into a subject, with their weekly times, from the timetable or their student page.
          </p>

          <div className="form-actions">
            <Link className="button button--secondary" to="/subjects">
              Cancel
            </Link>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create subject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
