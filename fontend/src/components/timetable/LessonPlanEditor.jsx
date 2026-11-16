import { BookOpen, Check, Loader2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { academicsApi, lessonPlansApi } from '../../lib/api'
import { ApiError } from '../../lib/apiClient'
import { addWeeks, dateInWeek, formatDayMonth, relativeWeekLabel } from '../../lib/weeks'
import { WEEKDAYS } from '../../lib/timetableGrid'

const WEEKS_PER_PAGE = 6

function errorText(err, fallback) {
  if (err instanceof ApiError) {
    const data = err.data || {}
    const first = data.detail ?? data.name ?? data.topic ?? data.week_start
    if (first) return [].concat(first).join(' ')
  }
  return fallback
}

function topicOptionLabel(topic) {
  const number = topic.number ? `${topic.number} ` : ''
  return `${number}${topic.name}${topic.extended_only ? ' (Extended)' : ''}`
}

/**
 * A subject's lesson plan, one row per week starting at `fromWeek`: pick
 * the topic each week's session will cover, from the subject's official
 * syllabus grouped by chapter. Every change saves straight away (there's
 * nothing else to confirm).
 */
export function LessonPlanEditor({ subject, day, fromWeek, today, onPlanChanged }) {
  const idBase = useId()
  const [weekCount, setWeekCount] = useState(WEEKS_PER_PAGE)
  const [plans, setPlans] = useState({})
  const [loadedTo, setLoadedTo] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [status, setStatus] = useState({})
  const [chapters, setChapters] = useState([])
  const weeks = Array.from({ length: weekCount }, (_, i) => addWeeks(fromWeek, i))
  const lastWeek = weeks[weeks.length - 1]

  useEffect(() => {
    let cancelled = false
    academicsApi
      .listTopics(subject.id)
      .then((res) => {
        if (!cancelled) setChapters(res)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorText(err, 'Could not load the topics.'))
      })
    return () => {
      cancelled = true
    }
  }, [subject.id])

  useEffect(() => {
    let cancelled = false
    // Only fetch the weeks not loaded yet, so "Show more weeks" adds to
    // what's on screen instead of re-requesting it.
    const start = loadedTo ? addWeeks(loadedTo, 1) : fromWeek
    if (loadedTo && start > lastWeek) return undefined
    lessonPlansApi
      .list(start, lastWeek)
      .then((results) => {
        if (cancelled) return
        const mine = results.filter((p) => p.subject === subject.id)
        setPlans((current) => ({ ...current, ...Object.fromEntries(mine.map((p) => [p.week_start, p])) }))
        setLoadedTo(lastWeek)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorText(err, 'Could not load the lesson plan.'))
      })
    return () => {
      cancelled = true
    }
  }, [fromWeek, lastWeek, loadedTo, subject.id])

  async function savePlan(week, topicId) {
    setStatus((s) => ({ ...s, [week]: { state: 'saving' } }))
    try {
      const saved = await lessonPlansApi.set(subject.id, week, topicId)
      setPlans((current) => {
        const next = { ...current }
        if (saved) next[week] = saved
        else delete next[week]
        return next
      })
      setStatus((s) => ({ ...s, [week]: { state: 'saved' } }))
      onPlanChanged(subject.id, week, saved)
    } catch (err) {
      setStatus((s) => ({ ...s, [week]: { state: 'error', message: errorText(err, 'Could not save.') } }))
    }
  }

  return (
    <section className="lesson-plan" aria-labelledby={`${idBase}-title`}>
      <div className="lesson-plan__header">
        <span className="icon-badge">
          <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <h3 id={`${idBase}-title`}>Lesson plan</h3>
          <p>Pick what each week&apos;s lesson will cover. Changes save straight away.</p>
        </div>
      </div>

      {loadError && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}

      <ol className="lesson-plan__weeks">
        {weeks.map((week) => {
          const plan = plans[week]
          const rowStatus = status[week]
          const lessonDate = dateInWeek(week, day)
          const relative = relativeWeekLabel(week, today)
          const selectId = `${idBase}-${week}`
          const loading = !loadedTo || week > loadedTo
          return (
            <li key={week} className={`lesson-plan__week${plan ? ' lesson-plan__week--planned' : ''}`}>
              <label htmlFor={selectId} className="lesson-plan__when">
                <span className="lesson-plan__date">
                  {WEEKDAYS[day].short} {formatDayMonth(lessonDate)}
                </span>
                {relative && <span className="lesson-plan__relative">{relative}</span>}
              </label>

              <select
                id={selectId}
                value={plan?.topic ?? ''}
                disabled={loading || rowStatus?.state === 'saving'}
                onChange={(e) => savePlan(week, e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">{loading ? 'Loading…' : 'Not planned yet'}</option>
                {chapters.map((chapter, i) => (
                  <optgroup key={`${chapter.chapter}-${i}`} label={chapter.chapter || 'General'}>
                    {chapter.topics.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topicOptionLabel(topic)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <span className="lesson-plan__status" aria-live="polite">
                {rowStatus?.state === 'saving' && (
                  <Loader2 size={14} strokeWidth={2} className="lesson-plan__spinner" aria-label="Saving" />
                )}
                {rowStatus?.state === 'saved' && <Check size={14} strokeWidth={2.25} aria-label="Saved" />}
              </span>
              {rowStatus?.state === 'error' && (
                <p className="field-error lesson-plan__error" role="alert">
                  {rowStatus.message}
                </p>
              )}
            </li>
          )
        })}
      </ol>

      <button
        type="button"
        className="button--ghost lesson-plan__more"
        onClick={() => setWeekCount((n) => n + WEEKS_PER_PAGE)}
      >
        Show {WEEKS_PER_PAGE} more weeks
      </button>
    </section>
  )
}
