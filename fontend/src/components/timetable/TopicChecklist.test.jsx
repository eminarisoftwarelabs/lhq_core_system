import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TopicChecklist } from './TopicChecklist'

const topics = [
  { id: 1, number: '1.1', name: 'Forces', covered_before: true },
  { id: 2, number: '', name: 'Energy', covered_before: false },
]

describe('TopicChecklist', () => {
  it('ticks the selected topics and marks earlier ones done', () => {
    render(<TopicChecklist topics={topics} selected={[2]} onChange={vi.fn()} label="Topics" />)
    expect(screen.getByRole('checkbox', { name: /Energy/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /1.1 Forces/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: '1.1 Forces (done)' })).toBeInTheDocument()
  })

  it('toggles a topic in and out', () => {
    const onChange = vi.fn()
    render(<TopicChecklist topics={topics} selected={[2]} onChange={onChange} label="Topics" />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Forces/ }))
    expect(onChange).toHaveBeenLastCalledWith([2, 1])
    fireEvent.click(screen.getByRole('checkbox', { name: /Energy/ }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('says when there are no topics', () => {
    render(<TopicChecklist topics={[]} selected={[]} onChange={vi.fn()} label="Topics" />)
    expect(screen.getByText('No topics for this subject yet.')).toBeInTheDocument()
  })
})
