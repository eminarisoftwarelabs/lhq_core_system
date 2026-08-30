import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { NonFieldErrors } from '../components/FieldErrors'
import { billingApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { formatMoney, INVOICE_STATUS_LABELS } from '../lib/constants'

function RecordPaymentForm({ invoice, onRecorded }) {
  const [amount, setAmount] = useState('')
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSubmitting(true)
    try {
      const updated = await billingApi.recordPayment(invoice.id, amount)
      setAmount('')
      onRecorded(updated)
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not record this payment.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (Number(invoice.balance_due) <= 0) {
    return <p className="form-success">Paid in full.</p>
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <NonFieldErrors errors={errors} />
      <label htmlFor="amount">Payment amount</label>
      <input
        id="amount"
        type="number"
        min="0.01"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Recording…' : 'Record payment'}
      </button>
    </form>
  )
}

export function InvoiceDetailPage() {
  const { id } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await billingApi.getInvoice(id)
        if (!cancelled) setInvoice(res)
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError && err.status === 404 ? 'not_found' : 'load_failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) return <div className="page">Loading…</div>
  if (error === 'not_found') return <div className="page">Invoice not found.</div>
  if (error) return <div className="page">Could not load this invoice.</div>

  return (
    <div className="page">
      <h1>Invoice #{invoice.id}</h1>
      <p>
        For <Link to={`/enquiries/${invoice.enquiry}`}>{invoice.enquiry_student_name}</Link>
      </p>
      <p>Total: {formatMoney(invoice.total)}</p>
      <p>Balance due: {formatMoney(invoice.balance_due)}</p>
      <p>Status: {INVOICE_STATUS_LABELS[invoice.status]}</p>
      <p>Due date: {invoice.due_date}</p>
      {invoice.is_overdue && (
        <p className="form-error" role="alert">
          Overdue
        </p>
      )}
      {invoice.enrollment && (
        <p className="form-success">
          <Link to={`/students`}>Student enrolled</Link>
        </p>
      )}

      <h2>Payments</h2>
      {invoice.payments.length === 0 && <p>No payments recorded yet.</p>}
      {invoice.payments.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Amount</th>
              <th>Recorded by</th>
              <th>Paid at</th>
            </tr>
          </thead>
          <tbody>
            {invoice.payments.map((payment) => (
              <tr key={payment.id}>
                <td>{formatMoney(payment.amount)}</td>
                <td>{payment.recorded_by_name || '—'}</td>
                <td>{new Date(payment.paid_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Record a payment</h2>
      <RecordPaymentForm invoice={invoice} onRecorded={setInvoice} />
    </div>
  )
}
