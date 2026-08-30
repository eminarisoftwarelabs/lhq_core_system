import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentsListPage } from './StudentsListPage'

const mockSearch = vi.fn()
vi.mock('../lib/api', () => ({
  clientsApi: {
    searchStudents: (...args) => mockSearch(...args),
  },
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <StudentsListPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockSearch.mockReset()
  mockSearch.mockResolvedValue({
    count: 1,
    results: [{ id: 1, full_name: 'Alice Wang', student_number: 'STU-000001', grade: '7' }],
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('StudentsListPage', () => {
  it('loads and shows results for an empty query on mount', async () => {
    renderPage()

    expect(await screen.findByText('Alice Wang')).toBeInTheDocument()
    expect(mockSearch).toHaveBeenCalledWith('')
  })

  it('debounces the search query - typing does not fire a request per keystroke', async () => {
    renderPage()
    await screen.findByText('Alice Wang')
    mockSearch.mockClear()

    fireEvent.change(screen.getByLabelText(/search by name or student number/i), {
      target: { value: 'alice' },
    })

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('alice'), { timeout: 1000 })
    expect(mockSearch).toHaveBeenCalledTimes(1)
  })

  it('shows a message when no students are found', async () => {
    mockSearch.mockResolvedValue({ count: 0, results: [] })
    renderPage()

    expect(await screen.findByText('No students found.')).toBeInTheDocument()
  })
})
