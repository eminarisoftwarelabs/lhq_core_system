import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SubjectMultiSelect } from './SubjectMultiSelect'

const subjects = [
  { id: 1, name: 'Maths' },
  { id: 2, name: 'Physics' },
]

describe('SubjectMultiSelect', () => {
  it('renders a checkbox per subject, checked according to selectedIds', () => {
    render(<SubjectMultiSelect subjects={subjects} selectedIds={[1]} onChange={() => {}} />)

    expect(screen.getByLabelText('Maths')).toBeChecked()
    expect(screen.getByLabelText('Physics')).not.toBeChecked()
  })

  it('calls onChange with the id added when an unchecked box is clicked', () => {
    const onChange = vi.fn()
    render(<SubjectMultiSelect subjects={subjects} selectedIds={[1]} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Physics'))

    expect(onChange).toHaveBeenCalledWith([1, 2])
  })

  it('calls onChange with the id removed when a checked box is clicked', () => {
    const onChange = vi.fn()
    render(<SubjectMultiSelect subjects={subjects} selectedIds={[1, 2]} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Maths'))

    expect(onChange).toHaveBeenCalledWith([2])
  })

  it('shows a note instead of a fieldset when there are no subjects', () => {
    render(<SubjectMultiSelect subjects={[]} selectedIds={[]} onChange={() => {}} />)

    expect(screen.getByText(/no active subjects/i)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
