export function FieldErrors({ errors, field }) {
  const messages = errors?.[field]
  if (!messages || messages.length === 0) return null
  return (
    <ul className="field-error" role="alert">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  )
}

export function NonFieldErrors({ errors }) {
  // errors.detail may be a single string (PermissionDenied etc.) or an
  // array (an explicit {'detail': [...]} raised from a view) - concat
  // normalizes either shape into a flat array without double-nesting.
  const messages = errors?.detail
    ? [].concat(errors.detail)
    : errors?.non_field_errors || []
  if (!messages.length) return null
  return (
    <ul className="form-error" role="alert">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  )
}
