import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubjectCreatePage } from './SubjectCreatePage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ApiError } from '../lib/apiClient'

const mockListLevels = vi.fn()
const mockCreateSubject = vi.fn()

vi.mock('../lib/api', () => ({
  academicsApi: {
    createSubject: (...args) => mockCreateSubject(...args),
    listLevels: (...args) => mockListLevels(...args),
  },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage() {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter>
          <SubjectCreatePage />
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  mockListLevels.mockReset().mockResolvedValue([
    { id: 3, name: 'IGCSE' },
    { id: 4, name: 'A Level' },
  ])
  mockCreateSubject.mockReset()
  mockNavigate.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SubjectCreatePage', () => {
  it('renders the catalog fields, with levels loaded into the dropdown and no tutor picker', async () => {
    renderPage()

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Syllabus code')).toBeInTheDocument()
    expect(screen.getByLabelText('Core and Extended papers')).not.toBeChecked()
    expect(screen.getByLabelText(/Active/)).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'A Level' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Tutor')).not.toBeInTheDocument()
  })

  it('defaults Active to checked', () => {
    renderPage()

    expect(screen.getByLabelText(/Active/)).toBeChecked()
  })

  it('has no timetable fields - students are booked with their own weekly times', () => {
    renderPage()

    expect(screen.queryByLabelText(/timetable slot/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument()
    expect(screen.getByText(/Students are booked into a subject, with their weekly times/i)).toBeInTheDocument()
  })

  it('submits level, name, code and the paper flag, without a timetable slot', async () => {
    mockCreateSubject.mockResolvedValue({ id: 5 })
    renderPage()
    await screen.findByRole('option', { name: 'IGCSE' })

    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Chemistry' } })
    fireEvent.change(screen.getByLabelText('Syllabus code'), { target: { value: '0620' } })
    fireEvent.click(screen.getByLabelText('Core and Extended papers'))
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }))

    await waitFor(() =>
      expect(mockCreateSubject).toHaveBeenCalledWith({
        name: 'Chemistry',
        level: 3,
        code: '0620',
        has_paper: true,
        is_active: true,
      }),
    )
  })

  it('shows a confirmation toast and navigates to the new subject on success', async () => {
    mockCreateSubject.mockResolvedValue({ id: 7 })
    renderPage()

    await screen.findByRole('option', { name: 'IGCSE' })
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Geography' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }))

    expect(await screen.findByText('Subject created')).toBeInTheDocument()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/subjects/7', { replace: true }))
  })

  it('shows field errors from the API and does not navigate', async () => {
    mockCreateSubject.mockRejectedValue(new ApiError(400, { name: ['This field is required.'] }))
    renderPage()
    await screen.findByRole('option', { name: 'IGCSE' })

    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Chemistry' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }))

    expect(await screen.findByText('This field is required.')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('has a Cancel link back to the subjects list', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/subjects')
  })
})
