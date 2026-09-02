import { forwardRef } from 'react'

const VARIANT_CLASS = {
  primary: 'button--primary',
  secondary: 'button--secondary',
  danger: 'button--danger',
  ghost: 'button--ghost',
  icon: 'icon-button',
}

// Shared button primitive. Plain unclassed <button> elements elsewhere in
// the app already inherit the primary look from the global `button` rule in
// index.css, so this component exists for call sites that need a specific
// variant (secondary, danger, ghost, or an icon-only trigger).
export const Button = forwardRef(function Button(
  { variant = 'primary', className = '', type = 'button', ...props },
  ref,
) {
  const variantClass = VARIANT_CLASS[variant] ?? VARIANT_CLASS.primary
  return (
    <button ref={ref} type={type} className={[variantClass, className].filter(Boolean).join(' ')} {...props} />
  )
})
