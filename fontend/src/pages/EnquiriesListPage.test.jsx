import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnquiriesListPage } from './EnquiriesListPage'

const mockList = vi.fn()
vi.mock('../lib/api', () => ({
  enquiriesApi: {
    list: (...args) => mockList(...args),
  },
}))

const enquiry = {
  id: 5,
  student_name: 'Jimmy Doe',
  parent: { full_name: 'Jane Doe' },
  stage: 'INITIAL_CALL',
  desired_start_date: '2026-02-01',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <EnquiriesListPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockList.mockReset()
  mockList.mockResolvedValue({ count: 1, results: [enquiry] })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EnquiriesListPage', () => {
  it('loads with no stage filter on mount', async () => {
    renderPage()

    expect(await screen.findByText('Jimmy Doe')).toBeInTheDocument()
    expect(mockList).toHaveBeenCalledWith({})
  })

  it('re-fetches with the selected stage when the filter changes', async () => {
    renderPage()
    await screen.findByText('Jimmy Doe')
    mockList.mockClear()

    fireEvent.change(screen.getByLabelText('Filter by stage'), { target: { value: 'MEETING_SET' } })

    await waitFor(() => expect(mockList).toHaveBeenCalledWith({ stage: 'MEETING_SET' }))
  })

  it('links each row to its enquiry detail page', async () => {
    renderPage()
    await screen.findByText('Jimmy Doe')

    expect(screen.getByRole('link', { name: 'Jimmy Doe' })).toHaveAttribute('href', '/enquiries/5')
  })
})
