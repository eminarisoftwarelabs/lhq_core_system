import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UsersListPage } from './UsersListPage'

const mockList = vi.fn()
const mockUpdate = vi.fn()
vi.mock('../lib/api', () => ({
  usersApi: {
    list: (...args) => mockList(...args),
    update: (...args) => mockUpdate(...args),
  },
}))

const activeTutor = {
  id: 2,
  email: 'tutor@lhq.test',
  full_name: 'Tam Tutor',
  role: 'TUTOR',
  is_active: true,
}
const deactivatedAdmin = {
  id: 3,
  email: 'admin@lhq.test',
  full_name: 'Adi Admin',
  role: 'ADMIN',
  is_active: false,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <UsersListPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockList.mockReset()
  mockUpdate.mockReset()
  mockList.mockResolvedValue({
    count: 2,
    next: null,
    previous: null,
    results: [activeTutor, deactivatedAdmin],
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UsersListPage row actions', () => {
  it('renders an Edit link and a Deactivate/Reactivate button per row, matching each user\'s status', async () => {
    renderPage()

    await screen.findByText('Tam Tutor')

    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
    expect(within(rows[2]).getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })

  it('deactivating asks for confirmation, and does nothing if declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    renderPage()
    await screen.findByText('Tam Tutor')

    fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate' })[0])

    expect(window.confirm).toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('deactivating a user PATCHes is_active:false and reloads the list on confirm', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    mockUpdate.mockResolvedValueOnce({ ...activeTutor, is_active: false })
    renderPage()
    await screen.findByText('Tam Tutor')

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(2, { is_active: false }))
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
  })

  it('reactivating a user does not prompt for confirmation', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    mockUpdate.mockResolvedValueOnce({ ...deactivatedAdmin, is_active: true })
    renderPage()
    await screen.findByText('Adi Admin')

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(3, { is_active: true }))
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('shows an error and leaves the row alone if the update fails', async () => {
    const { ApiError } = await import('../lib/apiClient')
    vi.stubGlobal('confirm', vi.fn(() => true))
    mockUpdate.mockRejectedValueOnce(new ApiError(403, { detail: 'You do not have permission to edit this user.' }))
    renderPage()
    await screen.findByText('Tam Tutor')

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))

    expect(await screen.findByText('You do not have permission to edit this user.')).toBeInTheDocument()
    expect(mockList).toHaveBeenCalledTimes(1)
  })
})
