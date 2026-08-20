import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldErrors, NonFieldErrors } from './FieldErrors'

describe('FieldErrors', () => {
  it('renders each message for the given field', () => {
    render(<FieldErrors errors={{ password: ['Too short.', 'Too common.']}} field="password" />)
    expect(screen.getByText('Too short.')).toBeInTheDocument()
    expect(screen.getByText('Too common.')).toBeInTheDocument()
  })

  it('renders nothing when the field has no errors', () => {
    const { container } = render(<FieldErrors errors={{ other: ['x'] }} field="password" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('NonFieldErrors', () => {
  it('renders a single string detail (e.g. PermissionDenied) without double-nesting', () => {
    render(<NonFieldErrors errors={{ detail: 'You cannot delete your own account.' }} />)
    expect(screen.getByText('You cannot delete your own account.')).toBeInTheDocument()
  })

  it('renders an array detail (e.g. an explicit {detail: [...]} from a view) flattened correctly', () => {
    render(<NonFieldErrors errors={{ detail: ['Cannot delete: this user has subjects assigned.'] }} />)
    expect(screen.getByText('Cannot delete: this user has subjects assigned.')).toBeInTheDocument()
  })

  it('falls back to non_field_errors when there is no detail key', () => {
    render(<NonFieldErrors errors={{ non_field_errors: ['Invalid setup link.'] }} />)
    expect(screen.getByText('Invalid setup link.')).toBeInTheDocument()
  })

  it('renders nothing when there are no errors', () => {
    const { container } = render(<NonFieldErrors errors={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
