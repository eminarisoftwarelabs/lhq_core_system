import { Receipt } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { billingApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { formatMoney, INVOICE_STATUS_LABELS } from '../lib/constants'
import { formatShortDate, parseDateOnly } from '../lib/dateWindow'
import { usePageTitle } from '../lib/usePageTitle'

// Must match PAGE_SIZE in the backend's settings.py - the API doesn't expose
// its own page size, so this mirrors it the same way the other directory
// pages (Students, Subjects, Users) do for their Previous/Next controls.
const PAGE_SIZE = 20

const FILTERS = [
  { value: 'outstanding', label: 'Outstanding', params: { balance_due__gt: 0 } },
  { value: 'all', label: 'All', params: {} },
]

function balanceSummary(invoice) {
  if (Number(invoice.balance_due) <= 0) return `Paid in full · ${formatMoney(invoice.total)}`
  return `${formatMoney(invoice.balance_due)} due of ${formatMoney(invoice.total)}`
}

export function InvoicesListPage() {
  usePageTitle('Invoices')
  const [filter, setFilter] = useState('outstanding')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1

  useEffect(() => {
    let cancelled = false
    const { params } = FILTERS.find((f) => f.value === filter)

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await billingApi.listInvoices({ ...params, page })
        if (!cancelled) setData(res)
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load invoices.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [filter, page])

  return (
    <div className="page">
      <section className="recent-enrollments directory-card">
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <Receipt size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>Invoices</h2>
            {!loading && !error && data && <span className="onboarding-section__count">{data.count}</span>}
          </div>

          <div className="period-toggle" role="group" aria-label="Invoice filter">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`period-toggle__option${option.value === filter ? ' period-toggle__option--active' : ''}`}
                aria-pressed={option.value === filter}
                onClick={() => {
                  setFilter(option.value)
                  setPage(1)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <p className="recent-enrollments__status">Loading…</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && data && data.results.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__icon">
              <Receipt size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p>{filter === 'outstanding' ? 'No outstanding invoices. Everything is paid up.' : 'No invoices found.'}</p>
          </div>
        )}

        {!loading && !error && data && data.results.length > 0 && (
          <ul className="recent-enrollments__list directory-card__list">
            {data.results.map((invoice) => (
              <li key={invoice.id}>
                <Link to={`/invoices/${invoice.id}`} className="recent-enrollments__row recent-enrollments__row--rich invoice-row">
                  <span className="directory-row__identity">
                    <span>{invoice.enquiry_student_name}</span>
                    <span className="directory-row__subtext">
                      Invoice #{invoice.id} · Due {formatShortDate(parseDateOnly(invoice.due_date))}
                    </span>
                  </span>

                  <span className="directory-row__meta">
                    <span className="directory-row__badges">
                      {invoice.is_overdue && (
                        <span className="stage-badge invoice-status-badge invoice-status-badge--overdue">Overdue</span>
                      )}
                      <span
                        className={`stage-badge invoice-status-badge invoice-status-badge--${invoice.status.toLowerCase()}`}
                      >
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </span>
                    </span>
                    <span className="directory-row__detail directory-row__detail--money">{balanceSummary(invoice)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {!loading && !error && totalPages > 1 && (
          <div className="pagination">
            <button type="button" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button type="button" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
