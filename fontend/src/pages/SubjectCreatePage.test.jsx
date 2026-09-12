import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubjectCreatePage } from './SubjectCreatePage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ApiError } from '../lib/apiClient'

const mockListTeaching = vi.fn()
const mockCreateSubject = vi.fn()

vi.mock('../lib/api', () => ({
  academicsApi: { createSubject: (...args) => mockCreateSubject(...args) },
  tutorsApi: { listTeaching: (...args) => mockListTeaching(...args) },
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
  mockListTeaching.mockReset().mockResolvedValue([{ id: 9, name: 'Grace Phiri' }])
  mockCreateSubject.mockReset()
  mockNavigate.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SubjectCreatePage', () => {
  it('renders the subject details fields, with tutors loaded into the dropdown', async () => {
    renderPage()

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText(/Active/)).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Grace Phiri' })).toBeInTheDocument()
  })

  it('defaults Active to checked', () => {
    renderPage()

    expect(screen.getByLabelText(/Active/)).toBeChecked()
  })

  it('has no timetable slot fields - scheduling happens on the Timetable page instead', () => {
    renderPage()

    expect(screen.queryByLabelText(/timetable slot/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument()
    expect(screen.getByText(/timetable slot from the Timetable page/i)).toBeInTheDocument()
  })

  it('submits the subject without a timetable slot', async () => {
    mockCreateSubject.mockResolvedValue({ id: 5 })
    renderPage()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Chemistry' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }))

    await waitFor(() =>
      expect(mockCreateSubject).toHaveBeenCalledWith({ name: 'Chemistry', is_active: true, tutor: null }),
    )
  })

  it('shows a confirmation toast and navigates to the new subject on success', async () => {
    mockCreateSubject.mockResolvedValue({ id: 7 })
    renderPage()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Geography' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }))

    expect(await screen.findByText('Subject created')).toBeInTheDocument()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/subjects/7', { replace: true }))
  })

  it('shows field errors from the API and does not navigate', async () => {
    mockCreateSubject.mockRejectedValue(new ApiError(400, { name: ['This field is required.'] }))
    renderPage()

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
