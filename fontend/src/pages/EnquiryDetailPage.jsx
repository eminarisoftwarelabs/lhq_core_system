import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SubjectMultiSelect } from '../components/SubjectMultiSelect'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { academicsApi, billingApi, enquiriesApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import {
  formatMoney,
  INVOICE_STATUS_LABELS,
  LEARNING_MODE_LABELS,
  LEARNING_MODES,
  MANUAL_STAGE_OPTIONS,
  STAGE_LABELS,
  YEAR_GROUPS,
  yearGroupLabel,
} from '../lib/constants'
import { usePageTitle } from '../lib/usePageTitle'

function EditFieldsForm({ enquiry, subjects, onSaved }) {
  const [studentName, setStudentName] = useState(enquiry.student_name)
  const [studentYearGroup, setStudentYearGroup] = useState(enquiry.student_year_group ?? '')
  const [studentSchool, setStudentSchool] = useState(enquiry.student_school ?? '')
  const [studentPhone, setStudentPhone] = useState(enquiry.student_phone ?? '')
  const [studentEmail, setStudentEmail] = useState(enquiry.student_email ?? '')
  const [studentGrade, setStudentGrade] = useState(enquiry.student_grade ?? '')
  const [subjectIds, setSubjectIds] = useState(enquiry.interested_subjects.map((s) => s.id))
  const [durationWeeks, setDurationWeeks] = useState(enquiry.duration_weeks ?? '')
  const [learningMode, setLearningMode] = useState(enquiry.learning_mode ?? '')
  const [desiredStartDate, setDesiredStartDate] = useState(enquiry.desired_start_date ?? '')
  const [notes, setNotes] = useState(enquiry.notes)
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [savedMessage, setSavedMessage] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSavedMessage(null)
    setSubmitting(true)

    try {
      const updated = await enquiriesApi.update(enquiry.id, {
        student_name: studentName,
        student_year_group: studentYearGroup ? Number(studentYearGroup) : null,
        student_school: studentSchool,
        student_phone: studentPhone,
        student_email: studentEmail,
        student_grade: studentGrade,
        interested_subjects: subjectIds,
        duration_weeks: durationWeeks ? Number(durationWeeks) : null,
        learning_mode: learningMode || null,
        desired_start_date: desiredStartDate || null,
        notes,
      })
      setSavedMessage('Saved.')
      onSaved(updated)
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not save changes.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <NonFieldErrors errors={errors} />
      {savedMessage && <p className="form-success">{savedMessage}</p>}

      <label htmlFor="student_name">Student name</label>
      <input id="student_name" type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
      <FieldErrors errors={errors} field="student_name" />

      <label htmlFor="student_year_group">Year / class</label>
      <select
        id="student_year_group"
        value={studentYearGroup}
        onChange={(e) => setStudentYearGroup(e.target.value)}
      >
        <option value="">Select year</option>
        {YEAR_GROUPS.map((year) => (
          <option key={year} value={year}>
            {yearGroupLabel(year)}
          </option>
        ))}
      </select>
      <FieldErrors errors={errors} field="student_year_group" />

      <label htmlFor="student_school">School</label>
      <input id="student_school" type="text" value={studentSchool} onChange={(e) => setStudentSchool(e.target.value)} />
      <FieldErrors errors={errors} field="student_school" />

      <label htmlFor="student_phone">Student phone</label>
      <input id="student_phone" type="text" value={studentPhone} onChange={(e) => setStudentPhone(e.target.value)} />
      <FieldErrors errors={errors} field="student_phone" />

      <label htmlFor="student_email">Student email</label>
      <input id="student_email" type="email" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} />
      <FieldErrors errors={errors} field="student_email" />

      <label htmlFor="student_grade">Student grade</label>
      <input
        id="student_grade"
        type="text"
        value={studentGrade}
        onChange={(e) => setStudentGrade(e.target.value)}
      />
      <FieldErrors errors={errors} field="student_grade" />

      <SubjectMultiSelect subjects={subjects} selectedIds={subjectIds} onChange={setSubjectIds} idPrefix="edit_subjects" />
      <FieldErrors errors={errors} field="interested_subjects" />

      <label htmlFor="duration_weeks">Duration (weeks)</label>
      <input
        id="duration_weeks"
        type="number"
        min="1"
        value={durationWeeks}
        onChange={(e) => setDurationWeeks(e.target.value)}
      />
      <FieldErrors errors={errors} field="duration_weeks" />

      <label htmlFor="learning_mode">Learning mode</label>
      <select id="learning_mode" value={learningMode} onChange={(e) => setLearningMode(e.target.value)}>
        <option value="">—</option>
        {LEARNING_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {LEARNING_MODE_LABELS[mode]}
          </option>
        ))}
      </select>
      <FieldErrors errors={errors} field="learning_mode" />

      <label htmlFor="desired_start_date">Desired start date</label>
      <input
        id="desired_start_date"
        type="date"
        value={desiredStartDate}
        onChange={(e) => setDesiredStartDate(e.target.value)}
      />
      <FieldErrors errors={errors} field="desired_start_date" />

      <label htmlFor="notes">Notes</label>
      <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      <FieldErrors errors={errors} field="notes" />

      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}

