import { AlertTriangle, BookOpen, Plus, UserCog, X } from 'lucide-react'
import { useState } from 'react'
import {
  decodeDrag,
  DEFAULT_SESSION_MINUTES,
  DRAG_TYPE,
  encodeDrag,
  formatRange,
  fromMinutes,
  layoutLanes,
  placeStart,
  WEEKDAYS,
} from '../../lib/timetableGrid'
import { dateInWeek, formatDayMonth } from '../../lib/weeks'

// How much a block can show depends on its height (its length):
//   an hour or more  -> name / topic / time / tutor, one per line
//   40-59 minutes    -> name + time on one line, topic under it
//   under 40 minutes -> one line: name + topic (time is in the tooltip)
const SHORT_BELOW_MINUTES = 60
const COMPACT_BELOW_MINUTES = 40
const TONES = 6

function toneFor(subjectId) {
  return subjectId % TONES
}

// Minutes-from-midnight under the pointer, from its position in the column.
// Uses the column's rendered height rather than a hard-coded px-per-hour,
// so CSS stays the single source of truth for row height.
function minuteAt(event, column, bounds) {
  const rect = column.getBoundingClientRect()
  // A synthetic event without a pointer position must never turn into a
  // NaN time sent to the API - fall back to the top of the grid instead.
  if (!rect.height || !Number.isFinite(event.clientY)) return bounds.start
  const ratio = (event.clientY - rect.top) / rect.height
  return bounds.start + ratio * (bounds.end - bounds.start)
}

function pct(minutes, bounds) {
  return `${((minutes - bounds.start) / (bounds.end - bounds.start)) * 100}%`
}

