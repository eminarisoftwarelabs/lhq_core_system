import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

// A labelled password input with a show/hide toggle. `label` is the
// input's accessible name; the toggle names itself after it ("Show new
// password") so two fields on one form stay distinguishable.
export function PasswordField({ id, label, value, onChange, autoComplete, children, ...inputProps }) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye

  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field__control">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...inputProps}
        />
        <button
          type="button"
          className="password-field__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {children}
    </div>
  )
}
