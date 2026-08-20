import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { NavBar } from './NavBar'

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

describe('NavBar', () => {
  it("shows the user's name alongside their role label", () => {
    mockUseAuth.mockReturnValue({
      user: { full_name: 'Wanangwa', role: 'OWNER' },
      isStaffLevel: true,
      logout: vi.fn(),
    })
    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>,
    )
    expect(screen.getByText('Wanangwa (Owner)')).toBeInTheDocument()
  })

  it('falls back to email when full_name is blank, still showing the role', () => {
    mockUseAuth.mockReturnValue({
      user: { full_name: '', email: 'tam@lhq.test', role: 'TUTOR' },
      isStaffLevel: false,
      logout: vi.fn(),
    })
    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>,
    )
    expect(screen.getByText('tam@lhq.test (Tutor)')).toBeInTheDocument()
  })
})