function SessionBlock({
  session,
  bounds,
  placement,
  clash,
  canEdit,
  canOpen,
  plan,
  showTopics,
  onOpen,
  onRemove,
  onDragStart,
  onDragEnd,
}) {
  const { subject, day, start, end } = session
  const length = end - start
  const compact = length < COMPACT_BELOW_MINUTES
  const short = !compact && length < SHORT_BELOW_MINUTES
  const dayLabel = WEEKDAYS[day].label
  const range = formatRange(start, end)
  const style = {
    top: pct(start, bounds),
    height: `calc(${pct(end, bounds)} - ${pct(start, bounds)})`,
    left: `calc(${(placement.lane / placement.lanes) * 100}% + 2px)`,
    width: `calc(${100 / placement.lanes}% - 4px)`,
  }
  const className = [
    'tt-session',
    `tt-session--tone-${toneFor(subject.id)}`,
    compact ? 'tt-session--compact' : '',
    short ? 'tt-session--short' : '',
    clash ? 'tt-session--clash' : '',
    subject.is_active === false ? 'tt-session--inactive' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const topic = showTopics && (
    <span className={`tt-session__topic${plan ? '' : ' tt-session__topic--empty'}`}>
      <BookOpen size={11} strokeWidth={1.75} aria-hidden="true" />
      {plan ? plan.topic_name : 'No topic planned'}
    </span>
  )
  const name = (
    <span className="tt-session__name">
      {clash && <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" className="tt-session__clash-icon" />}
      {subject.name}
    </span>
  )
  const time = <span className="tt-session__time">{range}</span>

  let body
  if (compact) {
    body = (
      <>
        {name}
        {topic}
      </>
    )
  } else if (short) {
    body = (
      <>
        <span className="tt-session__row">
          {name}
          {time}
        </span>
        {topic}
      </>
    )
  } else {
    body = (
      <>
        {name}
        {topic}
        {time}
        <span className="tt-session__tutor">
          <UserCog size={11} strokeWidth={1.75} aria-hidden="true" />
          {subject.tutor_name || 'Unassigned'}
        </span>
      </>
    )
  }

  const topicText = plan ? `, topic: ${plan.topic_name}` : ''
  const title = `${subject.name}${topicText}, ${dayLabel} ${range}${subject.tutor_name ? `, ${subject.tutor_name}` : ''}${clash ? ' (tutor double-booked)' : ''}`

  // Chrome always centres a <button>'s content vertically, so when a
  // block's lines don't all fit it would clip the name off the top. The
  // content is pinned to the block's top-left instead, and anything that
  // doesn't fit is cut from the bottom (the least important line).
  const content = <span className="tt-session__content">{body}</span>

  if (!canEdit && !canOpen) {
    return (
      <div className={className} style={style} title={title}>
        {content}
      </div>
    )
  }

  return (
    <div
      className={className}
      style={style}
      draggable={canEdit || undefined}
      onDragStart={(event) => {
        const column = event.currentTarget.parentElement
        const grabOffset = Math.max(0, Math.round(minuteAt(event, column, bounds) - start))
        event.dataTransfer.setData(DRAG_TYPE, encodeDrag(subject.id, grabOffset))
        event.dataTransfer.effectAllowed = 'move'
        onDragStart(subject.id, end - start, grabOffset)
      }}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        className="tt-session__open"
        title={title}
        aria-label={`${canEdit ? 'Edit' : 'Plan'} ${subject.name}, ${dayLabel} ${range}${topicText}`}
        onClick={(event) => {
          event.stopPropagation()
          onOpen(session)
        }}
      >
        {content}
      </button>
      {canEdit && (
        <button
          type="button"
          className="tt-session__remove"
          aria-label={`Remove ${subject.name} from ${dayLabel}`}
          title="Remove from timetable"
          onClick={(event) => {
            event.stopPropagation()
            onRemove(session)
          }}
        >
          <X size={12} strokeWidth={2.25} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/**
 * Monday-Friday columns on a shared time axis. Staff can click an empty
 * spot to add a session there, drag blocks (or tray subjects) to place
 * them, and remove a block with its ×. Non-staff get the same grid,
 * read-only.
 */
export function WeekGrid({
  sessions,
  bounds,
  canEdit,
  canOpen = canEdit,
  weekStart,
  plans,
  showTopics,
  today,
  nowMinutes,
  mobileDay,
  clashes,
  dragging,
  onAddAt,
  onOpen,
  onRemove,
  onDropSubject,
  onDragStart,
  onDragEnd,
}) {
  const [hover, setHover] = useState(null)
  const [dropPreview, setDropPreview] = useState(null)
  const hours = []
  for (let m = bounds.start; m < bounds.end; m += 60) hours.push(m)
  const totalHours = (bounds.end - bounds.start) / 60
  const showNow = today !== null && nowMinutes >= bounds.start && nowMinutes <= bounds.end

  return (
    <div className={`tt-grid${canEdit ? ' tt-grid--editable' : ''}`} style={{ '--tt-hours': totalHours }}>
      <div className="tt-grid__corner" aria-hidden="true" />
      {WEEKDAYS.map(({ day, label, short }) => {
        return (
          <div
            key={label}
            className={`tt-grid__day-head${day === today ? ' tt-grid__day-head--today' : ''}${day === mobileDay ? '' : ' tt-grid__hide-mobile'}`}
          >
            <span className="tt-grid__day-name">
              <span className="tt-grid__day-full">{label}</span>
              <span className="tt-grid__day-short" aria-hidden="true">
                {short}
              </span>
              <span className="tt-grid__day-date">{formatDayMonth(dateInWeek(weekStart, day))}</span>
            </span>
            {day === today && (
              <span className="tt-grid__today-dot" title="Today">
                <span className="visually-hidden">Today</span>
              </span>
            )}
          </div>
        )
      })}

      <div className="tt-grid__gutter" aria-hidden="true">
        {hours.map((m) => (
          <span key={m} className="tt-grid__hour-label" style={{ top: pct(m, bounds) }}>
            {fromMinutes(m)}
          </span>
        ))}
      </div>

      {WEEKDAYS.map(({ day, label }) => {
        const daySessions = sessions.filter((s) => s.day === day)
        const lanes = layoutLanes(daySessions)
        const hoverHere = canEdit && !dragging && hover?.day === day
        const previewHere = dropPreview?.day === day
        return (
          <div
            key={label}
            // A mouse shortcut only - not a button role, since it contains the
            // session buttons. Keyboard users add via "Schedule a subject".
            data-testid={`tt-day-${day}`}
            className={`tt-grid__column${day === today ? ' tt-grid__column--today' : ''}${day === mobileDay ? '' : ' tt-grid__hide-mobile'}${previewHere ? ' tt-grid__column--drop' : ''}`}
            onMouseMove={
              canEdit
                ? (event) => {
                    if (event.target !== event.currentTarget) {
                      if (hover) setHover(null)
                      return
                    }
                    const start = placeStart(minuteAt(event, event.currentTarget, bounds) - 30, DEFAULT_SESSION_MINUTES, bounds, 30)
                    if (hover?.day !== day || hover?.start !== start) setHover({ day, start })
                  }
                : undefined
            }
            onMouseLeave={canEdit ? () => setHover(null) : undefined}
            onClick={
              canEdit
                ? (event) => {
                    if (event.target !== event.currentTarget) return
                    const start = placeStart(minuteAt(event, event.currentTarget, bounds) - 30, DEFAULT_SESSION_MINUTES, bounds, 30)
                    onAddAt(day, start)
                  }
                : undefined
            }
            onDragOver={
              canEdit
                ? (event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    if (!dragging) return
                    const start = placeStart(
                      minuteAt(event, event.currentTarget, bounds) - dragging.grabOffset,
                      dragging.duration,
                      bounds,
                    )
                    if (dropPreview?.day !== day || dropPreview?.start !== start) {
                      setDropPreview({ day, start, end: start + dragging.duration })
                    }
                  }
                : undefined
            }
            onDragLeave={
              canEdit
                ? (event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setDropPreview(null)
                  }
                : undefined
            }
            onDrop={
              canEdit
                ? (event) => {
                    event.preventDefault()
                    setDropPreview(null)
                    const payload = decodeDrag(event.dataTransfer.getData(DRAG_TYPE))
                    if (!payload) return
                    onDropSubject(payload.subjectId, day, minuteAt(event, event.currentTarget, bounds) - payload.grabOffset)
                  }
                : undefined
            }
          >
            {hoverHere && (
              <div
                className="tt-grid__hover"
                style={{ top: pct(hover.start, bounds), height: `calc(${pct(hover.start + 60, bounds)} - ${pct(hover.start, bounds)})` }}
                aria-hidden="true"
              >
                <Plus size={12} strokeWidth={2} />
                {fromMinutes(hover.start)}
              </div>
            )}

            {previewHere && (
              <div
                className="tt-grid__drop-preview"
                style={{
                  top: pct(dropPreview.start, bounds),
                  height: `calc(${pct(dropPreview.end, bounds)} - ${pct(dropPreview.start, bounds)})`,
                }}
                aria-hidden="true"
              >
                {formatRange(dropPreview.start, dropPreview.end)}
              </div>
            )}

            {daySessions.map((session) => (
              <SessionBlock
                key={session.subject.id}
                session={session}
                bounds={bounds}
                placement={lanes.get(session.subject.id)}
                clash={clashes.has(session.subject.id)}
                canEdit={canEdit}
                canOpen={canOpen}
                plan={plans[session.subject.id]}
                showTopics={showTopics}
                onOpen={onOpen}
                onRemove={onRemove}
                onDragStart={onDragStart}
                onDragEnd={() => {
                  setDropPreview(null)
                  onDragEnd()
                }}
              />
            ))}

            {day === today && showNow && (
              <div className="tt-grid__now" style={{ top: pct(nowMinutes, bounds) }} aria-hidden="true" />
            )}
          </div>
        )
      })}
    </div>
  )
}
