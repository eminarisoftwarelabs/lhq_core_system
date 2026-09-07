import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnquiriesListPage } from './EnquiriesListPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ApiError } from '../lib/apiClient'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname}</div>
}

// window.matchMedia is stubbed in src/test/setup.js to always report
// `matches: false`, which is what "isTouchPointer() -> false" needs by
// default. These tests need to flip it to simulate a touch (no-hover)
// pointer for specific assertions, then restore the shared stub.
function stubHover(hasHover) {
  const original = window.matchMedia
  window.matchMedia = (query) => ({
    matches: query === '(hover: none)' ? !hasHover : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
  return () => {
    window.matchMedia = original
  }
}

const mockList = vi.fn()
const mockListInvoices = vi.fn()
vi.mock('../lib/api', () => ({
  enquiriesApi: {
    list: (...args) => mockList(...args),
  },
  billingApi: {
    listInvoices: (...args) => mockListInvoices(...args),
  },
}))

const initialCallEnquiry = {
  id: 5,
  student_name: 'Jimmy Doe',
  parent: { full_name: 'Jane Doe' },
  stage: 'INITIAL_CALL',
  meeting_datetime: null,
  created_at: '2026-08-01T00:00:00Z',
  stage_history: [],
}

const invoicedEnquiry = {
  id: 9,
  student_name: 'Ada Lee',
  parent: { full_name: 'Grace Lee' },
  stage: 'INVOICED',
  created_at: '2026-08-01T00:00:00Z',
  stage_history: [],
}

function mockByStage({ initialCall, meetingSet, invoiced }) {
  mockList.mockImplementation(({ stage }) => {
    if (stage === 'INITIAL_CALL') return Promise.resolve(initialCall)
    if (stage === 'MEETING_SET') return Promise.resolve(meetingSet)
    if (stage === 'INVOICED') return Promise.resolve(invoiced)
    return Promise.reject(new Error(`unexpected stage ${stage}`))
  })
}

function renderPage() {
  return render(
    <PageHeaderProvider>
      <MemoryRouter>
        <EnquiriesListPage />
      </MemoryRouter>
    </PageHeaderProvider>,
  )
}

function renderPageWithLocationProbe() {
  return render(
    <PageHeaderProvider>
      <MemoryRouter>
        <LocationProbe />
        <EnquiriesListPage />
      </MemoryRouter>
    </PageHeaderProvider>,
  )
}

beforeEach(() => {
  mockList.mockReset()
  mockListInvoices.mockReset().mockResolvedValue({ count: 0, results: [] })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EnquiriesListPage', () => {
  it('fetches each active pipeline stage independently, and never fetches ENROLLED', async () => {
    mockByStage({
      initialCall: { count: 1, results: [initialCallEnquiry] },
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 1, results: [invoicedEnquiry] },
    })
    renderPage()

    expect(await screen.findByText('Jimmy Doe')).toBeInTheDocument()
    expect(mockList).toHaveBeenCalledWith({ stage: 'INITIAL_CALL' })
    expect(mockList).toHaveBeenCalledWith({ stage: 'MEETING_SET' })
    expect(mockList).toHaveBeenCalledWith({ stage: 'INVOICED' })
    expect(mockList).not.toHaveBeenCalledWith({ stage: 'ENROLLED' })
    expect(mockList).toHaveBeenCalledTimes(3)
  })

  it('shows the three stage sections, each with its own heading and count', async () => {
    mockByStage({
      initialCall: { count: 1, results: [initialCallEnquiry] },
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 1, results: [invoicedEnquiry] },
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Initial call' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Meeting set' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Invoiced' })).toBeInTheDocument()

    expect(await screen.findAllByText('1')).toHaveLength(2) // Initial call and Invoiced
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('links each row to its enquiry detail page', async () => {
    mockByStage({
      initialCall: { count: 1, results: [initialCallEnquiry] },
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 1, results: [invoicedEnquiry] },
    })
    renderPage()

    expect(await screen.findByRole('link', { name: /Jimmy Doe/ })).toHaveAttribute('href', '/enquiries/5')
    expect(screen.getByRole('link', { name: /Ada Lee/ })).toHaveAttribute('href', '/enquiries/9')
  })

  it('shows the next action for an Initial call enquiry with no meeting scheduled', async () => {
    mockByStage({
      initialCall: { count: 1, results: [initialCallEnquiry] },
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 0, results: [] },
    })
    renderPage()

    expect(await screen.findByText('No meeting scheduled yet')).toBeInTheDocument()
  })

  it('shows the meeting time as the next action for a Meeting set enquiry', async () => {
    const enquiry = {
      id: 6,
      student_name: 'Chikondi Phiri',
      parent: { full_name: 'Grace Phiri' },
      stage: 'MEETING_SET',
      meeting_datetime: '2099-01-15T14:00:00Z',
      created_at: '2026-08-01T00:00:00Z',
      stage_history: [],
    }
    mockByStage({
      initialCall: { count: 0, results: [] },
      meetingSet: { count: 1, results: [enquiry] },
      invoiced: { count: 0, results: [] },
    })
    renderPage()

    expect(await screen.findByText(/^Meeting /)).toBeInTheDocument()
  })

  it('shows the invoice due date as the next action for an Invoiced enquiry', async () => {
    mockByStage({
      initialCall: { count: 0, results: [] },
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 1, results: [invoicedEnquiry] },
    })
    mockListInvoices.mockResolvedValue({
      count: 1,
      results: [{ id: 20, enquiry: 9, due_date: '2026-09-24', is_overdue: false }],
    })
    renderPage()

    expect(await screen.findByText('Awaiting payment — due Sep 24, 2026')).toBeInTheDocument()
    expect(mockListInvoices).toHaveBeenCalledWith()
    // Not fetched for the other two stages - only Invoiced needs it.
    expect(mockListInvoices).toHaveBeenCalledTimes(1)
  })

  it('flags an overdue invoice for an Invoiced enquiry', async () => {
    mockByStage({
      initialCall: { count: 0, results: [] },
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 1, results: [invoicedEnquiry] },
    })
    mockListInvoices.mockResolvedValue({
      count: 1,
      results: [{ id: 20, enquiry: 9, due_date: '2026-08-20', is_overdue: true }],
    })
    renderPage()

    expect(await screen.findByText('Overdue — was due Aug 20, 2026')).toBeInTheDocument()
  })

  it('shows an empty state for a stage with no enquiries', async () => {
    mockByStage({
      initialCall: { count: 0, results: [] },
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 0, results: [] },
    })
    renderPage()

    expect(await screen.findAllByText('No enquiries in this stage.')).toHaveLength(3)
  })

  it('shows an error for a section that fails to load without breaking the others', async () => {
    mockList.mockImplementation(({ stage }) => {
      if (stage === 'MEETING_SET') return Promise.reject(new ApiError(500, { detail: 'Server error.' }))
      return Promise.resolve({ count: 0, results: [] })
    })
    renderPage()

    expect(await screen.findByText('Server error.')).toBeInTheDocument()
    expect(screen.getAllByText('No enquiries in this stage.')).toHaveLength(2)
  })

  it('shows only the student name inline, keeping parent details out of the visible row', async () => {
    mockByStage({
      initialCall: { count: 1, results: [initialCallEnquiry] },
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 0, results: [] },
    })
    const { container } = renderPage()

    await screen.findByText('Jimmy Doe')
    expect(container.querySelector('.onboarding-row__name').textContent).toBe('Jimmy Doe')
    expect(container.querySelector('.onboarding-row__meta')).not.toBeInTheDocument()
  })

  it('puts the parent name, phone, and email in a popover on the student name', async () => {
    const enquiryWithContact = {
      ...initialCallEnquiry,
      parent: { full_name: 'Jane Doe', phone: '0999123456', email: 'jane@example.com' },
    }
    mockByStage({
      initialCall: { count: 1, results: [enquiryWithContact] },
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 0, results: [] },
    })
    renderPage()

    await screen.findByText('Jimmy Doe')
    const popover = screen.getByRole('tooltip')
    expect(popover).toHaveTextContent('Parent: Jane Doe')
    expect(popover).toHaveTextContent('0999123456')
    expect(popover).toHaveTextContent('jane@example.com')
  })

  it('omits phone and email from the popover when the parent record has none', async () => {
    mockByStage({
      initialCall: { count: 1, results: [initialCallEnquiry] }, // parent: { full_name: 'Jane Doe' } only
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 0, results: [] },
    })
    renderPage()

    await screen.findByText('Jimmy Doe')
    const popover = screen.getByRole('tooltip')
    expect(popover).toHaveTextContent('Parent: Jane Doe')
  })

  it('on a mouse pointer, clicking the student name follows the link as normal (hover alone reveals the popover)', async () => {
    const restoreHover = stubHover(true) // has real hover, i.e. not a touch pointer
    mockByStage({
      initialCall: { count: 1, results: [initialCallEnquiry] },
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 0, results: [] },
    })
    renderPageWithLocationProbe()

    await screen.findByText('Jimmy Doe')
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/')

    fireEvent.click(screen.getByText('Jimmy Doe'))

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/enquiries/5')
    restoreHover()
  })

  it('on a touch pointer, clicking the student name toggles the popover open instead of navigating', async () => {
    const restoreHover = stubHover(false) // no real hover, i.e. a touch pointer
    mockByStage({
      initialCall: { count: 1, results: [initialCallEnquiry] },
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 0, results: [] },
    })
    const { container } = renderPageWithLocationProbe()

    await screen.findByText('Jimmy Doe')
    const nameWrap = container.querySelector('.onboarding-row__name-wrap')
    expect(nameWrap.className).not.toContain('onboarding-row__name-wrap--open')

    fireEvent.click(screen.getByText('Jimmy Doe'))
    expect(nameWrap.className).toContain('onboarding-row__name-wrap--open')
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/') // did not navigate

    fireEvent.click(screen.getByText('Jimmy Doe'))
    expect(nameWrap.className).not.toContain('onboarding-row__name-wrap--open')
    restoreHover()
  })

  it('shows time in the current stage counted from creation when the enquiry has never changed stage', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-06T00:00:00Z')) // 5 days after created_at
    mockByStage({
      initialCall: { count: 1, results: [initialCallEnquiry] }, // created_at 2026-08-01, no stage_history
      meetingSet: { count: 0, results: [] },
      invoiced: { count: 0, results: [] },
    })
    renderPage()

    expect(await screen.findByText('5d in stage')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('resets the stage clock to the last stage change instead of creation, once a record has moved stages', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-12T00:00:00Z'))
    const movedEnquiry = {
      id: 7,
      student_name: 'Thandiwe Zulu',
      parent: { full_name: 'Nomsa Zulu' },
      stage: 'MEETING_SET',
      meeting_datetime: null,
      created_at: '2026-08-01T00:00:00Z', // 11 days ago - would read "11d" if creation were used
      stage_history: [
        { from_stage: null, to_stage: 'INITIAL_CALL', changed_at: '2026-08-01T00:00:00Z' },
        { from_stage: 'INITIAL_CALL', to_stage: 'MEETING_SET', changed_at: '2026-08-10T00:00:00Z' }, // 2 days ago
      ],
    }
    mockByStage({
      initialCall: { count: 0, results: [] },
      meetingSet: { count: 1, results: [movedEnquiry] },
      invoiced: { count: 0, results: [] },
    })
    renderPage()

    expect(await screen.findByText('2d in stage')).toBeInTheDocument()
    expect(screen.queryByText('11d in stage')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
