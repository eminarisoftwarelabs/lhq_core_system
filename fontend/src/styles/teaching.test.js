import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'
import {
  THEMES,
  colorMixToRgba,
  computeProperty,
  contrastRatio,
  flattenOver,
  parseCss,
  resolveRootVars,
  resolveValue,
} from '../test-utils/cssCascade'

/* Contrast gate for the tutors-and-subjects screens: badges, diff
 * highlights, the setup warning and the header bell, in every theme. */

const css = readFileSync(join(cwd(), 'src/index.css'), 'utf8')
const rules = parseCss(css)

const THEME_CASES = [
  ['light', THEMES.light],
  ['dark (toggle)', THEMES.darkExplicit],
  ['dark (system)', THEMES.darkSystem],
]

function tokens(theme) {
  return resolveRootVars(rules, theme)
}

// Paint `el` the way the browser would: its own background (tints are
// flattened onto what they sit on), over `base`.
function contrast(el, theme, baseToken = '--bg-surface') {
  const vars = tokens(theme)
  const base = resolveValue(`var(${baseToken})`, vars)
  const color = computeProperty(rules, el, theme, 'color')
  expect(color, `no color for .${el.classes.join('.')}`).not.toBeNull()
  const bg = computeProperty(rules, el, theme, 'background')
  const paint = bg && bg.value !== 'transparent' ? flattenOver(bg.value, base) : base
  return contrastRatio(color.value, paint)
}

describe('colorMixToRgba', () => {
  it('turns a transparent tint into rgba', () => {
    expect(colorMixToRgba('color-mix(in srgb, #1f7a4d 14%, transparent)')).toBe('rgba(31, 122, 77, 0.14)')
  })

  it('leaves anything else alone', () => {
    expect(colorMixToRgba('#ffffff')).toBe('#ffffff')
    expect(colorMixToRgba('color-mix(in srgb, red 50%, blue)')).toBe('color-mix(in srgb, red 50%, blue)')
  })
})

describe('tutors and subjects: readable in every theme', () => {
  const CASES = [
    ['Core / Extended badge', { tag: 'span', classes: ['stage-badge', 'paper-badge'] }],
    ['Extended topic badge', { tag: 'span', classes: ['stage-badge', 'extended-badge'] }],
    ['"You teach this" badge', { tag: 'span', classes: ['stage-badge', 'taught-badge'] }],
    ['setup warning', { tag: 'p', classes: ['setup-warning'] }],
    ['added diff row', { tag: 'li', classes: ['change-diff__item', 'change-diff__item--added'] }],
    ['removed diff row', { tag: 'li', classes: ['change-diff__item', 'change-diff__item--removed'] }],
    ['rejected banner', { tag: 'div', classes: ['request-banner', 'request-banner--rejected'] }],
    ['pending banner', { tag: 'div', classes: ['request-banner', 'request-banner--pending'] }],
    ['notification item', { tag: 'button', classes: ['notification-bell__item'] }],
    ['unread notification item', { tag: 'button', classes: ['notification-bell__item', 'notification-bell__item--unread'] }],
    ['hovered notification item', { tag: 'button', classes: ['notification-bell__item'], hover: true }],
    ['notification badge', { tag: 'span', classes: ['notification-bell__badge'] }],
    ['my-subject card', { tag: 'a', classes: ['dashboard-card', 'my-subject-card'] }],
    ['my-subject card level and code', { tag: 'span', classes: ['my-subject-card__meta'] }],
    ['my-subject card lesson time', { tag: 'span', classes: ['my-subject-card__slot'] }],
  ]

  for (const [name, theme] of THEME_CASES) {
    for (const [label, el] of CASES) {
      it(`${label} in ${name}`, () => {
        expect(contrast({ hover: false, ...el }, theme)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})

// The harness matches single elements, not descendants, so the header
// rules are checked as declarations - same approach as brand.test.js.
function decl(selector, prop) {
  return rules
    .filter((rule) => rule.selector === selector && !rule.media)
    .flatMap((rule) => rule.decls.filter((d) => d.prop === prop))
    .at(-1)?.value
}

describe('header bell on the navy bar', () => {
  it('draws the bell in the header color, like the account menu', () => {
    expect(decl('.app-header .notification-bell__trigger', 'color')).toBe('var(--header-fg)')
  })

  it('rings the badge in the header color so it stands off the navy', () => {
    expect(decl('.notification-bell__badge', 'background')).toBe('var(--accent)')
    expect(decl('.notification-bell__badge', 'color')).toBe('var(--accent-fg)')
    expect(decl('.notification-bell__badge', 'box-shadow')).toBe('0 0 0 2px var(--header-bg)')
  })

  it('opens on the panel colors, not the navy', () => {
    expect(decl('.notification-bell__panel', 'background')).toBe('var(--bg-surface)')
  })
})

// "Browse all subjects" sits on the muted card, not the white surface.
describe('subjects view link on the muted card', () => {
  for (const [name, theme] of THEME_CASES) {
    for (const hover of [false, true]) {
      it(`${hover ? 'hovered' : 'resting'} in ${name}`, () => {
        const el = { tag: 'a', classes: ['subjects-view-link'], hover }
        expect(contrast(el, theme, '--bg-surface-muted')).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})

describe('no hardcoded colors in the new rules', () => {
  const PREFIXES = ['.level-group', '.chapter', '.subject-select__', '.setup-warning', '.teaching-', '.hours-', '.request-banner', '.change-', '.notification-bell', '.paper-badge', '.extended-badge', '.taught-badge', '.my-subject', '.subjects-view-link']
  const COLOR_PROPS = /^(color|background|background-color|border|border-color|border-left|border-left-color|text-decoration-color|box-shadow|outline)$/

  it('only reads colors from tokens', () => {
    const offenders = rules
      .filter((rule) => PREFIXES.some((p) => rule.selector.includes(p)))
      .flatMap((rule) => rule.decls.filter((d) => COLOR_PROPS.test(d.prop)).map((d) => `${rule.selector} { ${d.prop}: ${d.value} }`))
      .filter((line) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(line))
    expect(offenders).toEqual([])
  })
})
