/**
 * The student's topics for a subject as checkboxes. `topics` are
 * [{id, number, name, covered_before}]; topics covered in an earlier Held
 * session are marked "Done" (they can still be ticked again).
 */
export function TopicChecklist({ topics, selected, onChange, disabled = false, label }) {
  const chosen = new Set(selected)

  function toggle(id) {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  if (topics.length === 0) return <p className="form-note">No topics for this subject yet.</p>

  return (
    <ul className="topic-checklist" aria-label={label}>
      {topics.map((topic) => (
        <li key={topic.id} className="topic-checklist__item">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={chosen.has(topic.id)}
              disabled={disabled}
              onChange={() => toggle(topic.id)}
            />
            {/* Spaces as their own text nodes: accessible names join
                adjacent elements with nothing between them. */}
            <span>
              {topic.number && <span className="topic-checklist__number">{topic.number}</span>}
              {topic.number && ' '}
              {topic.name}
            </span>
            {topic.covered_before && ' '}
            {topic.covered_before && <span className="topic-checklist__done">(done)</span>}
          </label>
        </li>
      ))}
    </ul>
  )
}
