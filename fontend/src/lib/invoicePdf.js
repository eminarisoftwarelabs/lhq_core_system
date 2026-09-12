import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatMoney, INVOICE_STATUS_LABELS } from './constants'
import { formatShortDate, parseDateOnly } from './dateWindow'

const MARGIN = 40
const BRAND_COLOR = [17, 17, 17]

function formatSignedAmount(value) {
  const amount = Number(value)
  return amount < 0 ? `-${formatMoney(Math.abs(amount))}` : formatMoney(amount)
}

// Builds the invoice as a real PDF document - vector text drawn directly
// with jsPDF, not a screenshot of the page - so "Download PDF" produces a
// clean, selectable-text file in one click regardless of the viewer's
// browser/OS print setup. Kept separate from index.css's print stylesheet,
// which serves the "Print" button (an actual printer, or the browser's own
// Print > Save as PDF) instead.
export function buildInvoicePdf(invoice) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('LHQ Learning Hub', MARGIN, 50)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(`Invoice #${invoice.id}`, pageWidth - MARGIN, 44, { align: 'right' })
  doc.text(INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status, pageWidth - MARGIN, 60, { align: 'right' })

  doc.setDrawColor(...BRAND_COLOR)
  doc.setLineWidth(1.5)
  doc.line(MARGIN, 66, pageWidth - MARGIN, 66)

  doc.setFontSize(11)
  doc.text(`For: ${invoice.enquiry_student_name ?? '—'}`, MARGIN, 90)
  doc.text(`Due date: ${formatShortDate(parseDateOnly(invoice.due_date))}`, MARGIN, 106)

  const lineItems = invoice.line_items ?? []
  const body =
    lineItems.length > 0
      ? lineItems.map((item) => [item.description, formatSignedAmount(item.amount)])
      : [['Tuition', formatMoney(invoice.total)]]

  autoTable(doc, {
    startY: 126,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Description', 'Amount']],
    body,
    foot: [['Total', formatMoney(invoice.total)]],
    columnStyles: { 1: { halign: 'right' } },
    footStyles: { fontStyle: 'bold' },
    headStyles: { fillColor: BRAND_COLOR },
    theme: 'grid',
  })

  let y = doc.lastAutoTable.finalY + 28
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(`Amount paid: ${formatMoney(invoice.amount_paid)}`, MARGIN, y)
  doc.text(`Balance due: ${formatMoney(invoice.balance_due)}`, MARGIN, y + 16)
  y += 32

  const payments = invoice.payments ?? []
  if (payments.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.text('Payments', MARGIN, y)

    autoTable(doc, {
      startY: y + 10,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Amount', 'Recorded by', 'Paid at']],
      body: payments.map((payment) => [
        formatMoney(payment.amount),
        payment.recorded_by_name || '—',
        new Date(payment.paid_at).toLocaleString(),
      ]),
      headStyles: { fillColor: BRAND_COLOR },
      theme: 'grid',
    })
  }

  return doc
}

export function downloadInvoicePdf(invoice) {
  buildInvoicePdf(invoice).save(`invoice-${invoice.id}.pdf`)
}
