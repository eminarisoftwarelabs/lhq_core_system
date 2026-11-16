import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChangeRequestDiff } from './ChangeRequestDiff'

const maths = { id: 1, name: 'Mathematics', level: 3, level_name: 'IGCSE' }
const physics = { id: 2, name: 'Physics', level: 3, level_name: 'IGCSE' }
const aPhysics = { id: 3, name: 'Physics', level: 4, level_name: 'A Level' }

function column(title) {
  return screen.getByText(title).closest('.change-diff__column')
}

describe('ChangeRequestDiff', () => {
  it('marks subjects removed on the current side and added on the proposed side', () => {
    render(<ChangeRequestDiff kind="SUBJECTS" current={[maths, physics]} proposed={[physics, aPhysics]} />)

    const current = within(column('Current'))
    expect(current.getByText('IGCSE Mathematics').closest('li')).toHaveClass('change-diff__item--removed')
    expect(current.getByText('IGCSE Physics').closest('li')).not.toHaveClass('change-diff__item--removed')
    expect(current.getByText('Removed')).toBeInTheDocument()

    const proposed = within(column('Proposed'))
    expect(proposed.getByText('A Level Physics').closest('li')).toHaveClass('change-diff__item--added')
    expect(proposed.getAllByText('Added')).toHaveLength(1)
  })

  it('marks hours block by block', () => {
    render(
      <ChangeRequestDiff
        kind="WORKING_HOURS"
        current={[{ weekday: 0, start_time: '08:00', end_time: '12:00' }]}
        proposed={[
          { weekday: 0, start_time: '08:00', end_time: '12:00' },
          { weekday: 5, start_time: '09:00', end_time: '11:00' },
        ]}
      />,
    )

    expect(within(column('Current')).queryByText('Removed')).not.toBeInTheDocument()
    expect(within(column('Proposed')).getByText('Saturday 09:00 to 11:00').closest('li')).toHaveClass(
      'change-diff__item--added',
    )
  })

  it('says when a side is empty', () => {
    render(<ChangeRequestDiff kind="SUBJECTS" current={[]} proposed={[maths]} />)
    expect(within(column('Current')).getByText('No subjects')).toBeInTheDocument()
  })

  it('shows only the proposal when there is no current value', () => {
    render(<ChangeRequestDiff kind="WORKING_HOURS" proposed={[]} />)
    expect(screen.queryByText('Current')).not.toBeInTheDocument()
    expect(screen.getByText('No working hours')).toBeInTheDocument()
  })
})
