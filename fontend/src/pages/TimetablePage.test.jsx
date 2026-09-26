import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimetablePage } from './TimetablePage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ApiError } from '../lib/apiClient'
import { encodeDrag } from '../lib/timetableGrid'

const mockListAllSubjects = vi.fn()
const mockUpdateSubject = vi.fn()
const mockCreateTopic = vi.fn()
const mockListPlans = vi.fn()
const mockSetPlan = vi.fn()
const mockCopyWeek = vi.fn()

vi.mock('../lib/api', () => ({
  academicsApi: {
    listAllSubjects: (...args) => mockListAllSubjects(...args),
    updateSubject: (...args) => mockUpdateSubject(...args),
    createTopic: (...args) => mockCreateTopic(...args),
  },
  lessonPlansApi: {
    list: (...args) => mockListPlans(...args),
    set: (...args) => mockSetPlan(...args),
    copyWeek: (...args) => mockCopyWeek(...args),
  },
}))

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const slot = (day, start, end) => ({ day_of_week: day, start_time: `${start}:00`, end_time: `${end}:00` })

const fractions = { id: 11, subject: 1, name: 'Fractions' }
const decimals = { id: 12, subject: 1, name: 'Decimals' }
const maths = {
  id: 1,
  name: 'Maths',
  tutor: 9,
  tutor_name: 'Tam Tutor',
  is_active: true,
  timetable_slot: slot(1, '14:00', '15:30'),
  topics: [decimals, fractions],
}
// This week (the fake "now" is Wed 23 Sep 2026) starts Monday 21 Sep.
const THIS_WEEK = '2026-09-21'
const plan = (subject, week, topic) => ({
  id: Number(`${subject}${week.replaceAll('-', '')}`),
  subject,
  week_start: week,
  topic: topic.id,
  topic_name: topic.name,
  updated_by_name: 'Tam Tutor',
})
const english = { id: 2, name: 'English', tutor: null, tutor_name: null, is_active: true, timetable_slot: slot(1, '09:00', '10:00') }
const chemistry = { id: 3, name: 'Chemistry', tutor: 9, tutor_name: 'Tam Tutor', is_active: true, timetable_slot: null }
// A slot saved before the Mon-Fri rule: shown as unscheduled so it can be re-placed.
const artClub = { id: 4, name: 'Art Club', tutor: null, tutor_name: null, is_active: true, timetable_slot: slot(5, '09:00', '10:00') }

