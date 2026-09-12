import { useState } from 'react'
import { billingApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { FieldErrors, NonFieldErrors } from './FieldErrors'

// The app displays money with thousands separators (formatMoney), so
// typing it back the same way - "250,000" - is the natural thing to do.
// A native <input type="number"> can't be trusted with that: browsers
// reject the comma outright, or worse, under some locale settings treat it
// as a decimal separator and silently turn "250,000" into 250. Stripping
// commas/spaces ourselves on a plain text input sidesteps both failure
// modes entirely - we own the parsing, not the browser's locale guessing.
function sanitizeAmountInput(value) {
  return value.replace(/[,\s]/g, '')
}

// Mirrors the backend's own checks (RecordPaymentSerializer.validate_amount)
// so a bad amount is caught instantly, before a round trip - the server
// check stays authoritative (balance_due can move between page load and
// submit), this is purely for immediate feedback.
function validatePaymentAmount(rawValue, invoice) {
  const value = sanitizeAmountInput(rawValue)
  if (value === '') return 'Enter a payment amount.'
  if (!/^-?\d+(\.\d+)?$/.test(value)) return 'Enter a valid number - digits only (commas are fine).'
  const numeric = Number(value)
  if (numeric <= 0) return 'Amount must be greater than 0.'
  if (numeric > Number(invoice.balance_due)) return 'Amount cannot exceed the balance due.'
  return null
}

// Shared by InvoiceDetailPage (the invoice's own page) and
// EnquiryDetailPage's NextActionPanel (recording payment right from the
// "what to do next" card for an Invoiced enquiry, no navigation needed).
// className lets each caller fit its own layout - InvoiceDetailPage's
// roomy .form-card vs. NextActionPanel's compact inline .next-action__form
// - without forking the form itself. children renders after the submit
// button, inside the same row, for a caller-supplied secondary action
// (e.g. NextActionPanel's "View invoice" link) rather than that action
// stacking below the form.
export function RecordPaymentForm({ invoice, onRecorded, className = 'form', children }) {
  const [amount, setAmount] = useState('')
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const clientError = validatePaymentAmount(amount, invoice)
    if (clientError) {
      setErrors({ amount: [clientError] })
      return
    }
    setErrors(null)
    setSubmitting(true)
    try {
      const updated = await billingApi.recordPayment(invoice.id, sanitizeAmountInput(amount))
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
    <form className={className} onSubmit={handleSubmit} noValidate>
      <NonFieldErrors errors={errors} />
      <div className="field">
        <label htmlFor="amount">Payment amount</label>
        <input
          id="amount"
          type="text"
          inputMode="decimal"
          placeholder="e.g. 250,000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <FieldErrors errors={errors} field="amount" />
      </div>
      <button type="submit" disabled={submitting}>
        {submitting ? 'Recording…' : 'Record payment'}
      </button>
      {children}
    </form>
  )
}
