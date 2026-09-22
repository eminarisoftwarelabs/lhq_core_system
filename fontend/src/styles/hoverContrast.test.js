import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'
import { THEMES, computeProperty, contrastRatio, parseCss } from '../test-utils/cssCascade'

/* Regression gate for a specific, repeatable failure: a base `:hover` rule
 * outranking a selected/active state rule on specificity, so the label is
 * repainted to a color that matches its own fill and the text disappears
 * under the cursor. It shipped once on .subject-chip--selected in light mode
 * (the chip went solid black with black text on hover). These assertions
 * measure the user-visible symptom - contrast - not the shape of the CSS, so
 * any future fix that keeps the text readable passes.
 */

// The jsdom environment gives import.meta.url an http:// origin, so resolve
// from the vitest root instead.
const css = readFileSync(join(cwd(), 'src/index.css'), 'utf8')
const rules = parseCss(css)

const THEME_CASES = [
  ['light', THEMES.light],
  ['dark (toggle)', THEMES.darkExplicit],
  ['dark (system)', THEMES.darkSystem],
]

// Backgrounds cascade from ancestors; when an element sets none, fall back to
// the page surface it actually sits on.
const PAGE_FALLBACK = '--bg-page'

function computed(el, theme, prop) {
  return computeProperty(rules, el, theme, prop)
}

function resolvedBackground(el, theme) {
  const bg = computed(el, theme, 'background') || computed(el, theme, 'background-color')
  if (bg && bg.value !== 'transparent' && bg.value !== 'none') return bg.value
  const root = computeProperty(rules, { tag: 'html', classes: [], hover: false }, theme, PAGE_FALLBACK)
  return root ? root.value : '#ffffff'
}

function contrastFor(el, theme) {
  const color = computed(el, theme, 'color')
  expect(color, `no color resolved for .${el.classes.join('.')}`).not.toBeNull()
  return contrastRatio(color.value, resolvedBackground(el, theme))
}

describe('cssCascade harness', () => {
  it('lets a later, equally specific rule win', () => {
    const sheet = parseCss('.a { color: #111; } .a { color: #222; }')
    expect(computeProperty(sheet, { tag: 'span', classes: ['a'], hover: false }, THEMES.light, 'color').value).toBe(
      '#222',
    )
  })

  it('lets a more specific earlier rule beat a less specific later one', () => {
    const sheet = parseCss('.a:hover { color: #111; } .a--on { color: #222; }')
    const el = { tag: 'span', classes: ['a', 'a--on'], hover: true }
    expect(computeProperty(sheet, el, THEMES.light, 'color').value).toBe('#111')
  })

  it('honours :not() exclusions', () => {
    const sheet = parseCss('.a:not(.a--on):hover { color: #111; } .a--on { color: #222; }')
    const el = { tag: 'span', classes: ['a', 'a--on'], hover: true }
    expect(computeProperty(sheet, el, THEMES.light, 'color').value).toBe('#222')
  })

  it('resolves var() chains and root theme overrides', () => {
    const sheet = parseCss(
      ":root { --ink: #111; } :root[data-theme='dark'] { --ink: #eee; } .a { color: var(--ink); }",
    )
    const el = { tag: 'span', classes: ['a'], hover: false }
    expect(computeProperty(sheet, el, THEMES.light, 'color').value).toBe('#111')
    expect(computeProperty(sheet, el, THEMES.darkExplicit, 'color').value).toBe('#eee')
  })

  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5)
  })
})

describe('subject chips stay readable', () => {
  for (const [name, theme] of THEME_CASES) {
    const selected = { tag: 'label', classes: ['subject-chip', 'subject-chip--selected'], hover: false }
    const selectedHover = { ...selected, hover: true }
    const idle = { tag: 'label', classes: ['subject-chip'], hover: false }
    const idleHover = { ...idle, hover: true }

    it(`selected chip has readable text in ${name}`, () => {
      expect(contrastFor(selected, theme)).toBeGreaterThanOrEqual(4.5)
    })

    it(`selected chip stays readable on hover in ${name}`, () => {
      expect(contrastFor(selectedHover, theme)).toBeGreaterThanOrEqual(4.5)
    })

    it(`unselected chip stays readable on hover in ${name}`, () => {
      expect(contrastFor(idleHover, theme)).toBeGreaterThanOrEqual(4.5)
    })

    it(`hover gives the selected chip a visible state change in ${name}`, () => {
      const before = resolvedBackground(selected, theme)
      const after = resolvedBackground(selectedHover, theme)
      expect(after).not.toBe(before)
    })

    it(`hover gives the unselected chip a visible state change in ${name}`, () => {
      const before = computed(idle, theme, 'border-color') || computed(idle, theme, 'border')
      const after = computed(idleHover, theme, 'border-color') || computed(idleHover, theme, 'border')
      expect(after.value).not.toBe(before.value)
    })
  }
})

describe('other stateful controls stay readable on hover', () => {
  const CONTROLS = [
    { label: 'nav item', tag: 'a', base: ['nav-item'], active: ['nav-item', 'nav-item--active'] },
  ]

  for (const [name, theme] of THEME_CASES) {
    for (const control of CONTROLS) {
      it(`${control.label} active + hover is readable in ${name}`, () => {
        const el = { tag: control.tag, classes: control.active, hover: true }
        expect(contrastFor(el, theme)).toBeGreaterThanOrEqual(4.5)
      })

      it(`${control.label} hover is readable in ${name}`, () => {
        const el = { tag: control.tag, classes: control.base, hover: true }
        expect(contrastFor(el, theme)).toBeGreaterThanOrEqual(4.5)
      })
    }

    it(`primary button hover is readable in ${name}`, () => {
      const el = { tag: 'button', classes: [], hover: true }
      expect(contrastFor(el, theme)).toBeGreaterThanOrEqual(4.5)
    })
  }
})
