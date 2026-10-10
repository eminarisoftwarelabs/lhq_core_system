import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'
import { parseCss } from '../test-utils/cssCascade'

/* Regression gate for the phone-width breakages found by measuring every
 * route at 320-1920px in a real browser:
 *   - .data-table tables burst out of their cards (a table cannot shrink
 *     below its content) on the student, enquiry and invoice detail pages
 *   - a <table className="visually-hidden"> kept its full content width and
 *     gave the whole dashboard a sideways scroll
 *   - the header title was left ~135px and truncated to a word and a half
 *   - the session dialog was sized in vh, which the mobile address bar eats
 * jsdom does no layout, so these assert the source shapes that caused each
 * one rather than pixel positions.
 */

const SRC = join(cwd(), 'src')
const css = readFileSync(join(SRC, 'index.css'), 'utf8')
const rules = parseCss(css)

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.jsx$/.test(name) && !/\.test\.jsx$/.test(name) ? [path] : []
  })
}

function decl(selector, prop, media = null) {
  const matches = rules.filter(
    (rule) => rule.selector === selector && (media ? rule.media?.includes(media) : !rule.media),
  )
  // Later declarations win, both across rules and inside one rule.
  return matches.flatMap((rule) => rule.decls.filter((d) => d.prop === prop)).at(-1)?.value
}

const files = sourceFiles(SRC).map((path) => ({ path, lines: readFileSync(path, 'utf8').split('\n') }))

describe('responsive: tables', () => {
  it('finds the data tables it is meant to guard', () => {
    const count = files.flatMap((f) => f.lines).filter((line) => /<table className="data-table/.test(line)).length
    expect(count).toBeGreaterThanOrEqual(5)
  })

  it('wraps every .data-table in a .table-scroll container', () => {
    const unwrapped = []
    for (const { path, lines } of files) {
      lines.forEach((line, index) => {
        if (!/<table className="data-table/.test(line)) return
        if (!/className="table-scroll"/.test(lines[index - 1] ?? '')) unwrapped.push(`${path}:${index + 1}`)
      })
    }
    expect(unwrapped).toEqual([])
  })

  it('makes .table-scroll scroll sideways', () => {
    expect(decl('.table-scroll', 'overflow-x')).toBe('auto')
  })

  it('never puts .visually-hidden directly on a <table>', () => {
    const offenders = []
    for (const { path, lines } of files) {
      lines.forEach((line, index) => {
        if (/<table[^>]*visually-hidden/.test(line)) offenders.push(`${path}:${index + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

describe('responsive: header title', () => {
  const LAPTOP = 'max-width: 1279px'
  const PHONE = 'max-width: 767px'

  it.each(['.app-header__title', '.app-header__greeting'])('%s wraps to two lines instead of truncating', (selector) => {
    expect(decl(selector, 'white-space', LAPTOP)).toBe('normal')
    expect(decl(selector, '-webkit-line-clamp', LAPTOP)).toBe('2')
    expect(parseFloat(decl(selector, 'font-size', PHONE))).toBeLessThanOrEqual(20)
  })
})

describe('responsive: narrowest phones (320px)', () => {
  it('never forces a grid column wider than its container', () => {
    const fixed = rules
      .flatMap((rule) => rule.decls.filter((d) => d.prop === 'grid-template-columns').map((d) => [rule.selector, d.value]))
      .filter(([, value]) => {
        const min = /minmax\((\d+)px/.exec(value)
        // 288px is the content width of a 320px phone after page padding.
        return min && Number(min[1]) > 288
      })
    expect(fixed).toEqual([])
  })
})

describe('responsive: dialogs and scroll containers', () => {
  it('sizes the session dialog in dvh so the mobile address bar cannot clip it', () => {
    expect(decl('.tt-dialog', 'max-height')).toContain('100dvh')
  })

  it('keeps onboarding rows inside their scrolling list', () => {
    expect(decl('.onboarding-row', 'margin') ?? '').not.toContain('-1')
  })
})

describe('responsive: onboarding board', () => {
  // auto-fit left two lanes on top and the third orphaned underneath at
  // in-between widths. The pipeline is three across or one stacked column.
  it('lays the three stages out as fixed lanes, not auto-fit', () => {
    expect(decl('.onboarding-board', 'grid-template-columns')).toBe('repeat(3, minmax(0, 1fr))')
  })

  it('stacks to a single column from the page width, not the viewport', () => {
    expect(decl('.page--onboarding', 'container')).toBe('onboarding / inline-size')
    const stacked = /@container onboarding \(max-width: 671px\) \{\s*\.onboarding-board \{\s*grid-template-columns: minmax\(0, 1fr\);/
    expect(css).toMatch(stacked)
  })
})