function renderPage(initialEntries = ['/timetable']) {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <TimetablePage />
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

// jsdom has no layout, so give a day column a real-looking box at 60px per
// hour. The default fixtures (English 09:00, Maths until 15:30) fit the grid
// to 08:00-17:00: nine hours, 540px.
function giveColumnLayout(column) {
  column.getBoundingClientRect = () => ({ top: 100, height: 540, left: 0, width: 150, right: 150, bottom: 640 })
}

// jsdom has no DragEvent, so drag events don't carry clientY from their
// init dict - set it on the event object the way a browser would.
function fireDrag(kind, node, transfer, clientY) {
  const event = createEvent[kind](node, { dataTransfer: transfer })
  Object.defineProperty(event, 'clientY', { value: clientY })
  fireEvent(node, event)
}

function dataTransfer(payload = '') {
  const store = { 'text/plain': payload }
  return {
    setData: (type, value) => {
      store[type] = value
    },
    getData: (type) => store[type] ?? '',
    effectAllowed: 'all',
    dropEffect: 'none',
  }
}

beforeEach(() => {
  // Wednesday 23 Sep 2026, 10:00 - fake only Date so findBy* polling still runs.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  mockListAllSubjects.mockReset().mockResolvedValue([maths, english, chemistry, artClub])
  mockUpdateSubject.mockReset()
  mockCreateTopic.mockReset()
  mockListPlans.mockReset().mockResolvedValue([])
  mockSetPlan.mockReset()
  mockCopyWeek.mockReset()
  mockUseAuth.mockReturnValue({ isStaffLevel: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TimetablePage grid', () => {
  it('shows Monday to Friday only, with each session in its day column', async () => {
    renderPage()
    await screen.findByText('Maths')

    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      expect(screen.getByText(day)).toBeInTheDocument()
    }
    expect(screen.queryByText('Saturday')).not.toBeInTheDocument()
    expect(screen.queryByText('Sunday')).not.toBeInTheDocument()

    const tuesday = screen.getByTestId('tt-day-1')
    expect(within(tuesday).getByRole('button', { name: 'Edit Maths, Tuesday 14:00–15:30' })).toBeInTheDocument()
    expect(within(tuesday).getByRole('button', { name: 'Edit English, Tuesday 09:00–10:00' })).toBeInTheDocument()
  })

  it('shows subject, time, and tutor inside each block', async () => {
    renderPage()
    const block = await screen.findByRole('button', { name: /Edit Maths/ })

    expect(within(block).getByText('Maths')).toBeInTheDocument()
    expect(within(block).getByText('14:00–15:30')).toBeInTheDocument()
    expect(within(block).getByText('Tam Tutor')).toBeInTheDocument()
    expect(within(block).getByText('No topic planned')).toBeInTheDocument()
  })

  it('marks today and summarises the week', async () => {
    renderPage()
    await screen.findByText('Maths')

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByTestId('tt-day-2')).toHaveClass('tt-grid__column--today')
    expect(screen.getByText('2', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('2 h 30 min')).toBeInTheDocument()
  })

  it('lists unscheduled subjects - and legacy weekend slots - in the tray', async () => {
    renderPage()
    const tray = await screen.findByRole('complementary', { name: 'Not on the timetable' })

    expect(within(tray).getByText('Chemistry')).toBeInTheDocument()
    expect(within(tray).getByText('Art Club')).toBeInTheDocument()
    expect(within(tray).queryByText('Maths')).not.toBeInTheDocument()
  })

  it('flags a tutor booked into two overlapping sessions', async () => {
    const physics = { ...chemistry, id: 5, name: 'Physics', timetable_slot: slot(1, '15:00', '16:00') }
    mockListAllSubjects.mockResolvedValue([maths, physics])
    renderPage()
    await screen.findByText('Maths')

    expect(screen.getByRole('button', { name: /Edit Maths/ }).closest('.tt-session')).toHaveClass('tt-session--clash')
    expect(screen.getByRole('button', { name: /Edit Physics/ }).closest('.tt-session')).toHaveClass('tt-session--clash')
    expect(screen.getByText('2 sessions double-book a tutor')).toBeInTheDocument()
  })

  it('shows an empty state when there are no subjects at all', async () => {
    mockListAllSubjects.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('No subjects to schedule yet.')).toBeInTheDocument()
  })

  it('shows an error message if the timetable fails to load', async () => {
    mockListAllSubjects.mockRejectedValue(new ApiError(500, { detail: 'Server down' }))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Server down')
  })

  it('the hours toggle names exactly what each option shows', async () => {
    renderPage()
    await screen.findByText('Maths')

    const group = screen.getByRole('group', { name: 'Hours shown' })
    expect(within(group).getByRole('button', { name: 'Lesson hours 08:00–17:00', pressed: true })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Whole day 07:00–21:00', pressed: false })).toBeInTheDocument()
  })

  it('fits the grid to the sessions, and Whole day shows 07:00-21:00', async () => {
    renderPage()
    await screen.findByText('Maths')
    const gutter = document.querySelector('.tt-grid__gutter')
    const hours = () => [...gutter.querySelectorAll('.tt-grid__hour-label')].map((el) => el.textContent)

    expect(hours()[0]).toBe('08:00')
    expect(hours().at(-1)).toBe('16:00')

    fireEvent.click(screen.getByRole('button', { name: /Whole day/ }))

    expect(hours()[0]).toBe('07:00')
    expect(hours().at(-1)).toBe('20:00')
  })

  it('the phone day switcher starts on today and switches the visible column', async () => {
    renderPage()
    await screen.findByText('Maths')

    expect(screen.getByRole('button', { name: 'Wednesday', pressed: true })).toBeInTheDocument()
    expect(screen.getByTestId('tt-day-1')).toHaveClass('tt-grid__hide-mobile')

    fireEvent.click(screen.getByRole('button', { name: 'Tuesday' }))

    expect(screen.getByTestId('tt-day-1')).not.toHaveClass('tt-grid__hide-mobile')
    expect(screen.getByTestId('tt-day-2')).toHaveClass('tt-grid__hide-mobile')
  })
})

describe('TimetablePage adding sessions', () => {
  it('Schedule in the tray opens the dialog with that subject at the first free hour of the day', async () => {
    mockUpdateSubject.mockResolvedValue({ ...chemistry, timetable_slot: slot(2, '08:00', '09:00') })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Schedule Chemistry' }))

    const dialog = screen.getByRole('dialog', { name: 'Schedule a subject' })
    expect(within(dialog).getByLabelText('Subject')).toHaveDisplayValue(/Chemistry/)
    expect(within(dialog).getByRole('radio', { name: 'Wednesday' })).toBeChecked()
    expect(within(dialog).getByLabelText('Starts')).toHaveDisplayValue('08:00')
    expect(within(dialog).getByLabelText('Ends')).toHaveDisplayValue('09:00')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Chemistry' }))

    await waitFor(() =>
      expect(mockUpdateSubject).toHaveBeenCalledWith(3, {
        timetable_slot: { day_of_week: 2, start_time: '08:00', end_time: '09:00' },
      }),
    )
    expect(await screen.findByText('Chemistry scheduled for Wednesday 08:00–09:00')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clicking an empty time in a column opens the dialog at that day and time', async () => {
    renderPage()
    await screen.findByText('Maths')
    const thursday = screen.getByTestId('tt-day-3')
    giveColumnLayout(thursday)

    // 100px top + 390px = 6.5h into an 08:00 grid = 14:30; the click targets
    // the middle of a one-hour session, so it starts at 14:00.
    fireEvent.click(thursday, { clientY: 490 })

    const dialog = screen.getByRole('dialog', { name: 'Schedule a subject' })
    expect(within(dialog).getByRole('radio', { name: 'Thursday' })).toBeChecked()
    expect(within(dialog).getByLabelText('Starts')).toHaveDisplayValue('14:00')
    expect(within(dialog).getByLabelText('Ends')).toHaveDisplayValue('15:00')
  })

  it('moving the start keeps the session length', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Schedule Chemistry' }))
    const dialog = screen.getByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Ends'), { target: { value: String(9 * 60 + 30) } })
    fireEvent.change(within(dialog).getByLabelText('Starts'), { target: { value: String(13 * 60) } })

    expect(within(dialog).getByLabelText('Ends')).toHaveDisplayValue('14:30')
    expect(within(dialog).getByText('1 h 30 min')).toBeInTheDocument()
  })

  it('warns live when the chosen time double-books the tutor', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Schedule Chemistry' }))
    const dialog = screen.getByRole('dialog')

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Tuesday' }))
    fireEvent.change(within(dialog).getByLabelText('Starts'), { target: { value: String(14 * 60) } })

    expect(within(dialog).getByRole('status')).toHaveTextContent('Tam Tutor is already teaching Maths at this time.')
  })

  it('dragging a tray subject onto a column schedules it there for an hour', async () => {
    mockUpdateSubject.mockResolvedValue({ ...chemistry, timetable_slot: slot(0, '10:00', '11:00') })
    renderPage()
    const tray = await screen.findByRole('complementary')
    const monday = screen.getByTestId('tt-day-0')
    giveColumnLayout(monday)

    const transfer = dataTransfer()
    fireEvent.dragStart(within(tray).getByText('Chemistry').closest('li'), { dataTransfer: transfer })
    fireDrag('dragOver', monday, transfer, 220)
    expect(within(monday).getByText('10:00–11:00')).toBeInTheDocument() // drop preview
    fireDrag('drop', monday, transfer, 220)

    await waitFor(() =>
      expect(mockUpdateSubject).toHaveBeenCalledWith(3, {
        timetable_slot: { day_of_week: 0, start_time: '10:00', end_time: '11:00' },
      }),
    )
  })

  it('a drop from outside the app is ignored', async () => {
    renderPage()
    await screen.findByText('Maths')
    const monday = screen.getByTestId('tt-day-0')
    giveColumnLayout(monday)

    fireDrag('drop', monday, dataTransfer('some dragged text'), 220)

    expect(mockUpdateSubject).not.toHaveBeenCalled()
  })

  it('shows a helpful message when every subject is already scheduled', async () => {
    mockListAllSubjects.mockResolvedValue([maths, english])
    renderPage()
    await screen.findByText('Maths')

    fireEvent.click(screen.getByRole('button', { name: 'Schedule a subject' }))

    expect(screen.getByText('Every subject is already on the timetable.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a subject' })).toHaveAttribute('href', '/subjects/new')
  })
})

