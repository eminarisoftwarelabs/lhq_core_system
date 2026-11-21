import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentsListPage } from './StudentsListPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'

const mockSearch = vi.fn()
vi.mock('../lib/api', () => ({
  clientsApi: { searchStudents: (...args) => mockSearch(...args) },
}))

function renderPage() {
  return render(
    <PageHeaderProvider>
      <MemoryRouter>
        <StudentsListPage />
      </MemoryRouter>
    </PageHeaderProvider>,
  )
}

const student = (id, name, enrolled_on) => ({ id, full_name: name, student_number: `STU-${id}`, school: 'Kamuzu', enrolled_on })

beforeEach(() => {
  // Only Date is faked, so debounce timers and waitFor still run for real.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 21, 12) })
  mockSearch.mockReset().mockResolvedValue({
    count: 5,
    next: null,
    results: [
      student(2, 'Bob Chen', '2026-11-02'),
      student(3, 'Cara Zulu', '2026-11-14'),
      student(1, 'Alice Wang', '2026-10-30'),
      student(4, 'Dan Phiri', '2026-09-05'),
      student(5, 'Eve Mussa', '2026-08-12'),
    ],
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('StudentsListPage', () => {
  it('groups students under their enrolment month, newest first, names only', async () => {
    renderPage()
    await screen.findByText('Bob Chen')

    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['November 20262 students', 'October 20261 student', 'September 20261 student', 'August 20261 student'])

    const november = within(screen.getByRole('list', { name: 'November 2026' }))
    expect(november.getAllByRole('link').map((a) => a.textContent)).toEqual(['Bob Chen', 'Cara Zulu'])
    expect(screen.queryByText(/STU-/)).not.toBeInTheDocument()
    expect(screen.queryByText('Kamuzu')).not.toBeInTheDocument()
  })

  it('lists names in name order inside a month, whatever order the API sends', async () => {
    mockSearch.mockResolvedValue({
      next: null,
      results: [student(1, 'Zione Tembo', '2026-11-20'), student(2, 'Alice Wang', '2026-11-03'), student(3, 'Mayamiko Tembo', '2026-11-10')],
    })
    renderPage()
    const november = within(await screen.findByRole('list', { name: 'November 2026' }))
    expect(november.getAllByRole('link').map((a) => a.textContent)).toEqual(['Alice Wang', 'Mayamiko Tembo', 'Zione Tembo'])
  })

  it('opens this month and last month, and closes older ones until clicked', async () => {
    renderPage()
    await screen.findByText('Bob Chen')

    const toggle = (name) => screen.getByRole('button', { name: new RegExp(name) })
    expect(toggle('November')).toHaveAttribute('aria-expanded', 'true')
    expect(toggle('October')).toHaveAttribute('aria-expanded', 'true')
    expect(toggle('September')).toHaveAttribute('aria-expanded', 'false')
    expect(toggle('August')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Alice Wang')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Dan Phiri' })).not.toBeInTheDocument()
    expect(toggle('September')).toHaveTextContent('1 student')

    fireEvent.click(toggle('September'))
    expect(toggle('September')).toHaveAttribute('aria-expanded', 'true')
    expect(toggle('September')).toHaveAttribute('aria-controls', 'month-2026-09')
    expect(screen.getByRole('link', { name: 'Dan Phiri' })).toBeVisible()

    fireEvent.click(toggle('November'))
    expect(toggle('November')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Bob Chen' })).not.toBeInTheDocument()
  })

  it('opens every month when there are only one or two', async () => {
    mockSearch.mockResolvedValue({ next: null, results: [student(1, 'Old One', '2026-03-01'), student(2, 'Old Two', '2026-02-01')] })
    renderPage()
    expect(await screen.findByRole('link', { name: 'Old One' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Old Two' })).toBeVisible()
  })

  it('has no count next to the card title, and counts each month in words', async () => {
    renderPage()
    await screen.findByText('Bob Chen')
    expect(screen.getByRole('heading', { level: 2, name: 'Students' })).toHaveTextContent(/^Students$/)
    expect(screen.getByRole('button', { name: /November/ })).toHaveTextContent('2 students')
    expect(screen.getAllByText('1 student')).toHaveLength(3)
  })

  it('opens the student page from a name', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: 'Alice Wang' })).toHaveAttribute('href', '/students/1')
  })

  it('shows no month that has no students', async () => {
    renderPage()
    await screen.findByText('Bob Chen')
    expect(screen.queryByRole('region', { name: /December 2026/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /September 2026/ })).not.toBeInTheDocument()
  })

  it('reads every page so a month is never split, and counts all students', async () => {
    mockSearch.mockImplementation((q, page) =>
      Promise.resolve(
        page === 1
          ? { next: 'p2', results: [student(1, 'First Page', '2026-11-20')] }
          : { next: null, results: [student(2, 'Second Page', '2026-11-03')] },
      ),
    )
    renderPage()
    const november = within(await screen.findByRole('list', { name: 'November 2026' }))
    expect(await november.findByRole('link', { name: 'Second Page' })).toBeInTheDocument()
    expect(november.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('November 20262 students')
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('debounces the search, opens every month with a match and shows only those', async () => {
    renderPage()
    await screen.findByText('Bob Chen')
    mockSearch.mockClear()
    mockSearch.mockResolvedValue({ next: null, results: [student(3, 'Cara Zulu', '2026-11-14'), student(4, 'Dan Phiri', '2026-09-05')] })

    fireEvent.change(screen.getByLabelText(/search by name or student number/i), { target: { value: 'a' } })

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('a', 1), { timeout: 1000 })
    expect(mockSearch).toHaveBeenCalledTimes(1)
    // September is closed by default but opens for its match; months with no match are gone.
    expect(await screen.findByRole('link', { name: 'Dan Phiri' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Cara Zulu' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /October/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /August/ })).not.toBeInTheDocument()
  })

  it('returns to the default open months when the search is cleared', async () => {
    renderPage()
    await screen.findByText('Bob Chen')
    const box = screen.getByLabelText(/search by name or student number/i)
    mockSearch.mockResolvedValue({ next: null, results: [student(4, 'Dan Phiri', '2026-09-05')] })
    fireEvent.change(box, { target: { value: 'dan' } })
    expect(await screen.findByRole('link', { name: 'Dan Phiri' })).toBeVisible()

    mockSearch.mockResolvedValue({
      next: null,
      results: [student(2, 'Bob Chen', '2026-11-02'), student(1, 'Alice Wang', '2026-10-30'), student(4, 'Dan Phiri', '2026-09-05')],
    })
    fireEvent.change(box, { target: { value: '' } })
    expect(await screen.findByRole('link', { name: 'Bob Chen' })).toBeVisible()
    expect(screen.getByRole('button', { name: /September/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Dan Phiri' })).not.toBeInTheDocument()
  })

  it('says so when no students match', async () => {
    mockSearch.mockResolvedValue({ next: null, results: [] })
    renderPage()
    expect(await screen.findByText('No students found.')).toBeInTheDocument()
  })

  it('shows a load failure', async () => {
    mockSearch.mockRejectedValue(new Error('offline'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load students.')
  })
})
