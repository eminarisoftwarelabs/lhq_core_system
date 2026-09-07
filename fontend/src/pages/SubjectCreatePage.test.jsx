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
    expect(screen.getByLabelText(/Set a timetable slot now/)).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Grace Phiri' })).toBeInTheDocument()
  })

  it('defaults Active to checked and the timetable slot fields to hidden', () => {
    renderPage()

    expect(screen.getByLabelText(/Active/)).toBeChecked()
    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument()
  })

  it('reveals timetable slot fields when "set a timetable slot now" is checked', () => {
    renderPage()

    fireEvent.click(screen.getByLabelText(/Set a timetable slot now/))

    expect(screen.getByLabelText('Day')).toBeInTheDocument()
    expect(screen.getByLabelText('Start time')).toBeInTheDocument()
    expect(screen.getByLabelText('End time')).toBeInTheDocument()
  })

  it('submits the subject without a timetable slot when the checkbox is left unchecked', async () => {
    mockCreateSubject.mockResolvedValue({ id: 5 })
    renderPage()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Chemistry' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }))

    await waitFor(() =>
      expect(mockCreateSubject).toHaveBeenCalledWith({ name: 'Chemistry', is_active: true, tutor: null }),
    )
  })

  it('includes the timetable slot in the payload when set', async () => {
    mockCreateSubject.mockResolvedValue({ id: 6 })
    renderPage()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'French' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Grace Phiri' }))
    fireEvent.change(screen.getByLabelText('Tutor'), { target: { value: '9' } })
    fireEvent.click(screen.getByLabelText(/Set a timetable slot now/))
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '15:00' } })
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '16:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create subject' }))

    await waitFor(() =>
      expect(mockCreateSubject).toHaveBeenCalledWith({
        name: 'French',
        is_active: true,
        tutor: '9',
        timetable_slot: { day_of_week: 0, start_time: '15:00', end_time: '16:00' },
      }),
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
