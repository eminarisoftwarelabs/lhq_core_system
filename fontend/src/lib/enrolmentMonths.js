// Groups students under the month they enrolled (their `enrolled_on` date),
// newest month first. Months are read off the date string itself, never
// through Date parsing, so the month cannot shift with the viewer's timezone.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthKey(isoDate) {
  return isoDate ? isoDate.slice(0, 7) : ''
}

export function monthLabel(key) {
  const [year, month] = key.split('-')
  return `${MONTHS[Number(month) - 1]} ${year}`
}

// students: API rows with `enrolled_on` ('YYYY-MM-DD'). Returns
// [{ key: '2026-11', label: 'November 2026', students: [...] }], newest
// month first, only months that have students. Inside a month the rows keep
// the order they came in (the API sorts newest enrolment first, then name).
export function groupByEnrolmentMonth(students) {
  const groups = new Map()
  for (const student of students) {
    const key = monthKey(student.enrolled_on)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(student)
  }
  return [...groups.keys()]
    .sort()
    .reverse()
    .map((key) => ({ key, label: monthLabel(key), students: groups.get(key) }))
}

// Months open by default: this month and last month, or every month when
// there are only one or two. If none of those exist (old data), the newest
// month stays open. `groups` come from groupByEnrolmentMonth.
export function defaultOpenMonths(groups, today = new Date()) {
  if (groups.length <= 2) return new Set(groups.map((g) => g.key))
  const current = new Date(today.getFullYear(), today.getMonth(), 1)
  const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const wanted = new Set([current, previous].map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`))
  const present = groups.filter((g) => wanted.has(g.key)).map((g) => g.key)
  return present.length ? new Set(present) : new Set([groups[0].key])
}

// Reads every page of a DRF page-number list, so a month is never cut in
// half by a page boundary. `fetchPage(n)` returns { results, next }.
export async function fetchAllPages(fetchPage) {
  const first = await fetchPage(1)
  const results = [...first.results]
  let next = first.next
  let page = 1
  while (next) {
    page += 1
    const res = await fetchPage(page)
    results.push(...res.results)
    next = res.next
  }
  return results
}
