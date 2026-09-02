import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

const mockUseTheme = vi.fn()
vi.mock('../../theme/useTheme', () => ({
  useTheme: () => mockUseTheme(),
}))

describe('ThemeToggle', () => {
  it('shows a "switch to dark mode" affordance while light', () => {
    mockUseTheme.mockReturnValue({ theme: 'light', toggleTheme: vi.fn() })
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
  })

  it('shows a "switch to light mode" affordance while dark', () => {
    mockUseTheme.mockReturnValue({ theme: 'dark', toggleTheme: vi.fn() })
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
  })

  it('calls toggleTheme when clicked', async () => {
    const user = userEvent.setup()
    const toggleTheme = vi.fn()
    mockUseTheme.mockReturnValue({ theme: 'light', toggleTheme })
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }))

    expect(toggleTheme).toHaveBeenCalledTimes(1)
  })
})
