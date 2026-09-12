import { describe, expect, it } from 'vitest'
import { buildInvoicePdf } from './invoicePdf'

// Exercises the real jsPDF + jspdf-autotable APIs (not mocked) so a wrong
// argument to autoTable() or doc.text() surfaces here instead of only in a
// browser at click-time. downloadInvoicePdf()'s actual file-save is a thin
// one-line wrapper (buildInvoicePdf(invoice).save(filename)) covered by
// InvoiceDetailPage's wiring test instead - jsPDF's browser-only save()
// (anchor + blob download) isn't exercised by Node's export condition,
// which is what this Vitest/jsdom environment resolves to.
const invoiceWithLineItems = {
  id: 7,
  enquiry: 5,
  enquiry_student_name: 'Jimmy Doe',
  total: '1200000.00',
  amount_paid: '200000.00',
  balance_due: '1000000.00',
  status: 'PARTIALLY_PAID',
  due_date: '2026-09-21',
  line_items: [
    { id: 1, description: 'Tuition — 1 subject, 5 sessions/week × 12 weeks @ 25,000.00/session', amount: '1500000.00' },
    { id: 2, description: 'Duration discount (20%)', amount: '-300000.00' },
  ],
  payments: [{ id: 1, amount: '200000.00', recorded_by_name: 'Admin', paid_at: '2026-01-05T00:00:00Z' }],
}

describe('buildInvoicePdf', () => {
  it('builds a document with real, non-empty PDF output', () => {
    const doc = buildInvoicePdf(invoiceWithLineItems)
    const bytes = doc.output('arraybuffer')
    expect(bytes.byteLength).toBeGreaterThan(100)
  })

  it('does not throw for an invoice with no line items (fallback to a single Tuition row)', () => {
    expect(() => buildInvoicePdf({ ...invoiceWithLineItems, line_items: [] })).not.toThrow()
  })

  it('does not throw for an invoice with no line_items field at all', () => {
    const rest = { ...invoiceWithLineItems }
    delete rest.line_items
    expect(() => buildInvoicePdf(rest)).not.toThrow()
  })

  it('does not throw for an invoice with no payments recorded yet', () => {
    expect(() => buildInvoicePdf({ ...invoiceWithLineItems, payments: [] })).not.toThrow()
  })

  it('does not throw for an invoice missing enquiry_student_name', () => {
    expect(() => buildInvoicePdf({ ...invoiceWithLineItems, enquiry_student_name: undefined })).not.toThrow()
  })
})
