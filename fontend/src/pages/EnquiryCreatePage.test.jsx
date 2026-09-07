import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnquiryCreatePage } from './EnquiryCreatePage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ApiError } from '../lib/apiClient'

const mockListSubjects = vi.fn()
const mockListSchools = vi.fn()
const mockCreate = vi.fn()

vi.mock('../lib/api', () => ({
  academicsApi: {
    listSubjects: (...args) => mockListSubjects(...args),
    listSchools: (...args) => mockListSchools(...args),
  },
  enquiriesApi: { create: (...args) => mockCreate(...args) },
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
          <EnquiryCreatePage />
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

async function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Jane Doe' } })
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0891234567' } })
  fireEvent.change(screen.getByLabelText('Student name'), { target: { value: 'Jimmy Doe' } })
  fireEvent.change(screen.getByLabelText('Year / class'), { target: { value: '7' } })
  await screen.findByRole('option', { name: 'Kamuzu Academy' })
  fireEvent.change(screen.getByLabelText('School'), { target: { value: 'Kamuzu Academy' } })
}

beforeEach(() => {
  mockListSubjects.mockReset().mockResolvedValue({ results: [{ id: 1, name: 'Maths', is_active: true }] })
  mockListSchools.mockReset().mockResolvedValue({ results: [{ id: 1, name: 'Kamuzu Academy', is_active: true }] })
  mockCreate.mockReset()
  mockNavigate.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EnquiryCreatePage', () => {
  it('renders the Parent, Student and Program details sections with their fields', async () => {
    renderPage()

    expect(await screen.findByText('Parent')).toBeInTheDocument()
    expect(screen.getByText('Student')).toBeInTheDocument()
    expect(screen.getByText('Program details')).toBeInTheDocument()

    expect(screen.getByLabelText('Full name')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Address')).toBeInTheDocument()
    expect(screen.getByLabelText('City')).toBeInTheDocument()
    expect(screen.getByLabelText('Student name')).toBeInTheDocument()
    expect(screen.getByLabelText('Year / class')).toBeInTheDocument()
    expect(screen.getByLabelText('School')).toBeInTheDocument()
    expect(screen.getByLabelText('Student phone')).toBeInTheDocument()
    expect(screen.getByLabelText('Student email')).toBeInTheDocument()
    expect(screen.getByLabelText('Grade')).toBeInTheDocument()
    expect(screen.getByLabelText('Duration (weeks)')).toBeInTheDocument()
    expect(screen.getByLabelText('Learning mode')).toBeInTheDocument()
    expect(screen.getByLabelText('Desired start date')).toBeInTheDocument()
    expect(await screen.findByLabelText('Maths')).toBeInTheDocument()
  })

  it('shows the desired start date as a custom calendar picker, not the native date input', async () => {
    renderPage()
    await screen.findByText('Parent')

    const field = screen.getByLabelText('Desired start date')
    expect(field.tagName).toBe('BUTTON')
    expect(field).toHaveTextContent('Select date')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(field)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('offers Year 1 through Year 13 in the year/class dropdown', async () => {
    renderPage()
    await screen.findByText('Parent')

    const select = screen.getByLabelText('Year / class')
    const optionLabels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(optionLabels).toEqual(['Select year', ...Array.from({ length: 13 }, (_, i) => `Year ${i + 1}`)])
  })

  it('fetches active schools and lists them in the School dropdown, with Other last', async () => {
    mockListSchools.mockResolvedValue({
      results: [
        { id: 1, name: 'Kamuzu Academy', is_active: true },
        { id: 2, name: 'Bishop Mackenzie International School', is_active: true },
      ],
    })
    renderPage()
    await screen.findByText('Parent')

    expect(mockListSchools).toHaveBeenCalledWith({ is_active: true })
    const select = await screen.findByLabelText('School')
    const optionLabels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(optionLabels).toEqual([
      'Select school',
      'Kamuzu Academy',
      'Bishop Mackenzie International School',
      'Other',
    ])
  })

  it('reveals a free-text field for a school name when Other is picked, and hides it otherwise', async () => {
    renderPage()
    await screen.findByRole('option', { name: 'Kamuzu Academy' })

    expect(screen.queryByLabelText('School name')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('School'), { target: { value: 'OTHER' } })
    expect(screen.getByLabelText('School name')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('School'), { target: { value: 'Kamuzu Academy' } })
    expect(screen.queryByLabelText('School name')).not.toBeInTheDocument()
  })

  it('submits the typed name when Other is picked for the school', async () => {
    mockCreate.mockResolvedValue({ id: 44 })
    renderPage()

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Jane Doe' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0891234567' } })
    fireEvent.change(screen.getByLabelText('Student name'), { target: { value: 'Jimmy Doe' } })
    fireEvent.change(screen.getByLabelText('Year / class'), { target: { value: '7' } })
    await screen.findByRole('option', { name: 'Kamuzu Academy' })
    fireEvent.change(screen.getByLabelText('School'), { target: { value: 'OTHER' } })
    fireEvent.change(screen.getByLabelText('School name'), { target: { value: 'Nkhoma Girls Secondary' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create enquiry' }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ student_school: 'Nkhoma Girls Secondary' }),
      ),
    )
  })

  it('does not require the Grade field', async () => {
    renderPage()
    await screen.findByText('Parent')

    expect(screen.getByLabelText('Grade')).not.toBeRequired()
  })

  it('submits the full payload, shows a confirmation toast, and navigates to Onboarding on success', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T00:00:00'))
    mockCreate.mockResolvedValue({ id: 42 })
    renderPage()

    await fillRequiredFields()
    fireEvent.click(await screen.findByLabelText('Maths'))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.com' } })
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '15 Chilobwe Road' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Blantyre' } })
    fireEvent.change(screen.getByLabelText('Student phone'), { target: { value: '0888123456' } })
    fireEvent.change(screen.getByLabelText('Student email'), { target: { value: 'jimmy@example.com' } })
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: 'Form 3' } })
    fireEvent.change(screen.getByLabelText('Duration (weeks)'), { target: { value: '8' } })
    fireEvent.click(screen.getByLabelText('Desired start date'))
    fireEvent.click(document.querySelector('.rdp-today .rdp-day_button'))

    fireEvent.click(screen.getByRole('button', { name: 'Create enquiry' }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        parent: {
          full_name: 'Jane Doe',
          phone: '0891234567',
          email: 'jane@example.com',
          address: '15 Chilobwe Road',
          city: 'Blantyre',
        },
        student_name: 'Jimmy Doe',
        student_year_group: 7,
        student_school: 'Kamuzu Academy',
        student_phone: '0888123456',
        student_email: 'jimmy@example.com',
        student_grade: 'Form 3',
        subject_ids: [1],
        duration_weeks: 8,
        learning_mode: null,
        desired_start_date: '2026-10-01',
      }),
    )
    expect(await screen.findByText('New enquiry created')).toBeInTheDocument()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/enquiries', { replace: true }))
    vi.useRealTimers()
  })

  it('submits with student_year_group null and blanks for the optional student contact fields when left empty', async () => {
    mockCreate.mockResolvedValue({ id: 43 })
    renderPage()

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Jane Doe' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0891234567' } })
    fireEvent.change(screen.getByLabelText('Student name'), { target: { value: 'Jimmy Doe' } })
    fireEvent.change(screen.getByLabelText('Year / class'), { target: { value: '3' } })
    await screen.findByRole('option', { name: 'Kamuzu Academy' })
    fireEvent.change(screen.getByLabelText('School'), { target: { value: 'Kamuzu Academy' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create enquiry' }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          student_year_group: 3,
          student_phone: '',
          student_email: '',
          student_grade: '',
        }),
      ),
    )
  })

  it('shows field errors from the API and does not navigate', async () => {
    mockCreate.mockRejectedValue(new ApiError(400, { student_name: ['This field is required.'] }))
    renderPage()

    await fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: 'Create enquiry' }))

    expect(await screen.findByText('This field is required.')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows a generic error when the API fails without field detail', async () => {
    mockCreate.mockRejectedValue(new Error('network error'))
    renderPage()

    await fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: 'Create enquiry' }))

    expect(await screen.findByText('Could not create the enquiry.')).toBeInTheDocument()
  })
})
