import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'
import { THEMES, contrastRatio, flattenOver, parseCss, resolveRootVars, resolveValue, toRgb } from '../test-utils/cssCascade'

/* Gate for the Feature 2 timetable styles: every status tint stays
 * readable in every theme, the week is seven columns, and the new rules
 * only read colors from tokens. */

const css = readFileSync(join(cwd(), 'src/index.css'), 'utf8')
const rules = parseCss(css)

const THEME_CASES = [
  ['light', THEMES.light],
  ['dark (toggle)', THEMES.darkExplicit],
  ['dark (system)', THEMES.darkSystem],
]

const TONES = ['scheduled', 'unlogged', 'held', 'not-held', 'missed', 'cancelled', 'moved']

function decl(selector, prop) {
  return rules
    .filter((rule) => rule.selector === selector && !rule.media)
    .flatMap((rule) => rule.decls.filter((d) => d.prop === prop))
    .at(-1)?.value
}

// `color-mix(in srgb, var(--tone) N%, var(--bg-surface))` -> N
function mixPercent(selector) {
  const value = decl(selector, 'background')
  const match = /color-mix\(in srgb, var\(--tone\) (\d+)%, var\(--bg-surface\)\)/.exec(value ?? '')
  expect(match, `${selector} background should tint --tone into --bg-surface, got ${value}`).not.toBeNull()
  return Number(match[1])
}

function mix(color, percent, base) {
  const a = toRgb(color)
  const b = toRgb(base)
  const p = percent / 100
  const channel = (i) => Math.round(a[i] * p + b[i] * (1 - p))
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
}

function token(name, theme) {
  const vars = resolveRootVars(rules, theme)
  const value = resolveValue(`var(${name})`, vars)
  // Translucent tokens (free time) are painted over the surface.
  return flattenOver(value, resolveValue('var(--bg-surface)', vars))
}

describe('timetable: status tints are readable in every theme', () => {
  const surfaces = [
    ['session block', '.tt-session'],
    ['status pill', '.status-pill'],
  ]

  for (const [name, theme] of THEME_CASES) {
    for (const [label, selector] of surfaces) {
      for (const tone of TONES) {
        it(`${label} (${tone}) in ${name}`, () => {
          const paint = mix(token(`--status-${tone}`, theme), mixPercent(selector), token('--bg-surface', theme))
          expect(contrastRatio(token('--text-primary', theme), paint)).toBeGreaterThanOrEqual(4.5)
          // The block's secondary line (student, time) too.
          expect(contrastRatio(token('--text-secondary', theme), paint)).toBeGreaterThanOrEqual(4.5)
        })
      }
    }

    it(`every status has its own token in ${name}`, () => {
      const vars = resolveRootVars(rules, theme)
      for (const tone of TONES) expect(vars[`--status-${tone}`], tone).toBeDefined()
      expect(vars['--free-time-bg']).toBeDefined()
    })
  }
})

describe('timetable: layout', () => {
  it('lays the week out as seven day columns after the hour gutter', () => {
    expect(decl('.tt-grid', 'grid-template-columns')).toBe('52px repeat(7, minmax(0, 1fr))')
  })

  it('maps every status tone to its token on blocks and pills', () => {
    for (const tone of TONES) {
      const block = rules.find((r) => r.selector.split(',').map((s) => s.trim()).includes(`.tt-session--${tone}`))
      expect(block?.decls.find((d) => d.prop === '--tone')?.value, tone).toBe(`var(--status-${tone})`)
      expect(decl(`.status-pill--${tone}`, '--tone')).toBe(`var(--status-${tone})`)
    }
  })
})

describe('timetable: no hardcoded colors in the new rules', () => {
  const PREFIXES = [
    '.tt-',
    '.status-pill',
    '.session-',
    '.ss-',
    '.tutor-hours',
    '.topic-checklist',
    '.conflict-notice',
    '.history-list',
    '.countdown',
    '.time-compare',
    '.month-nav',
  ]
  const COLOR_PROPS = /^(color|background|background-color|border|border-color|border-left|border-left-color|text-decoration-color|box-shadow|outline|--tone)$/

  it('only reads colors from tokens', () => {
    const offenders = rules
      .filter((rule) => PREFIXES.some((p) => rule.selector.includes(p)))
      .flatMap((rule) => rule.decls.filter((d) => COLOR_PROPS.test(d.prop)).map((d) => `${rule.selector} { ${d.prop}: ${d.value} }`))
      .filter((line) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(line))
    expect(offenders).toEqual([])
  })
})
