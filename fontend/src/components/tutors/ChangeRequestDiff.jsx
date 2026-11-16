import { blockKey, diffHours, diffSubjects, formatBlock, sortBlocks, subjectLabel } from '../../lib/tutorTeaching'

const KINDS = {
  SUBJECTS: {
    key: (s) => String(s.id),
    label: subjectLabel,
    order: (items) => items,
    diff: diffSubjects,
    empty: 'No subjects',
  },
  WORKING_HOURS: {
    key: blockKey,
    label: formatBlock,
    order: sortBlocks,
    diff: diffHours,
    empty: 'No working hours',
  },
}

function Column({ title, items, kind, marked, state }) {
  const { key, label, empty } = KINDS[kind]
  return (
    <div className="change-diff__column">
      <p className="change-diff__title">{title}</p>
      {items.length === 0 ? (
        <p className="form-note">{empty}</p>
      ) : (
        <ul className="change-diff__list">
          {items.map((item) => {
            const isMarked = marked.has(key(item))
            // The word is in the DOM (not just a color) so the difference
            // survives a screen reader, high contrast and print.
            return (
              <li key={key(item)} className={`change-diff__item${isMarked ? ` change-diff__item--${state}` : ''}`}>
                <span>{label(item)}</span>
                {isMarked && <span className="change-diff__tag">{state === 'added' ? 'Added' : 'Removed'}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * Current next to proposed, marking what the proposal adds and removes.
 * Leave `current` out (a tutor's own pending request) to show only the
 * proposal.
 */
export function ChangeRequestDiff({ kind, current, proposed }) {
  const spec = KINDS[kind]
  const none = new Set()

  if (current === undefined) {
    return (
      <div className="change-diff change-diff--single">
        <Column title="Proposed" items={spec.order(proposed)} kind={kind} marked={none} />
      </div>
    )
  }

  const diff = spec.diff(current, proposed)
  return (
    <div className="change-diff">
      <Column
        title="Current"
        items={spec.order(current)}
        kind={kind}
        marked={new Set(diff.removed.map(spec.key))}
        state="removed"
      />
      <Column
        title="Proposed"
        items={spec.order(proposed)}
        kind={kind}
        marked={new Set(diff.added.map(spec.key))}
        state="added"
      />
    </div>
  )
}
