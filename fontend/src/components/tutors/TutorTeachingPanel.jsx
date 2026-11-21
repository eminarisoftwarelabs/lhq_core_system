import { AlertTriangle, BookOpen, Clock, Hourglass, Pencil, XCircle } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { academicsApi, changeRequestsApi, tutorsApi } from '../../lib/api'
import { ApiError } from '../../lib/apiClient'
import {
  SETUP_WARNING,
  formatBlock,
  fromRows,
  groupByLevel,
  openRequestFor,
  sameHours,
  sameSubjectIds,
  sortBlocks,
  teachingSetupMissing,
  toRows,
} from '../../lib/tutorTeaching'
import { FieldErrors, NonFieldErrors } from '../FieldErrors'
import { SubjectMultiSelect } from '../SubjectMultiSelect'
import { useToast } from '../toast/useToast'
import { ChangeRequestDiff } from './ChangeRequestDiff'
import { ChangeRequestReview } from './ChangeRequestReview'
import { WorkingHoursEditor } from './WorkingHoursEditor'

// mode:
//   'direct'   staff with authority over this tutor: saves apply now, and
//              the tutor's pending requests show with Approve / Reject.
//   'request'  the tutor themself: saving sends a change request; live
//              values stay until staff approve it.
//   'readonly' staff without authority (an Admin looking at an Owner).
const KIND_SUBJECTS = 'SUBJECTS'
const KIND_HOURS = 'WORKING_HOURS'

function errorData(err, fallback) {
  return err instanceof ApiError && err.data ? err.data : { detail: fallback }
}

