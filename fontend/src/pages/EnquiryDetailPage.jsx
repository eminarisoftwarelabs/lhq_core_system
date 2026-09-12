import {
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  GraduationCap,
  History,
  Pencil,
  Phone,
  Receipt,
  StickyNote,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SubjectMultiSelect } from '../components/SubjectMultiSelect'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { RecordPaymentForm } from '../components/RecordPaymentForm'
import { useToast } from '../components/toast/useToast'
import { DatePickerField } from '../components/ui/DatePickerField'
import { DateTimePickerField } from '../components/ui/DateTimePickerField'
import { academicsApi, billingApi, enquiriesApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import {
  formatMoney,
  INVOICE_STATUS_LABELS,
  LEARNING_MODE_LABELS,
  LEARNING_MODES,
  STAGE_LABELS,
  YEAR_GROUPS,
  yearGroupLabel,
} from '../lib/constants'
import { formatShortDate, fromDatetimeLocalValue, parseDateOnly, toDatetimeLocalValue } from '../lib/dateWindow'
import { getNextAction } from '../lib/onboardingNextAction'
import { usePageTitle } from '../lib/usePageTitle'

const STAGE_ICONS = { INITIAL_CALL: Phone, MEETING_SET: CalendarCheck, INVOICED: Receipt }

// The single most useful thing to do next, surfaced above everything else -
// what to record/click depends entirely on the current stage, so this isn't
// a form the way the sections below it are.
function NextActionPanel({
  enquiry,
  invoice,
  onSaved,
  onGenerateInvoice,
  generating,
  generateError,
  onPaymentRecorded,
}) {
  if (enquiry.stage === 'ENROLLED') return null
  const Icon = STAGE_ICONS[enquiry.stage]
  const canGenerateInvoice = !invoice

  return (
    <div className="next-action">
      <div className="next-action__icon">{Icon && <Icon size={20} strokeWidth={1.75} aria-hidden="true" />}</div>
      <div className="next-action__body">
        <p className="next-action__eyebrow">Next step</p>
        {enquiry.stage === 'INITIAL_CALL' && <p className="next-action__headline">Schedule a meeting</p>}
        {enquiry.stage === 'MEETING_SET' && <p className="next-action__headline">Generate the invoice</p>}
        {enquiry.stage === 'INVOICED' && <p className="next-action__headline">Awaiting payment</p>}
        <p className="next-action__detail">{getNextAction(enquiry.stage, enquiry, invoice)}</p>

        {generateError && (
          <p className="form-error" role="alert">
            {generateError}
          </p>
        )}

        {enquiry.stage === 'INITIAL_CALL' && <MeetingTimeForm enquiry={enquiry} onSaved={onSaved} />}

        {enquiry.stage === 'MEETING_SET' && canGenerateInvoice && (
          <div className="next-action__actions">
            <button type="button" onClick={onGenerateInvoice} disabled={generating}>
              {generating ? 'Generating…' : 'Generate invoice'}
            </button>
          </div>
        )}

        {enquiry.stage === 'INITIAL_CALL' && canGenerateInvoice && (
          <div className="next-action__skip">
            <p className="next-action__skip-label">Already have everything you need?</p>
            <button type="button" className="button button--secondary" onClick={onGenerateInvoice} disabled={generating}>
              {generating ? 'Generating…' : 'Generate invoice'}
            </button>
          </div>
        )}

        {enquiry.stage === 'MEETING_SET' && (
          <div className="next-action__reschedule">
            <p className="next-action__skip-label">Need to change the meeting time?</p>
            <MeetingTimeForm enquiry={enquiry} onSaved={onSaved} />
          </div>
        )}

        {enquiry.stage === 'INVOICED' && invoice && (
          <>
            <p className="next-action__balance">
              Balance due: <strong>{formatMoney(invoice.balance_due)}</strong>
            </p>
            <RecordPaymentForm invoice={invoice} onRecorded={onPaymentRecorded} className="next-action__form">
              <Link className="button button--secondary" to={`/invoices/${invoice.id}`}>
                View invoice
              </Link>
            </RecordPaymentForm>
          </>
        )}

        {/* Stage says Invoiced but no Invoice exists yet (e.g. the stage was
            set manually, via the override below, rather than by actually
            generating one) - offer the real fix instead of a dead end. */}
        {enquiry.stage === 'INVOICED' && !invoice && (
          <div className="next-action__actions">
            <button type="button" onClick={onGenerateInvoice} disabled={generating}>
              {generating ? 'Generating…' : 'Generate invoice'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function MeetingTimeForm({ enquiry, onSaved }) {
  const { showToast } = useToast()
  const [value, setValue] = useState(toDatetimeLocalValue(enquiry.meeting_datetime))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const isInitialCall = enquiry.stage === 'INITIAL_CALL'

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      let updated = await enquiriesApi.update(enquiry.id, { meeting_datetime: fromDatetimeLocalValue(value) })
      // Scheduling a meeting from Initial call is what "sets" the meeting -
      // advance the stage in the same action rather than leaving staff to
      // find a separate control for it.
      if (isInitialCall && value) {
        updated = await enquiriesApi.changeStage(enquiry.id, 'MEETING_SET', '')
      }
      showToast(isInitialCall && value ? 'Meeting scheduled' : 'Meeting time saved')
      onSaved(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the meeting time.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="next-action__form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="meeting_datetime">Meeting date &amp; time</label>
        <DateTimePickerField id="meeting_datetime" value={value} onChange={setValue} />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={isInitialCall ? '' : 'button button--secondary'} disabled={submitting}>
        {submitting ? 'Saving…' : isInitialCall ? 'Schedule meeting' : 'Save meeting time'}
      </button>
    </form>
  )
}

function EditFieldsForm({ enquiry, subjects, onSaved, onCancel }) {
  const { showToast } = useToast()
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

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
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
      showToast('Changes saved')
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

      <fieldset>
        <legend>
          <span className="icon-badge">
            <GraduationCap size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          Student
        </legend>
        <div className="form-row">
          <div className="field field--full">
            <label htmlFor="student_name">Student name</label>
            <input id="student_name" type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
            <FieldErrors errors={errors} field="student_name" />
          </div>

          <div className="field">
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
          </div>

          <div className="field">
            <label htmlFor="student_grade">Grade</label>
            <input
              id="student_grade"
              type="text"
              placeholder="Optional"
              value={studentGrade}
              onChange={(e) => setStudentGrade(e.target.value)}
            />
            <FieldErrors errors={errors} field="student_grade" />
          </div>

          <div className="field field--full">
            <label htmlFor="student_school">School</label>
            <input
              id="student_school"
              type="text"
              value={studentSchool}
              onChange={(e) => setStudentSchool(e.target.value)}
            />
            <FieldErrors errors={errors} field="student_school" />
          </div>

          <div className="field">
            <label htmlFor="student_phone">Student phone</label>
            <input
              id="student_phone"
              type="text"
              placeholder="Optional"
              value={studentPhone}
              onChange={(e) => setStudentPhone(e.target.value)}
            />
            <FieldErrors errors={errors} field="student_phone" />
          </div>

          <div className="field">
            <label htmlFor="student_email">Student email</label>
            <input
              id="student_email"
              type="email"
              placeholder="Optional"
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
            />
            <FieldErrors errors={errors} field="student_email" />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>
          <span className="icon-badge">
            <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          Program
        </legend>

        <SubjectMultiSelect subjects={subjects} selectedIds={subjectIds} onChange={setSubjectIds} idPrefix="edit_subjects" />
        <FieldErrors errors={errors} field="interested_subjects" />

        <div className="form-row">
          <div className="field">
            <label htmlFor="duration_weeks">Duration (weeks)</label>
            <input
              id="duration_weeks"
              type="number"
              min="1"
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(e.target.value)}
            />
            <FieldErrors errors={errors} field="duration_weeks" />
          </div>

          <div className="field">
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
          </div>

          <div className="field field--full">
            <label htmlFor="desired_start_date">Desired start date</label>
            <DatePickerField id="desired_start_date" value={desiredStartDate} onChange={setDesiredStartDate} />
            <FieldErrors errors={errors} field="desired_start_date" />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>
          <span className="icon-badge">
            <StickyNote size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          Notes
        </legend>
        <div className="field field--full">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          <FieldErrors errors={errors} field="notes" />
        </div>
      </fieldset>

      <div className="form-actions">
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

// Everything staff typed in at intake is correct far more often than it
// needs correcting - a permanently-open multi-fieldset form fights the
// "what's the next step" hierarchy above it for attention. Collapsed to a
// plain summary by default; Edit swaps in the real form from EditFieldsForm.
function DetailsSection({ enquiry, subjects, onSaved }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <EditFieldsForm
        enquiry={enquiry}
        subjects={subjects}
        onSaved={(updated) => {
          onSaved(updated)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const studentContact = [enquiry.student_phone, enquiry.student_email].filter(Boolean).join(' · ')
  const subjectNames = enquiry.interested_subjects.map((s) => s.name).join(', ')

  return (
    <div className="detail-section">
      <div className="detail-section__header">
        <span className="icon-badge">
          <GraduationCap size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        Details
        <button
          type="button"
          className="button button--secondary detail-section__edit"
          onClick={() => setEditing(true)}
        >
          <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
          Edit
        </button>
      </div>
      <dl className="detail-summary">
        <div className="detail-summary__row">
          <dt>Student</dt>
          <dd>{enquiry.student_name || '—'}</dd>
        </div>
        <div className="detail-summary__row">
          <dt>Year / class</dt>
          <dd>{enquiry.student_year_group ? yearGroupLabel(enquiry.student_year_group) : '—'}</dd>
        </div>
        <div className="detail-summary__row">
          <dt>Grade</dt>
          <dd>{enquiry.student_grade || '—'}</dd>
        </div>
        <div className="detail-summary__row">
          <dt>School</dt>
          <dd>{enquiry.student_school || '—'}</dd>
        </div>
        <div className="detail-summary__row">
          <dt>Student contact</dt>
          <dd>{studentContact || '—'}</dd>
        </div>
        <div className="detail-summary__row">
          <dt>Subjects</dt>
          <dd>{subjectNames || '—'}</dd>
        </div>
        <div className="detail-summary__row">
          <dt>Duration</dt>
          <dd>{enquiry.duration_weeks ? `${enquiry.duration_weeks} weeks` : '—'}</dd>
        </div>
        <div className="detail-summary__row">
          <dt>Learning mode</dt>
          <dd>{enquiry.learning_mode ? LEARNING_MODE_LABELS[enquiry.learning_mode] : '—'}</dd>
        </div>
        <div className="detail-summary__row">
          <dt>Desired start date</dt>
          <dd>{enquiry.desired_start_date ? formatShortDate(parseDateOnly(enquiry.desired_start_date)) : '—'}</dd>
        </div>
        <div className="detail-summary__row detail-summary__row--full">
          <dt>Notes</dt>
          <dd>{enquiry.notes || '—'}</dd>
        </div>
      </dl>
    </div>
  )
}

// Only worth a section once there's something to show - the next-action
// panel above already covers "there's no invoice yet, here's how to make
// one", so an empty history table here would just repeat that with less
// clarity.
function InvoiceHistory({ invoices }) {
  if (invoices.length === 0) return null

  return (
    <div className="detail-section">
      <div className="detail-section__header">
        <span className="icon-badge">
          <Receipt size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        Invoicing
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Total</th>
            <th>Balance due</th>
            <th>Status</th>
            <th>Due date</th>
            <th></th>
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
                <Link to={`/invoices/${invoice.id}`}>View invoice</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EnquiryDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [enquiry, setEnquiry] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [invoices, setInvoices] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleGenerateInvoice() {
    setGenerateError(null)
    setGenerating(true)
    try {
      const invoice = await enquiriesApi.generateInvoice(enquiry.id)
      showToast('Invoice generated')
      // The invoice is the whole point of this action - land staff on it
      // directly rather than back on this page (now stale: stage/
      // stage_history changed server-side) waiting for another click.
      navigate(`/invoices/${invoice.id}`)
    } catch (err) {
      setGenerateError(err instanceof ApiError && err.data ? JSON.stringify(err.data) : 'Could not generate the invoice.')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <div className="page">Loading…</div>
  if (error === 'not_found') return <div className="page">Enquiry not found.</div>
  if (error) return <div className="page">Could not load this enquiry.</div>

  return (
    <div className="page">
      <div className="detail-header">
        <span className="stage-badge">{STAGE_LABELS[enquiry.stage]}</span>
        <span className="detail-header__parent">
          <Users size={14} strokeWidth={1.75} aria-hidden="true" />
          Parent: {enquiry.parent.full_name} · {enquiry.parent.phone}
          {enquiry.parent.email && ` · ${enquiry.parent.email}`}
        </span>
      </div>

      {enquiry.enrollment && (
        <div className="banner banner--success">
          <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
          Enrolled. <Link to="/students">Find their student record</Link>
        </div>
      )}

      <NextActionPanel
        enquiry={enquiry}
        invoice={invoices[0]}
        onSaved={setEnquiry}
        onGenerateInvoice={handleGenerateInvoice}
        generating={generating}
        generateError={generateError}
        // Recording a payment can enroll the student on its first payment
        // (see enroll_student) - that changes enquiry.stage, .enrollment,
        // and .stage_history, not just the invoice, so a full reload keeps
        // everything in sync rather than patching just the invoices list.
        onPaymentRecorded={loadAll}
      />

      <div className="form-card">
        <DetailsSection enquiry={enquiry} subjects={subjects} onSaved={setEnquiry} />

        <InvoiceHistory invoices={invoices} />

        <div className="detail-section">
          <div className="detail-section__header">
            <span className="icon-badge">
              <History size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Stage history
          </div>
          <ul className="stage-history">
            {enquiry.stage_history.map((change) => (
              <li key={change.id}>
                <div className="stage-history__transition">
                  {change.from_stage ? `${STAGE_LABELS[change.from_stage]} → ` : ''}
                  {STAGE_LABELS[change.to_stage]}
                </div>
                <div className="stage-history__meta">
                  by {change.changed_by_name || 'system'} on {new Date(change.changed_at).toLocaleString()}
                </div>
                {change.note && <div className="stage-history__note">"{change.note}"</div>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
