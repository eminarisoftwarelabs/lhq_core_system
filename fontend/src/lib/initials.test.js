import { describe, expect, it } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it('takes the first letter of the first and last name', () => {
    expect(initials('Alice Wang')).toBe('AW')
  })

  it('uppercases the result', () => {
    expect(initials('alice wang')).toBe('AW')
  })

  it('doubles the first letter for a single-word name', () => {
    expect(initials('Cher')).toBe('CC')
  })

  it('uses first and last of a longer name, skipping middle names', () => {
    expect(initials('Alice Beatrice Wang')).toBe('AW')
  })

  it('tolerates extra whitespace', () => {
    expect(initials('  Alice   Wang  ')).toBe('AW')
  })

  it('falls back to "?" for empty or missing input', () => {
    expect(initials('')).toBe('?')
    expect(initials(undefined)).toBe('?')
    expect(initials(null)).toBe('?')
  })
})