function StageChangeForm({ enquiry, onChanged }) {
  const options = MANUAL_STAGE_OPTIONS.filter((s) => s !== enquiry.stage)
  const [newStage, setNewStage] = useState(options[0] || '')
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (enquiry.stage === 'ENROLLED') {
    return <p className="form-note">This enquiry is enrolled - its stage no longer changes manually.</p>
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const updated = await enquiriesApi.changeStage(enquiry.id, newStage, note)
      setNote('')
      onChanged(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the stage.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <label htmlFor="new_stage">Move to stage</label>
      <select id="new_stage" value={newStage} onChange={(e) => setNewStage(e.target.value)}>
        {options.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>

      <label htmlFor="stage_note">Note (optional)</label>
      <input id="stage_note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />

      <button type="submit" disabled={submitting || !newStage}>
        {submitting ? 'Updating…' : 'Update stage'}
      </button>
    </form>
  )
}

function InvoicingPanel({ enquiry, invoices, onInvoiceGenerated }) {
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleGenerate() {
    setError(null)
    setSubmitting(true)
    try {
      const invoice = await enquiriesApi.generateInvoice(enquiry.id)
      onInvoiceGenerated(invoice)
    } catch (err) {
      setError(err instanceof ApiError && err.data ? JSON.stringify(err.data) : 'Could not generate the invoice.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section>
      <h2>Invoicing</h2>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {invoices.length === 0 && enquiry.stage !== 'ENROLLED' && (
        <button type="button" onClick={handleGenerate} disabled={submitting}>
          {submitting ? 'Generating…' : 'Generate invoice'}
        </button>
      )}
      {invoices.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Total</th>
              <th>Balance due</th>
              <th>Status</th>
              <th>Due date</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{formatMoney(invoice.total)}</td>
                <td>{formatMoney(invoice.balance_due)}</td>
                <td>{INVOICE_STATUS_LABELS[invoice.status]}</td>
                <td>{invoice.due_date}</td>
                <td>
                  <Link to={`/invoices/${invoice.id}`}>View / record payment</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function EnquiryDetailPage() {
  const { id } = useParams()
  const [enquiry, setEnquiry] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [invoices, setInvoices] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(enquiry?.student_name)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [enquiryRes, subjectsRes, invoicesRes] = await Promise.all([
        enquiriesApi.get(id),
        academicsApi.listSubjects({ is_active: true }),
        billingApi.listInvoices({ enquiry: id }),
      ])
      setEnquiry(enquiryRes)
      setSubjects(subjectsRes.results)
      setInvoices(invoicesRes.results)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'not_found' : 'load_failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // loadAll is also called after actions (stage change, invoice
    // generation) to refresh derived data, so it stays a shared function
    // rather than an effect-local closure.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return <div className="page">Loading…</div>
  if (error === 'not_found') return <div className="page">Enquiry not found.</div>
  if (error) return <div className="page">Could not load this enquiry.</div>

  return (
    <div className="page">
      <p>
        <span>{STAGE_LABELS[enquiry.stage]}</span> · Parent: {enquiry.parent.full_name} · {enquiry.parent.phone}
        {enquiry.parent.email && ` · ${enquiry.parent.email}`}
      </p>

      {enquiry.enrollment && (
        <p className="form-success">
          Enrolled. <Link to={`/students`}>Find their student record</Link>
        </p>
      )}

      <StageChangeForm enquiry={enquiry} onChanged={setEnquiry} />

      <h2>Details</h2>
      <EditFieldsForm enquiry={enquiry} subjects={subjects} onSaved={setEnquiry} />

      <InvoicingPanel
        enquiry={enquiry}
        invoices={invoices}
        // generate-invoice also moves the enquiry to INVOICED server-side,
        // so a full reload (not just appending the new invoice locally)
        // is needed to pick up the updated stage and stage_history too.
        onInvoiceGenerated={() => loadAll()}
      />

      <h2>Stage history</h2>
      <ul>
        {enquiry.stage_history.map((change) => (
          <li key={change.id}>
            {change.from_stage ? `${STAGE_LABELS[change.from_stage]} → ` : ''}
            {STAGE_LABELS[change.to_stage]} by {change.changed_by_name || 'system'} on{' '}
            {new Date(change.changed_at).toLocaleString()}
            {change.note && ` — "${change.note}"`}
          </li>
        ))}
      </ul>
    </div>
  )
}
