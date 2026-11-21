import { CalendarCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { clientsApi } from '../../lib/api'
import { errorText, formatDate } from '../../lib/sessions'
import { toDateOnlyString } from '../../lib/dateWindow'
import { useToast } from '../toast/useToast'
import { DatePickerField } from '../ui/DatePickerField'

/**
 * "Enrolled 5 Nov 2026" in the student header. Staff can change the date for
 * students entered after the fact; the Students tab then moves the student
 * to the right month.
 */
export function EnrolledOn({ student, onChanged }) {
  const { showToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(student.enrolled_on)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  async function save() {
    if (savingRef.current) return
    if (value > toDateOnlyString(new Date())) {
      setError('The enrolment date cannot be in the future.')
      return
    }
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const updated = await clientsApi.updateStudent(student.id, { enrolled_on: value })
      onChanged(updated)
      setEditing(false)
      showToast('Enrolment date updated')
    } catch (err) {
      setError(errorText(err, 'Could not change the enrolment date.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <span className="detail-header__parent">
        <CalendarCheck size={14} strokeWidth={1.75} aria-hidden="true" />
        Enrolled {formatDate(student.enrolled_on)}
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setValue(student.enrolled_on)
            setError(null)
            setEditing(true)
          }}
        >
          Change
        </button>
      </span>
    )
  }

  return (
    <fieldset className="enrolled-on-edit" disabled={saving}>
      <legend>Enrolment date</legend>
      <DatePickerField id="enrolled-on" value={value} onChange={setValue} />
      <button type="button" className="button button--compact" onClick={save}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className="button button--secondary button--compact" onClick={() => setEditing(false)}>
        Cancel
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}