function SubjectsSummary({ subjects }) {
  if (subjects.length === 0) return <p className="form-note">No subjects yet.</p>
  return (
    <div className="teaching-summary">
      {groupByLevel(subjects).map((group) => (
        <div key={group.levelId ?? 'none'} className="teaching-summary__group">
          <p className="teaching-summary__level">{group.levelName}</p>
          <div className="topic-chip-list">
            {group.subjects.map((s) => (
              <span key={s.id} className="topic-chip">
                {s.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function HoursSummary({ hours }) {
  if (hours.length === 0) return <p className="form-note">No working hours yet.</p>
  return (
    <ul className="hours-summary">
      {sortBlocks(hours).map((b) => (
        <li key={formatBlock(b)}>{formatBlock(b)}</li>
      ))}
    </ul>
  )
}

function OwnRequestStatus({ request, onCancel, cancelling }) {
  if (request.status === 'REJECTED') {
    return (
      <div className="request-banner request-banner--rejected" role="status">
        <XCircle size={16} strokeWidth={1.75} aria-hidden="true" />
        <div>
          <p className="request-banner__title">Your last change was not approved</p>
          <p className="request-banner__body">{request.reject_reason}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="request-banner request-banner--pending" role="status">
      <Hourglass size={16} strokeWidth={1.75} aria-hidden="true" />
      <div className="request-banner__content">
        <p className="request-banner__title">Pending approval</p>
        <p className="request-banner__body">Your current values stay in place until an admin approves this.</p>
        <ChangeRequestDiff kind={request.kind} proposed={request.proposed} />
        <button
          type="button"
          className="button button--secondary button--compact"
          disabled={cancelling}
          onClick={() => onCancel(request)}
        >
          {cancelling ? 'Cancelling…' : 'Cancel request'}
        </button>
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, canEdit, editing, onEdit, banner, summary, editor }) {
  return (
    <div className="detail-section">
      <div className="detail-section__header">
        <span className="icon-badge">
          <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        {title}
        {canEdit && !editing && (
          <button type="button" className="button button--secondary detail-section__edit" onClick={onEdit}>
            <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
            Edit
          </button>
        )}
      </div>
      {banner}
      {editing ? editor : summary}
    </div>
  )
}

function EditForm({ mode, kind, children, dirty, saving, errors, note, onNote, onSave, onCancel }) {
  const idBase = useId()
  return (
    <form
      className="teaching-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <NonFieldErrors errors={errors} />
      {/* Everything inside locks while saving, so nothing can be changed
          (or sent twice) mid-request. */}
      <fieldset className="teaching-form__fields" disabled={saving}>
        {children}
      </fieldset>
      <FieldErrors errors={errors} field={kind === KIND_SUBJECTS ? 'subjects' : 'working_hours'} />
      <FieldErrors errors={errors} field="proposed" />
      {mode === 'request' && (
        <div className="field field--full">
          <label htmlFor={`${idBase}-note`}>Note for the admin (optional)</label>
          <textarea
            id={`${idBase}-note`}
            rows={2}
            value={note}
            disabled={saving}
            onChange={(e) => onNote(e.target.value)}
          />
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" disabled={saving || !dirty}>
          {saving ? 'Saving…' : mode === 'request' ? 'Send for approval' : 'Save'}
        </button>
      </div>
    </form>
  )
}

export function TutorTeachingPanel({ tutorId, mode }) {
  const { showToast } = useToast()
  const [state, setState] = useState({ loading: true, failed: false })
  const [catalog, setCatalog] = useState([])
  const [subjects, setSubjects] = useState([])
  const [hours, setHours] = useState([])
  const [requests, setRequests] = useState([])
  const [editing, setEditing] = useState(null) // KIND_SUBJECTS | KIND_HOURS | null
  const [draftSubjects, setDraftSubjects] = useState([])
  const [draftRows, setDraftRows] = useState([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  // A ref, not state: two clicks (or Enters) in the same tick both see
  // `saving` as false, but the ref is set synchronously by the first.
  const savingRef = useRef(false)
  const [errors, setErrors] = useState(null)
  const [cancellingId, setCancellingId] = useState(null)
  const [actionError, setActionError] = useState(null)

  // Fetches only; callers apply the result, so an unmounted panel never
  // sets state.
  const fetchLive = useCallback(() => {
    const requestsCall =
      mode === 'request'
        ? changeRequestsApi.listMine()
        : mode === 'direct'
          ? changeRequestsApi.list({ status: 'PENDING', tutor: tutorId })
          : Promise.resolve([])
    return Promise.all([tutorsApi.getSubjects(tutorId), tutorsApi.getWorkingHours(tutorId), requestsCall])
  }, [mode, tutorId])

  function applyLive([live, liveHours, reqs]) {
    setSubjects(live)
    setHours(liveHours)
    setRequests(reqs)
  }

  useEffect(() => {
    let cancelled = false
    const catalogCall = mode === 'readonly' ? Promise.resolve([]) : academicsApi.listAllSubjects({ is_active: true })
    Promise.all([fetchLive(), catalogCall])
      .then(([live, all]) => {
        if (cancelled) return
        applyLive(live)
        setCatalog(all)
        setState({ loading: false, failed: false })
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [fetchLive, mode])

  function reload() {
    fetchLive()
      .then(applyLive)
      .catch(() => setActionError('Could not refresh. Reload the page to see the latest.'))
  }

  if (state.loading) return <p className="form-note">Loading teaching details…</p>
  if (state.failed) {
    return (
      <p className="form-error" role="alert">
        Could not load subjects and working hours.
      </p>
    )
  }

  const pendingFor = (kind) =>
    mode === 'request' ? openRequestFor(requests, kind) : requests.find((r) => r.kind === kind) ?? null

  // What an edit starts from. A tutor with a pending request starts from
  // that proposal, since sending again replaces it.
  function editBase(kind) {
    const own = mode === 'request' ? pendingFor(kind) : null
    if (own?.status === 'PENDING') return own.proposed
    return kind === KIND_SUBJECTS ? subjects : hours
  }

  function startEdit(kind) {
    const base = editBase(kind)
    if (kind === KIND_SUBJECTS) setDraftSubjects(base.map((s) => s.id))
    else setDraftRows(toRows(base))
    setNote('')
    setErrors(null)
    setActionError(null)
    setEditing(kind)
  }

  const dirty =
    editing === KIND_SUBJECTS
      ? !sameSubjectIds(draftSubjects, editBase(KIND_SUBJECTS).map((s) => s.id))
      : editing === KIND_HOURS
        ? !sameHours(fromRows(draftRows), editBase(KIND_HOURS))
        : false

  async function save() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setErrors(null)
    const proposed = editing === KIND_SUBJECTS ? draftSubjects : fromRows(draftRows)
    try {
      if (mode === 'request') {
        await changeRequestsApi.submit(editing, proposed, note)
        setRequests(await changeRequestsApi.listMine())
        showToast('Sent for approval')
      } else if (editing === KIND_SUBJECTS) {
        setSubjects(await tutorsApi.setSubjects(tutorId, proposed))
        showToast('Subjects saved')
      } else {
        setHours(await tutorsApi.setWorkingHours(tutorId, proposed))
        showToast('Working hours saved')
      }
      setEditing(null)
    } catch (err) {
      setErrors(errorData(err, 'Could not save.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function cancelRequest(request) {
    setCancellingId(request.id)
    setActionError(null)
    try {
      await changeRequestsApi.cancel(request.id)
      setRequests(await changeRequestsApi.listMine())
      showToast('Request cancelled')
    } catch (err) {
      const data = errorData(err, 'Could not cancel the request.')
      setActionError([].concat(data.detail ?? 'Could not cancel the request.').join(' '))
    } finally {
      setCancellingId(null)
    }
  }

  function banner(kind) {
    const request = pendingFor(kind)
    if (!request) return null
    if (mode === 'request') {
      return <OwnRequestStatus request={request} onCancel={cancelRequest} cancelling={cancellingId === request.id} />
    }
    if (mode === 'direct') {
      return (
        <div className="request-banner request-banner--pending">
          <Hourglass size={16} strokeWidth={1.75} aria-hidden="true" />
          <div className="request-banner__content">
            <p className="request-banner__title">{request.tutor_name} asked to change this</p>
            <ChangeRequestReview request={request} onReviewed={reload} />
          </div>
        </div>
      )
    }
    return null
  }

  const canEdit = mode !== 'readonly'
  const formProps = {
    mode,
    saving,
    errors,
    note,
    onNote: setNote,
    onSave: save,
    onCancel: () => setEditing(null),
    dirty,
  }

  return (
    <>
      {teachingSetupMissing(subjects, hours) && (
        <p className="setup-warning" role="note">
          <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
          {SETUP_WARNING}
        </p>
      )}

      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}

      <Section
        icon={BookOpen}
        title="Subjects taught"
        canEdit={canEdit}
        editing={editing === KIND_SUBJECTS}
        onEdit={() => startEdit(KIND_SUBJECTS)}
        banner={banner(KIND_SUBJECTS)}
        summary={<SubjectsSummary subjects={subjects} />}
        editor={
          <EditForm {...formProps} kind={KIND_SUBJECTS}>
            <SubjectMultiSelect
              subjects={catalog}
              selectedIds={draftSubjects}
              onChange={setDraftSubjects}
              idPrefix={`teach_${tutorId}`}
              legend="Subjects taught"
              hideLegend
            />
          </EditForm>
        }
      />

      <Section
        icon={Clock}
        title="Working hours"
        canEdit={canEdit}
        editing={editing === KIND_HOURS}
        onEdit={() => startEdit(KIND_HOURS)}
        banner={banner(KIND_HOURS)}
        summary={<HoursSummary hours={hours} />}
        editor={
          <EditForm {...formProps} kind={KIND_HOURS}>
            <WorkingHoursEditor rows={draftRows} onChange={setDraftRows} idPrefix={`hours_${tutorId}`} />
          </EditForm>
        }
      />
    </>
  )
}
