import { CalendarRange, ChevronDown, Receipt, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DatePickerField } from '../components/ui/DatePickerField'
import { billingApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { formatMoney, INVOICE_STATUS_LABELS } from '../lib/constants'
import { formatShortDate, parseDateOnly } from '../lib/dateWindow'
import {
  describeInvoiceRange,
  INVOICE_PERIODS,
  invoicePeriodParams,
  invoicePeriodRange,
  isInvertedCustomRange,
  isInvoicePeriod,
} from '../lib/invoicePeriods'
import { usePageTitle } from '../lib/usePageTitle'

// Must match PAGE_SIZE in the backend's settings.py - the API doesn't expose
// its own page size, so this mirrors it the same way the other directory
// pages (Students, Subjects, Users) do for their Previous/Next controls.
const PAGE_SIZE = 20

const FILTERS = [
  { value: 'outstanding', label: 'Outstanding', params: { balance_due__gt: 0 } },
  { value: 'all', label: 'All', params: {} },
]

function emptyMessage(filter, rangeLabel) {
  if (rangeLabel) {
    return filter === 'outstanding' ? 'No outstanding invoices issued in this period.' : 'No invoices issued in this period.'
  }
  return filter === 'outstanding' ? 'No outstanding invoices. Everything is paid up.' : 'No invoices found.'
}

const STATUS_VALUES = new Set(FILTERS.map((f) => f.value))

function balanceSummary(invoice) {
  if (Number(invoice.balance_due) <= 0) return `Paid in full · ${formatMoney(invoice.total)}`
  return `${formatMoney(invoice.balance_due)} due of ${formatMoney(invoice.total)}`
}

export function InvoicesListPage() {
  usePageTitle('Invoices')
  // Filters live in the URL so a filtered view survives a refresh, the back
  // button from an invoice, and can be shared as a link. Unknown values
  // fall back to the defaults rather than sending garbage to the API.
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = STATUS_VALUES.has(searchParams.get('status')) ? searchParams.get('status') : 'outstanding'
  const period = isInvoicePeriod(searchParams.get('period')) ? searchParams.get('period') : 'all'
  const customFrom = searchParams.get('from') ?? ''
  const customTo = searchParams.get('to') ?? ''
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1

  const invertedRange = period === 'custom' && isInvertedCustomRange(customFrom, customTo)
  const range = useMemo(
    () => (invertedRange ? null : invoicePeriodRange(period, { customFrom, customTo })),
    [period, customFrom, customTo, invertedRange],
  )
  const { issued_from: issuedFrom, issued_to: issuedTo } = invoicePeriodParams(range)
  const rangeLabel = describeInvoiceRange(range)

  function updateFilters(changes) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )
    setPage(1)
  }

  function handlePeriodChange(value) {
    // Leaving "Custom range" drops its dates so they can't silently come
    // back the next time someone picks it.
    updateFilters(value === 'custom' ? { period: value } : { period: value === 'all' ? '' : value, from: '', to: '' })
  }

  useEffect(() => {
    // An end date before the start date can't match anything - show the
    // inline error instead of asking the API for a guaranteed-empty page.
    if (invertedRange) return undefined
    let cancelled = false
    const { params } = FILTERS.find((f) => f.value === filter)

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const query = { ...params, page }
        if (issuedFrom) query.issued_from = issuedFrom
        if (issuedTo) query.issued_to = issuedTo
        const res = await billingApi.listInvoices(query)
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
  }, [filter, page, issuedFrom, issuedTo, invertedRange])

  const showResults = !loading && !error && !invertedRange && data

  return (
    <div className="page">
      <section className="recent-enrollments directory-card">
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <Receipt size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>Invoices</h2>
            {showResults && <span className="onboarding-section__count">{data.count}</span>}
          </div>

          <div className="invoice-filters">
            <label className="filter-select" htmlFor="invoice_period">
              <span className="visually-hidden">Issued</span>
              <CalendarRange size={14} strokeWidth={1.75} className="filter-select__icon" aria-hidden="true" />
              <select id="invoice_period" value={period} onChange={(e) => handlePeriodChange(e.target.value)}>
                {INVOICE_PERIODS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} strokeWidth={1.75} className="filter-select__chevron" aria-hidden="true" />
            </label>

            <div className="period-toggle" role="group" aria-label="Invoice filter">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`period-toggle__option${option.value === filter ? ' period-toggle__option--active' : ''}`}
                  aria-pressed={option.value === filter}
                  onClick={() => updateFilters({ status: option.value === 'outstanding' ? '' : option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {period === 'custom' && (
          <div className="invoice-custom-range">
            <div className="field">
              <label htmlFor="issued_from">Issued from</label>
              <DatePickerField
                id="issued_from"
                value={customFrom}
                onChange={(value) => updateFilters({ from: value })}
                placeholder="Any date"
              />
            </div>
            <div className="field">
              <label htmlFor="issued_to">Issued to</label>
              <DatePickerField
                id="issued_to"
                value={customTo}
                onChange={(value) => updateFilters({ to: value })}
                placeholder="Any date"
              />
            </div>
            {invertedRange && (
              <p className="form-error invoice-custom-range__error" role="alert">
                The end date is before the start date.
              </p>
            )}
          </div>
        )}

        {rangeLabel && (
          <p className="invoice-range-summary">
            <span>
              Issued <strong>{rangeLabel}</strong>
            </span>
            <button type="button" className="button--ghost invoice-range-summary__clear" onClick={() => handlePeriodChange('all')}>
              <X size={12} strokeWidth={2} aria-hidden="true" />
              Clear dates
            </button>
          </p>
        )}

        {loading && !invertedRange && <p className="recent-enrollments__status">Loading…</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {showResults && data.results.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__icon">
              <Receipt size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p>{emptyMessage(filter, rangeLabel)}</p>
          </div>
        )}

        {showResults && data.results.length > 0 && (
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

        {showResults && totalPages > 1 && (
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
