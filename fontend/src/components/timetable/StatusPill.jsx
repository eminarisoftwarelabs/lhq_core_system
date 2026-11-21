import { statusLabel, statusTone } from '../../lib/sessions'

export function StatusPill({ status }) {
  return <span className={`status-pill status-pill--${statusTone(status)}`}>{statusLabel(status)}</span>
}
