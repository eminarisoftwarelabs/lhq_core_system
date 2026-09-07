import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { billingApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { formatMoney, INVOICE_STATUS_LABELS } from '../lib/constants'
import { usePageTitle } from '../lib/usePageTitle'

export function InvoicesListPage() {
  usePageTitle('Invoices')
  const [outstandingOnly, setOutstandingOnly] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await billingApi.listInvoices(outstandingOnly ? { balance_due__gt: 0 } : {})
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
  }, [outstandingOnly])

  return (
    <div className="page">
      <label htmlFor="outstanding_only" className="checkbox-label">
        <input
          id="outstanding_only"
          type="checkbox"
          checked={outstandingOnly}
          onChange={(e) => setOutstandingOnly(e.target.checked)}
        />
        Outstanding balances only
      </label>

      {loading && <p>Loading…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && data && data.results.length === 0 && <p>No invoices found.</p>}

      {!loading && !error && data && data.results.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Total</th>
              <th>Balance due</th>
              <th>Status</th>
              <th>Due date</th>
              <th>Overdue</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  <Link to={`/invoices/${invoice.id}`}>{invoice.enquiry_student_name}</Link>
                </td>
                <td>{formatMoney(invoice.total)}</td>
                <td>{formatMoney(invoice.balance_due)}</td>
                <td>{INVOICE_STATUS_LABELS[invoice.status]}</td>
                <td>{invoice.due_date}</td>
                <td>{invoice.is_overdue ? 'Yes' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
