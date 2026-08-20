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
  const messages = errors?.detail
    ? [errors.detail]
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
