// Pure helpers for a tutor's subjects, working hours and change requests.
// Shapes match the API: subjects carry {id, name, level, level_name};
// working-hours blocks are {weekday, start_time, end_time} with weekday
// 0 = Monday ... 6 = Sunday and times "HH:MM".

import { dayLabel } from './constants'

/**
 * Subjects -> [{levelId, levelName, subjects}], levels in the order they
 * first appear (the API already orders by level, then name) and subjects
 * by name within each level.
 */
export function groupByLevel(subjects) {
  const groups = new Map()
  for (const subject of subjects ?? []) {
    const key = subject.level ?? 'none'
    if (!groups.has(key)) {
      groups.set(key, { levelId: subject.level ?? null, levelName: subject.level_name || 'Other', subjects: [] })
    }
    groups.get(key).subjects.push(subject)
  }
  for (const group of groups.values()) {
    group.subjects.sort((a, b) => a.name.localeCompare(b.name))
  }
  return [...groups.values()]
}

/** "IGCSE Physics" - a subject name is only unique within its level. */
export function subjectLabel(subject) {
  return subject.level_name ? `${subject.level_name} ${subject.name}` : subject.name
}

/** Comma-separated names of who teaches a subject (staff responses only). */
export function tutorNames(subject) {
  return (subject?.tutors ?? []).map((t) => t.name).join(', ')
}

/** Names of the tutors two subjects have in common. */
export function sharedTutorNames(a, b) {
  const ids = new Set((a?.tutors ?? []).map((t) => t.id))
  return (b?.tutors ?? []).filter((t) => ids.has(t.id)).map((t) => t.name)
}

/** Whether two subjects have a tutor in common. */
export function sharesTutor(a, b) {
  const ids = new Set((a?.tutors ?? []).map((t) => t.id))
  return (b?.tutors ?? []).some((t) => ids.has(t.id))
}

function hhmm(value) {
  return (value ?? '').slice(0, 5)
}

export function normaliseBlock(block) {
  return { weekday: Number(block.weekday), start_time: hhmm(block.start_time), end_time: hhmm(block.end_time) }
}

export function blockKey(block) {
  const b = normaliseBlock(block)
  return `${b.weekday}|${b.start_time}|${b.end_time}`
}

export function sortBlocks(blocks) {
  return [...(blocks ?? [])].map(normaliseBlock).sort((a, b) => blockKey(a).localeCompare(blockKey(b)))
}

export function formatBlock(block) {
  const b = normaliseBlock(block)
  return `${dayLabel(b.weekday)} ${b.start_time} to ${b.end_time}`
}

function diffBy(current, proposed, key) {
  const currentKeys = new Set(current.map(key))
  const proposedKeys = new Set(proposed.map(key))
  return {
    added: proposed.filter((item) => !currentKeys.has(key(item))),
    removed: current.filter((item) => !proposedKeys.has(key(item))),
    unchanged: proposed.filter((item) => currentKeys.has(key(item))),
  }
}

/** Current vs proposed subjects, compared by id. */
export function diffSubjects(current, proposed) {
  return diffBy(current ?? [], proposed ?? [], (s) => s.id)
}

/** Current vs proposed working hours, compared block by block. */
export function diffHours(current, proposed) {
  return diffBy(sortBlocks(current), sortBlocks(proposed), blockKey)
}

export function sameSubjectIds(a, b) {
  const left = [...new Set(a)].sort((x, y) => x - y)
  const right = [...new Set(b)].sort((x, y) => x - y)
  return left.length === right.length && left.every((id, i) => id === right[i])
}

export function sameHours(a, b) {
  const left = sortBlocks(a).map(blockKey)
  const right = sortBlocks(b).map(blockKey)
  return left.length === right.length && left.every((k, i) => k === right[i])
}

/**
 * What a tutor's own profile should show for one kind of change: the
 * newest request that isn't cancelled, if it is PENDING (awaiting review)
 * or REJECTED (show the reason until they try again). An APPROVED request
 * is already live, so there is nothing extra to show.
 */
export function openRequestFor(requests, kind) {
  const latest = (requests ?? []).find((r) => r.kind === kind && r.status !== 'CANCELLED')
  if (!latest || latest.status === 'APPROVED') return null
  return latest
}

/** A tutor is only suggested for new students once both are set. */
export function teachingSetupMissing(subjects, hours) {
  return (subjects ?? []).length === 0 || (hours ?? []).length === 0
}

export const SETUP_WARNING = "Won't be suggested for new students until subjects and working hours are set."

let rowSeq = 0

/** Blocks -> editor rows, each with a stable `key` for React. */
export function toRows(blocks) {
  return sortBlocks(blocks).map((b) => ({ ...b, key: `row-${(rowSeq += 1)}` }))
}

/** A fresh editor row: the day after the last row's, or Monday. */
export function newRow(rows) {
  const last = rows[rows.length - 1]
  const weekday = last ? (last.weekday + 1) % 7 : 0
  return { weekday, start_time: '08:00', end_time: '12:00', key: `row-${(rowSeq += 1)}` }
}

/** Editor rows -> the API's blocks (no keys, numbers for days). */
export function fromRows(rows) {
  return rows.map(({ weekday, start_time, end_time }) => ({ weekday: Number(weekday), start_time, end_time }))
}
