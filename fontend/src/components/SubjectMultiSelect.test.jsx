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

describe('SubjectMultiSelect grouped by level', () => {
  const catalog = [
    { id: 10, name: 'Mathematics', level: 3, level_name: 'IGCSE' },
    { id: 11, name: 'Physics', level: 3, level_name: 'IGCSE' },
    { id: 20, name: 'Mathematics', level: 4, level_name: 'A Level' },
  ]

  it('shows a heading per level and names each chip with its level', () => {
    render(<SubjectMultiSelect subjects={catalog} selectedIds={[20]} onChange={() => {}} />)

    expect(screen.getByText('IGCSE')).toBeInTheDocument()
    expect(screen.getByText('A Level')).toBeInTheDocument()
    expect(screen.getByLabelText('A Level Mathematics')).toBeChecked()
    expect(screen.getByLabelText('IGCSE Mathematics')).not.toBeChecked()
  })

  it('toggles the right one of two same-named subjects', () => {
    const onChange = vi.fn()
    render(<SubjectMultiSelect subjects={catalog} selectedIds={[]} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('IGCSE Mathematics'))

    expect(onChange).toHaveBeenCalledWith([10])
  })

  it('takes a custom legend', () => {
    render(<SubjectMultiSelect subjects={catalog} selectedIds={[]} onChange={() => {}} legend="Subjects taught" />)
    expect(screen.getByRole('group', { name: 'Subjects taught' })).toBeInTheDocument()
  })

  it('can hide the legend visually while keeping the group named', () => {
    render(<SubjectMultiSelect subjects={catalog} selectedIds={[]} onChange={() => {}} legend="Subjects taught" hideLegend />)
    expect(screen.getByText('Subjects taught')).toHaveClass('visually-hidden')
    expect(screen.getByRole('group', { name: 'Subjects taught' })).toBeInTheDocument()
  })
})
