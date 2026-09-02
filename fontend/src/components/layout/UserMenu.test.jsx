import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { UserMenu } from './UserMenu'

function renderMenu(user, onLogout = vi.fn()) {
  return render(
    <MemoryRouter>
      <UserMenu user={user} onLogout={onLogout} />
    </MemoryRouter>,
  )
}

describe('UserMenu', () => {
  it('renders nothing when there is no user', () => {
    const { container } = renderMenu(null)
    expect(container).toBeEmptyDOMElement()
  })

  it('is closed until the trigger is activated, then shows the name and role', async () => {
    const user = userEvent.setup()
    renderMenu({ full_name: 'Wanangwa', role: 'OWNER' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /account menu for wanangwa/i }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Wanangwa')).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
  })

  it('falls back to email when full_name is blank, still showing the role', async () => {
    const user = userEvent.setup()
    renderMenu({ full_name: '', email: 'tam@lhq.test', role: 'TUTOR' })

    await user.click(screen.getByRole('button', { name: /account menu for tam@lhq.test/i }))

    expect(screen.getByText('tam@lhq.test')).toBeInTheDocument()
    expect(screen.getByText('Tutor')).toBeInTheDocument()
  })

  it('calls onLogout and closes the menu when "Log out" is clicked', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn().mockResolvedValue(undefined)
    renderMenu({ full_name: 'Wanangwa', role: 'OWNER' }, onLogout)

    await user.click(screen.getByRole('button', { name: /account menu/i }))
    await user.click(screen.getByRole('menuitem', { name: /log out/i }))

    expect(onLogout).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('closes the menu on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderMenu({ full_name: 'Wanangwa', role: 'OWNER' })

    const trigger = screen.getByRole('button', { name: /account menu/i })
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes when clicking outside the menu', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <div>
          <button type="button">Outside</button>
          <UserMenu user={{ full_name: 'Wanangwa', role: 'OWNER' }} onLogout={vi.fn()} />
        </div>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Outside' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
