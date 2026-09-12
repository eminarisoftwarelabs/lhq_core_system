import { AlertTriangle, CheckCircle2, CreditCard, Download, Plus, Printer, Receipt, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { RecordPaymentForm } from '../components/RecordPaymentForm'
import { billingApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { formatMoney, INVOICE_STATUS_LABELS } from '../lib/constants'
import { formatShortDate, parseDateOnly } from '../lib/dateWindow'
import { downloadInvoicePdf } from '../lib/invoicePdf'
import { usePageTitle } from '../lib/usePageTitle'

// formatMoney doesn't need a sign today - nothing else in the app renders a
// negative amount. A discount line item is the first negative value, so it
// gets its own "-$x.xx" formatting rather than teaching the shared helper
// about signs it will otherwise never see.
function formatSignedMoney(value) {
  const amount = Number(value)
  return amount < 0 ? `-${formatMoney(Math.abs(amount))}` : formatMoney(amount)
}

export function InvoiceDetailPage() {
  const { id } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(invoice ? `Invoice #${invoice.id}` : undefined)

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

  const lineItems = invoice.line_items ?? []

  return (
    <div className="page">
      {/* Hidden on screen, shown only in the print/PDF output - the app's
          own header and nav disappear on print, so the invoice needs its
          own letterhead for context once it's a standalone document. */}
      <div className="invoice-print-header">
        <span className="invoice-print-header__brand">LHQ Learning Hub</span>
        <span>Invoice #{invoice.id}</span>
      </div>

      <div className="detail-header">
        <span
          className={`stage-badge invoice-status-badge invoice-status-badge--${invoice.status.toLowerCase()}`}
        >
          {INVOICE_STATUS_LABELS[invoice.status]}
        </span>
        <span className="detail-header__parent">
          <Users size={14} strokeWidth={1.75} aria-hidden="true" />
          For <Link to={`/enquiries/${invoice.enquiry}`}>{invoice.enquiry_student_name}</Link>
        </span>
        <div className="invoice-header-actions no-print">
          <button type="button" className="button button--secondary" onClick={() => window.print()}>
            <Printer size={14} strokeWidth={1.75} aria-hidden="true" />
            Print
          </button>
          <button type="button" className="button" onClick={() => downloadInvoicePdf(invoice)}>
            <Download size={14} strokeWidth={1.75} aria-hidden="true" />
            Download PDF
          </button>
        </div>
      </div>

      {invoice.is_overdue && (
        <div className="banner banner--danger no-print">
          <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
          Overdue — this invoice was due {formatShortDate(parseDateOnly(invoice.due_date))}.
        </div>
      )}
      {invoice.enrollment && (
        <div className="banner banner--success no-print">
          <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
          Enrolled from this invoice's first payment. <Link to="/students">Find the student</Link>
        </div>
      )}

      <div className="form-card">
        <div className="detail-section">
          <div className="detail-section__header">
            <span className="icon-badge">
              <Receipt size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Invoice
          </div>

          {lineItems.length > 0 ? (
            <table className="data-table invoice-line-items">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="invoice-line-items__amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td className="invoice-line-items__amount">{formatSignedMoney(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="invoice-line-items__total-row">
                  <td>Total</td>
                  <td className="invoice-line-items__amount">{formatMoney(invoice.total)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="invoice-line-items__total-row invoice-line-items__total-row--plain">
              Total: {formatMoney(invoice.total)}
            </p>
          )}

          <dl className="detail-summary invoice-terms">
            <div className="detail-summary__row">
              <dt>Due date</dt>
              <dd>{formatShortDate(parseDateOnly(invoice.due_date))}</dd>
            </div>
            <div className="detail-summary__row">
              <dt>Amount paid</dt>
              <dd>{formatMoney(invoice.amount_paid)}</dd>
            </div>
            <div className="detail-summary__row">
              <dt>Balance due</dt>
              <dd>{formatMoney(invoice.balance_due)}</dd>
            </div>
          </dl>
        </div>

        <div className="detail-section no-print">
          <div className="detail-section__header">
            <span className="icon-badge">
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Record a payment
          </div>
          <RecordPaymentForm invoice={invoice} onRecorded={setInvoice} />
        </div>

        <div className="detail-section">
          <div className="detail-section__header">
            <span className="icon-badge">
              <CreditCard size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Payments
          </div>
          {invoice.payments.length === 0 && <p className="form-note">No payments recorded yet.</p>}
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
        </div>
      </div>
    </div>
  )
}
