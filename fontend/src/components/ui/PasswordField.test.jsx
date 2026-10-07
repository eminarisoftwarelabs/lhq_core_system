import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PasswordField } from './PasswordField'

describe('PasswordField', () => {
  it('is masked by default and labelled by its label', () => {
    render(<PasswordField id="pw" label="New password" value="secret" onChange={() => {}} />)

    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show new password' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reveals and re-hides the value with the toggle', () => {
    render(<PasswordField id="pw" label="New password" value="secret" onChange={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show new password' }))
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text')

    const hide = screen.getByRole('button', { name: 'Hide new password' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(hide)
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password')
  })

  it('reports typed text and passes input props through', () => {
    const onChange = vi.fn()
    render(
      <PasswordField id="pw" label="New password" value="" onChange={onChange} autoComplete="new-password" required />,
    )

    const input = screen.getByLabelText('New password')
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(onChange).toHaveBeenCalledWith('abc')
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('autocomplete', 'new-password')
  })

  it('does not submit the surrounding form when toggled', () => {
    const onSubmit = vi.fn((e) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <PasswordField id="pw" label="New password" value="x" onChange={() => {}} />
      </form>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Show new password' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('renders children (field errors) under the input', () => {
    render(
      <PasswordField id="pw" label="New password" value="" onChange={() => {}}>
        <p>Too short.</p>
      </PasswordField>,
    )

    expect(screen.getByText('Too short.')).toBeInTheDocument()
  })
})
