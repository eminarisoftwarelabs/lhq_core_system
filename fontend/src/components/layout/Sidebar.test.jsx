import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('shows staff-only navigation items for staff-level users', () => {
    render(
      <MemoryRouter>
        <Sidebar isStaffLevel onClose={vi.fn()} />
      </MemoryRouter>,
    )

    for (const label of ['Dashboard', 'Onboarding', 'Students', 'Subjects', 'Timetable', 'Invoices', 'Users', 'My Profile']) {
      expect(screen.getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }
  })

  it('hides staff-only navigation items for non-staff users', () => {
    render(
      <MemoryRouter>
        <Sidebar isStaffLevel={false} onClose={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('link', { name: /onboarding/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /students/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^invoices$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^users$/i })).not.toBeInTheDocument()

    expect(screen.getByRole('link', { name: /^dashboard$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /subjects/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /timetable/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my profile/i })).toBeInTheDocument()
  })

  it('renders the secondary footer links', () => {
    render(
      <MemoryRouter>
        <Sidebar isStaffLevel={false} onClose={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Data Privacy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Legal Notice' })).toHaveAttribute('href', '/legal-notice')
    expect(screen.getByRole('link', { name: 'Cookies' })).toHaveAttribute('href', '/cookies')
  })

  it('calls onClose when a navigation item is clicked (mobile drawer dismissal)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <Sidebar isStaffLevel={false} isOpen onClose={onClose} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name: /subjects/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the mobile backdrop is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(
      <MemoryRouter>
        <Sidebar isStaffLevel={false} isOpen onClose={onClose} />
      </MemoryRouter>,
    )

    await user.click(container.querySelector('.sidebar-backdrop'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a "Collapse sidebar" toggle by default and calls onToggleCollapse when clicked', async () => {
    const user = userEvent.setup()
    const onToggleCollapse = vi.fn()
    render(
      <MemoryRouter>
        <Sidebar isStaffLevel={false} onClose={vi.fn()} onToggleCollapse={onToggleCollapse} />
      </MemoryRouter>,
    )

    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)

    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })

  it('shows an "Expand sidebar" toggle and the collapsed class when isCollapsed is true', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar isStaffLevel={false} onClose={vi.fn()} isCollapsed onToggleCollapse={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('.sidebar')).toHaveClass('sidebar--collapsed')
  })
})
