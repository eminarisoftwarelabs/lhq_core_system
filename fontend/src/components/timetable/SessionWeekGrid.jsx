import { ArrowRightLeft, Clock, Laptop } from 'lucide-react'
import { fromMinutes, formatRange, layoutLanes, toMinutes, WEEKDAYS } from '../../lib/timetableGrid'
import { formatShortDay, statusLabel, statusTone, weekDates } from '../../lib/sessions'

// Below this many minutes a block shows one line; the rest is in its
// tooltip and accessible name.
const COMPACT_BELOW_MINUTES = 45

function pct(minutes, bounds) {
  return `${((minutes - bounds.start) / (bounds.end - bounds.start)) * 100}%`
}

function span(start, end, bounds) {
  return { top: pct(start, bounds), height: `calc(${pct(end, bounds)} - ${pct(start, bounds)})` }
}

function SessionBlock({ item, bounds, placement, showTutor, onOpen }) {
  const { session, start, end } = item
  const status = session.display_status
  const range = formatRange(start, end)
  const compact = end - start < COMPACT_BELOW_MINUTES
  const pending = Boolean(session.pending_request)
  const movedHere = session.moved_from != null && session.status !== 'CANCELLED'
  const who = showTutor ? `${session.student.name} · ${session.tutor.name}` : session.student.name
  const label = [
    `${session.subject.display_name}, ${session.student.name}`,
    `${formatShortDay(session.date)} ${range}`,
    showTutor ? session.tutor.name : null,
    statusLabel(status),
    pending ? 'change requested' : null,
    movedHere ? 'moved here' : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div
      className={`tt-session tt-session--${statusTone(status)}${compact ? ' tt-session--compact' : ''}`}
      style={{
        ...span(start, end, bounds),
        left: `calc(${(placement.lane / placement.lanes) * 100}% + 2px)`,
        width: `calc(${100 / placement.lanes}% - 4px)`,
      }}
    >
      <button type="button" className="tt-session__open" title={label} aria-label={label} onClick={() => onOpen(session)}>
        <span className="tt-session__content">
          <span className="tt-session__name">
            {pending && <Clock size={11} strokeWidth={2.25} className="tt-session__flag" aria-hidden="true" />}
            {movedHere && <ArrowRightLeft size={11} strokeWidth={2.25} className="tt-session__flag" aria-hidden="true" />}
            {session.mode === 'ONLINE' && <Laptop size={11} strokeWidth={2} className="tt-session__flag" aria-hidden="true" />}
            {session.subject.name}
          </span>
          <span className="tt-session__meta">{who}</span>
          <span className="tt-session__time">{range}</span>
        </span>
      </button>
    </div>
  )
}

/**
 * Monday-Sunday columns on a shared time axis. `items` come from
 * sessions.toGridItems; `free` (optional) is seven lists of {start_time,
 * end_time} shaded as the tutor's free time. Clicking a block calls
 * onOpen(session). On a phone one day shows at a time (`mobileDay`).
 */
export function SessionWeekGrid({ weekStart, items, bounds, free, showTutor, todayIndex, nowMinutes, mobileDay, onOpen }) {
  const dates = weekDates(weekStart)
  const hours = []
  for (let m = bounds.start; m < bounds.end; m += 60) hours.push(m)
  const showNow = todayIndex !== null && nowMinutes >= bounds.start && nowMinutes <= bounds.end

  return (
    <div className="tt-grid" style={{ '--tt-hours': (bounds.end - bounds.start) / 60 }}>
      <div className="tt-grid__corner" aria-hidden="true" />
      {WEEKDAYS.map(({ day, label, short }) => (
        <div
          key={label}
          className={`tt-grid__day-head${day === todayIndex ? ' tt-grid__day-head--today' : ''}${day === mobileDay ? '' : ' tt-grid__hide-mobile'}`}
        >
          <span className="tt-grid__day-name">
            {day === todayIndex && (
              <span className="tt-grid__today-dot" title="Today">
                <span className="visually-hidden">Today, </span>
              </span>
            )}
            <span className="tt-grid__day-full">{label}</span>
            <span className="tt-grid__day-short" aria-hidden="true">
              {short}
            </span>
          </span>
          <span className="tt-grid__day-date">{formatShortDay(dates[day]).replace(/^\w+ /, '')}</span>
        </div>
      ))}

      <div className="tt-grid__gutter" aria-hidden="true">
        {hours.map((m) => (
          <span key={m} className="tt-grid__hour-label" style={{ top: pct(m, bounds) }}>
            {fromMinutes(m)}
          </span>
        ))}
      </div>

      {WEEKDAYS.map(({ day, label }) => {
        const dayItems = items.filter((item) => item.day === day)
        const lanes = layoutLanes(dayItems)
        return (
          <div
            key={label}
            data-testid={`tt-day-${day}`}
            aria-label={`${label} ${formatShortDay(dates[day])}`}
            role="group"
            className={`tt-grid__column${day === todayIndex ? ' tt-grid__column--today' : ''}${day === mobileDay ? '' : ' tt-grid__hide-mobile'}`}
          >
            {(free?.[day] ?? []).map((block) => (
              <div
                key={`${block.start_time}-${block.end_time}`}
                className="tt-free"
                data-testid="tt-free"
                title={`Free ${block.start_time}–${block.end_time}`}
                style={span(toMinutes(block.start_time), toMinutes(block.end_time), bounds)}
              />
            ))}
            {dayItems.map((item) => (
              <SessionBlock
                key={item.key}
                item={item}
                bounds={bounds}
                placement={lanes.get(item.key)}
                showTutor={showTutor}
                onOpen={onOpen}
              />
            ))}
            {day === todayIndex && showNow && (
              <div className="tt-grid__now" style={{ top: pct(nowMinutes, bounds) }} aria-hidden="true" />
            )}
          </div>
        )
      })}
    </div>
  )
}
