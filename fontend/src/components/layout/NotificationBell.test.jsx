import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationBell } from './NotificationBell'

const mockList = vi.fn()
const mockMarkRead = vi.fn()
vi.mock('../../lib/api', () => ({
  notificationsApi: {
    list: (...a) => mockList(...a),
    markRead: (...a) => mockMarkRead(...a),
  },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const now = new Date().toISOString()
const feed = {
  unread_count: 2,
  results: [
    { id: 2, message: 'Tam Tutor asked to change their subjects.', link: '/users/change-requests', created_at: now, is_read: false },
    { id: 1, message: 'Old news', link: '', created_at: now, is_read: true },
  ],
}

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockList.mockReset().mockResolvedValue(feed)
  mockMarkRead.mockReset().mockResolvedValue({})
  mockNavigate.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NotificationBell', () => {
  it('shows the unread count on the bell', async () => {
    renderBell()
    expect(await screen.findByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('caps the badge at 9+', async () => {
    mockList.mockResolvedValue({ unread_count: 14, results: [] })
    renderBell()
    expect(await screen.findByText('9+')).toBeInTheDocument()
  })

  it('has no badge when everything is read', async () => {
    mockList.mockResolvedValue({ unread_count: 0, results: [] })
    renderBell()
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('lists recent items and opens one: marks it read and goes to its page', async () => {
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))

    fireEvent.click(await screen.findByRole('menuitem', { name: /Tam Tutor asked/ }))

    expect(mockMarkRead).toHaveBeenCalledWith(2)
    expect(mockNavigate).toHaveBeenCalledWith('/users/change-requests')
    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument()
  })

  it('does not re-mark an already read item', async () => {
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Old news/ }))
    expect(mockMarkRead).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('says when there is nothing', async () => {
    mockList.mockResolvedValue({ unread_count: 0, results: [] })
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(await screen.findByText('Nothing new.')).toBeInTheDocument()
  })

  it('polls for new notifications', async () => {
    vi.useFakeTimers()
    renderBell()
    await act(async () => {})
    expect(mockList).toHaveBeenCalledTimes(1)
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(mockList).toHaveBeenCalledTimes(2)
  })

  it('keeps quiet when the server is unreachable', async () => {
    mockList.mockRejectedValue(new Error('offline'))
    renderBell()
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })
})