describe('TimetablePage changing and removing sessions', () => {
  it('clicking a block opens it pre-filled, and saving sends the new slot', async () => {
    mockUpdateSubject.mockResolvedValue({ ...maths, timetable_slot: slot(3, '14:00', '15:30') })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Edit Maths/ }))

    const dialog = screen.getByRole('dialog', { name: 'Maths' })
    expect(within(dialog).getByRole('radio', { name: 'Tuesday' })).toBeChecked()
    expect(within(dialog).getByLabelText('Starts')).toHaveDisplayValue('14:00')
    expect(within(dialog).getByLabelText('Ends')).toHaveDisplayValue('15:30')
    expect(within(dialog).queryByLabelText('Subject')).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Thursday' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockUpdateSubject).toHaveBeenCalledWith(1, {
        timetable_slot: { day_of_week: 3, start_time: '14:00', end_time: '15:30' },
      }),
    )
    expect(await screen.findByText('Maths moved to Thursday 14:00–15:30')).toBeInTheDocument()
    expect(within(screen.getByTestId('tt-day-3')).getByText('Maths')).toBeInTheDocument()
  })

  it('the × on a block takes it off the timetable in one click', async () => {
    mockUpdateSubject.mockResolvedValue({ ...english, timetable_slot: null })
    renderPage()
    await screen.findByText('English')

    fireEvent.click(screen.getByRole('button', { name: 'Remove English from Tuesday' }))

    await waitFor(() => expect(mockUpdateSubject).toHaveBeenCalledWith(2, { timetable_slot: null }))
    expect(await screen.findByText('English removed from the timetable')).toBeInTheDocument()
    expect(within(screen.getByRole('complementary')).getByText('English')).toBeInTheDocument()
  })

  it('Remove from timetable in the dialog also works', async () => {
    mockUpdateSubject.mockResolvedValue({ ...maths, timetable_slot: null })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Edit Maths/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Remove from timetable' }))

    await waitFor(() => expect(mockUpdateSubject).toHaveBeenCalledWith(1, { timetable_slot: null }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('a failed one-click remove shows an alert and keeps the block', async () => {
    mockUpdateSubject.mockRejectedValue(new ApiError(403, { detail: 'Not allowed.' }))
    renderPage()
    await screen.findByText('English')

    fireEvent.click(screen.getByRole('button', { name: 'Remove English from Tuesday' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not remove English. Not allowed.')
    expect(screen.getByRole('button', { name: /Edit English/ })).toBeInTheDocument()
  })

  it('dragging a block to another day moves it and keeps its length', async () => {
    mockUpdateSubject.mockResolvedValue({ ...maths, timetable_slot: slot(4, '09:00', '10:30') })
    renderPage()
    await screen.findByText('Maths')
    const friday = screen.getByTestId('tt-day-4')
    giveColumnLayout(friday)

    // Grabbed 30 minutes into the block, dropped at 09:30 -> starts 09:00.
    fireDrag('drop', friday, dataTransfer(encodeDrag(1, 30)), 190)

    await waitFor(() =>
      expect(mockUpdateSubject).toHaveBeenCalledWith(1, {
        timetable_slot: { day_of_week: 4, start_time: '09:00', end_time: '10:30' },
      }),
    )
  })

  it('shows server validation errors inside the dialog', async () => {
    mockUpdateSubject.mockRejectedValue(
      new ApiError(400, { timetable_slot: { day_of_week: ['Must be a weekday, between 0 (Monday) and 4 (Friday).'] } }),
    )
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Edit Maths/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText(/Must be a weekday/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('Cancel and Escape close the dialog without saving', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Edit Maths/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Edit Maths/ }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockUpdateSubject).not.toHaveBeenCalled()
  })
})

describe('TimetablePage deep links and permissions', () => {
  it('?subject=<id> opens a scheduled subject for editing', async () => {
    renderPage(['/timetable?subject=1'])

    expect(await screen.findByRole('dialog', { name: 'Maths' })).toBeInTheDocument()
  })

  it('?subject=<id> opens an unscheduled subject ready to add', async () => {
    renderPage(['/timetable?subject=3'])

    const dialog = await screen.findByRole('dialog', { name: 'Schedule a subject' })
    expect(within(dialog).getByLabelText('Subject')).toHaveDisplayValue(/Chemistry/)
  })

  it('a Tutor cannot change the schedule: no tray, no add, no remove, no dragging', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    renderPage(['/timetable?subject=1'])
    await screen.findByText('Maths')

    expect(screen.queryByRole('button', { name: /Edit Maths/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Schedule a subject' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Plan Maths/ }).closest('.tt-session')).not.toHaveAttribute('draggable')
  })

  it('a Tutor opens a lesson to plan it: lesson plan only, no time fields', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    mockSetPlan.mockResolvedValue(plan(1, THIS_WEEK, fractions))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Plan Maths/ }))

    const dialog = screen.getByRole('dialog', { name: 'Maths' })
    expect(within(dialog).getByText('Tuesdays, 14:00–15:30')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Starts')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()

    const thisWeekSelect = await within(dialog).findByLabelText(/Tue 22 Sept/)
    await waitFor(() => expect(thisWeekSelect).not.toBeDisabled())
    fireEvent.change(thisWeekSelect, { target: { value: '11' } })

    await waitFor(() => expect(mockSetPlan).toHaveBeenCalledWith(1, THIS_WEEK, 11))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(within(screen.getByRole('button', { name: /Plan Maths/ })).getByText('Fractions')).toBeInTheDocument()
  })
})

describe('TimetablePage weeks and lesson plans', () => {
  it('loads this week\'s topics and shows them in each lesson', async () => {
    mockListPlans.mockResolvedValue([plan(1, THIS_WEEK, fractions)])
    renderPage()
    const block = await screen.findByRole('button', { name: /Edit Maths/ })

    expect(mockListPlans).toHaveBeenCalledWith(THIS_WEEK)
    await waitFor(() => expect(within(block).getByText('Fractions')).toBeInTheDocument())
    expect(within(screen.getByRole('button', { name: /Edit English/ })).getByText('No topic planned')).toBeInTheDocument()
  })

  it('Show topics is on by default and hides the topic line when switched off', async () => {
    mockListPlans.mockResolvedValue([plan(1, THIS_WEEK, fractions)])
    renderPage()
    await screen.findByText('Fractions')

    const toggle = screen.getByLabelText('Show topics')
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)

    expect(screen.queryByText('Fractions')).not.toBeInTheDocument()
    expect(screen.queryByText('No topic planned')).not.toBeInTheDocument()
  })

  it('shows the week with dates, and steps to the next week', async () => {
    renderPage()
    await screen.findByText('Maths')

    expect(screen.getByRole('heading', { name: /This week\s*21 – 25 Sept 2026/ })).toBeInTheDocument()
    expect(screen.getByText('23 Sept')).toBeInTheDocument()

    mockListPlans.mockResolvedValue([plan(1, '2026-09-28', decimals)])
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))

    expect(await screen.findByRole('heading', { name: /Next week\s*28 Sept – 2 Oct 2026/ })).toBeInTheDocument()
    expect(mockListPlans).toHaveBeenLastCalledWith('2026-09-28')
    expect(await screen.findByText('Decimals')).toBeInTheDocument()
    // Today is only marked on the week that contains it.
    expect(screen.queryByText('Today')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to this week' }))
    expect(await screen.findByText('Today')).toBeInTheDocument()
  })

  it('opens the week given in the URL, and ignores one that is not a Monday', async () => {
    renderPage(['/timetable?week=2026-10-05'])
    await screen.findByText('Maths')
    expect(mockListPlans).toHaveBeenCalledWith('2026-10-05')

    mockListPlans.mockClear()
    renderPage(['/timetable?week=2026-10-07'])
    await waitFor(() => expect(mockListPlans).toHaveBeenCalledWith(THIS_WEEK))
  })

  it('Copy last week\'s topics fills this week and reports what happened', async () => {
    mockCopyWeek.mockResolvedValue({ copied: 2, skipped: 1 })
    renderPage()
    await screen.findByText('Maths')
    mockListPlans.mockResolvedValue([plan(1, THIS_WEEK, fractions)])

    fireEvent.click(screen.getByRole('button', { name: "Copy last week's topics" }))

    await waitFor(() => expect(mockCopyWeek).toHaveBeenCalledWith('2026-09-14', THIS_WEEK))
    expect(await screen.findByText('Copied 2 topics from last week (1 already planned, left as they were)')).toBeInTheDocument()
    expect(await screen.findByText('Fractions')).toBeInTheDocument()
  })

  it('copying when last week has nothing says so', async () => {
    mockCopyWeek.mockResolvedValue({ copied: 0, skipped: 0 })
    renderPage()
    await screen.findByText('Maths')

    fireEvent.click(screen.getByRole('button', { name: "Copy last week's topics" }))

    expect(await screen.findByText('Last week has no topics to copy')).toBeInTheDocument()
  })

  it('staff plan ahead from the lesson dialog, one row per week from the week on screen', async () => {
    mockListPlans.mockResolvedValue([plan(1, '2026-09-28', decimals)])
    mockSetPlan.mockResolvedValue(plan(1, '2026-10-05', fractions))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Edit Maths/ }))
    const dialog = screen.getByRole('dialog', { name: 'Maths' })

    // Six weeks, dated for Maths' Tuesday lesson, labelled relative to today.
    const rows = within(dialog).getAllByRole('listitem')
    expect(rows).toHaveLength(6)
    expect(within(rows[0]).getByText('Tue 22 Sept')).toBeInTheDocument()
    expect(within(rows[0]).getByText('This week')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Next week')).toBeInTheDocument()
    expect(mockListPlans).toHaveBeenCalledWith(THIS_WEEK, '2026-10-26')

    await waitFor(() => expect(within(rows[1]).getByRole('combobox')).toHaveDisplayValue('Decimals'))

    fireEvent.change(within(rows[2]).getByRole('combobox'), { target: { value: '11' } })
    await waitFor(() => expect(mockSetPlan).toHaveBeenCalledWith(1, '2026-10-05', 11))
    expect(await within(rows[2]).findByLabelText('Saved')).toBeInTheDocument()
  })

  it('"Not planned yet" clears a week\'s topic', async () => {
    mockListPlans.mockResolvedValue([plan(1, THIS_WEEK, fractions)])
    mockSetPlan.mockResolvedValue(null)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Edit Maths/ }))
    const row = within(screen.getByRole('dialog')).getAllByRole('listitem')[0]
    await waitFor(() => expect(within(row).getByRole('combobox')).toHaveDisplayValue('Fractions'))

    fireEvent.change(within(row).getByRole('combobox'), { target: { value: '' } })

    await waitFor(() => expect(mockSetPlan).toHaveBeenCalledWith(1, THIS_WEEK, null))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(within(screen.getByRole('button', { name: /Edit Maths/ })).getByText('No topic planned')).toBeInTheDocument()
  })

  it('+ New topic creates the topic and plans it for that week', async () => {
    const ratios = { id: 13, subject: 1, name: 'Ratios' }
    mockCreateTopic.mockResolvedValue(ratios)
    mockSetPlan.mockResolvedValue(plan(1, '2026-09-28', ratios))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Edit Maths/ }))
    const row = within(screen.getByRole('dialog')).getAllByRole('listitem')[1]
    await waitFor(() => expect(within(row).getByRole('combobox')).not.toBeDisabled())

    fireEvent.change(within(row).getByRole('combobox'), { target: { value: '__new__' } })
    fireEvent.change(within(row).getByRole('textbox'), { target: { value: 'Ratios' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(mockCreateTopic).toHaveBeenCalledWith(1, { name: 'Ratios' }))
    await waitFor(() => expect(mockSetPlan).toHaveBeenCalledWith(1, '2026-09-28', 13))
    // The new topic is now offered in every week's dropdown.
    const firstRow = within(screen.getByRole('dialog')).getAllByRole('listitem')[0]
    expect(within(firstRow).getByRole('option', { name: 'Ratios' })).toBeInTheDocument()
  })

  it('a failed save shows the reason on that week\'s row', async () => {
    mockSetPlan.mockRejectedValue(new ApiError(400, { topic: ['This topic belongs to a different subject.'] }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Edit Maths/ }))
    const row = within(screen.getByRole('dialog')).getAllByRole('listitem')[0]
    await waitFor(() => expect(within(row).getByRole('combobox')).not.toBeDisabled())

    fireEvent.change(within(row).getByRole('combobox'), { target: { value: '11' } })

    expect(await within(row).findByRole('alert')).toHaveTextContent('This topic belongs to a different subject.')
  })

  it('Show 6 more weeks extends the plan, fetching only the new weeks', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Edit Maths/ }))
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(mockListPlans).toHaveBeenCalledWith(THIS_WEEK, '2026-10-26'))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Show 6 more weeks' }))

    expect(within(dialog).getAllByRole('listitem')).toHaveLength(12)
    await waitFor(() => expect(mockListPlans).toHaveBeenCalledWith('2026-11-02', '2026-12-07'))
  })

  it('a failure loading the week\'s topics is shown without hiding the timetable', async () => {
    mockListPlans.mockRejectedValue(new ApiError(500, { detail: 'Plans unavailable' }))
    renderPage()

    expect(await screen.findByText('Plans unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit Maths/ })).toBeInTheDocument()
  })
})
