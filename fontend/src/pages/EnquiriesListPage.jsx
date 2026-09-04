import { ArrowUpRight, CalendarCheck, Clock, Phone, Receipt } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { billingApi, enquiriesApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { formatDateTime } from '../lib/dateWindow'
import { getNextAction } from '../lib/onboardingNextAction'
import { formatStageAge, getStageEnteredAt } from '../lib/stageAge'

// The active onboarding pipeline only - ENROLLED is a terminal, auto-set
// stage (see constants.MANUAL_STAGE_OPTIONS), not something staff is still
// working. Once a family enrolls they've graduated out of onboarding: they
// show up under Students, and the "Recently Enrolled" dashboard card gives
// the momentum hit without this page turning into a growing archive.
const ONBOARDING_STAGES = [
  { stage: 'INITIAL_CALL', label: 'Initial call', icon: Phone },
  { stage: 'MEETING_SET', label: 'Meeting set', icon: CalendarCheck },
  { stage: 'INVOICED', label: 'Invoiced', icon: Receipt },
]

function StageSection({ stage, label, icon: Icon }) {
  const [data, setData] = useState(null)
  const [invoicesByEnquiryId, setInvoicesByEnquiryId] = useState({})
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        // Invoiced is the only stage whose "next action" needs more than the
        // enquiry itself (see getNextAction) - one invoice per INVOICED-stage
        // enquiry is guaranteed by generate_invoice(), so a single unfiltered
        // fetch here, matched client-side, covers every row in this section.
        const [res, invoicesRes] = await Promise.all([
          enquiriesApi.list({ stage }),
          stage === 'INVOICED' ? billingApi.listInvoices() : Promise.resolve(null),
        ])
        if (cancelled) return
        setData(res)
        if (invoicesRes) {
          setInvoicesByEnquiryId(Object.fromEntries(invoicesRes.results.map((inv) => [inv.enquiry, inv])))
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load enquiries.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [stage])

  return (
    <section className="onboarding-section">
      <div className="onboarding-section__header">
        <span className="onboarding-section__icon">
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h2>{label}</h2>
        <span className="onboarding-section__count">{data ? data.count : '···'}</span>
      </div>

      <div className="onboarding-section__body">
        {loading && <p className="onboarding-section__status">Loading…</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && data && data.results.length === 0 && (
          <p className="onboarding-section__status">No enquiries in this stage.</p>
        )}

        {!loading && !error && data && data.results.length > 0 && (
          <ul className="onboarding-section__list">
            {data.results.map((enquiry) => {
              const enteredStageAt = getStageEnteredAt(enquiry, stage)
              return (
                <li key={enquiry.id}>
                  <Link to={`/enquiries/${enquiry.id}`} className="onboarding-row">
                    <span className="onboarding-row__text">
                      <span className="onboarding-row__name">{enquiry.student_name}</span>
                      <span className="onboarding-row__meta">{enquiry.parent.full_name}</span>
                      <span className="onboarding-row__action">
                        {getNextAction(stage, enquiry, invoicesByEnquiryId[enquiry.id])}
                      </span>
                    </span>
                    <span className="onboarding-row__side">
                      <span
                        className="onboarding-row__age"
                        title={`In this stage since ${formatDateTime(enteredStageAt)}`}
                      >
                        <Clock size={11} strokeWidth={1.75} aria-hidden="true" />
                        {formatStageAge(enteredStageAt)} in stage
                      </span>
                      <ArrowUpRight className="onboarding-row__arrow" size={18} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

export function EnquiriesListPage() {
  return (
    <div className="page">
      <div className="page__header">
        <h1>Onboarding</h1>
        <Link className="button" to="/enquiries/new">
          New enquiry
        </Link>
      </div>

      <div className="onboarding-board">
        {ONBOARDING_STAGES.map((section) => (
          <StageSection key={section.stage} {...section} />
        ))}
      </div>
    </div>
  )
}
