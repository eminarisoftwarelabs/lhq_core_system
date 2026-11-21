import { afterEach, describe, expect, it, vi } from 'vitest'
import { readView, writeView } from './viewPreference'

const VIEWS = ['thumbnails', 'list']

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('viewPreference', () => {
  it('falls back to the default when nothing is stored', () => {
    expect(readView('k', VIEWS, 'thumbnails')).toBe('thumbnails')
  })

  it('remembers a stored choice', () => {
    writeView('k', 'list')
    expect(readView('k', VIEWS, 'thumbnails')).toBe('list')
  })

  it('ignores a stored value that is not an allowed view', () => {
    window.localStorage.setItem('k', 'grid')
    expect(readView('k', VIEWS, 'thumbnails')).toBe('thumbnails')
  })

  it('falls back when storage throws on read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readView('k', VIEWS, 'thumbnails')).toBe('thumbnails')
  })

  it('does not throw when storage refuses a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => writeView('k', 'list')).not.toThrow()
  })
})
