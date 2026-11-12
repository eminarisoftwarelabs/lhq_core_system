import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'
import {
  THEMES,
  computeProperty,
  contrastRatio,
  flattenOver,
  parseCss,
  resolveRootVars,
  resolveValue,
  toRgb,
} from '../test-utils/cssCascade'

/* Gate for Task 0 (LHQ brand restyle). The brand lives in tokens in
 * index.css; these checks pin the brand values, prove every token pair the
 * restyle introduced stays readable in all three theme states, and guard
 * the wiring that the contrast harness cannot see on its own (descendant
 * selectors such as `.app-header .icon-button` are outside its model).
 */

const ROOT = cwd()
const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8')
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const rules = parseCss(css)

const THEME_CASES = [
  ['light', THEMES.light],
  ['dark (toggle)', THEMES.darkExplicit],
  ['dark (system)', THEMES.darkSystem],
]

function tokens(theme) {
  const vars = resolveRootVars(rules, theme)
  return (name) => {
    expect(vars[name], `${name} is not defined`).toBeDefined()
    return resolveValue(`var(${name})`, vars)
  }
}

/** Contrast of `fg` over `bg`, with translucent colors flattened onto `base`. */
function contrast(fg, bg, base = bg) {
  const solidBg = flattenOver(bg, base)
  return contrastRatio(flattenOver(fg, solidBg), solidBg)
}

/** Last declaration of `prop` in a top-level (non-@media) rule for `selector`. */
function decl(selector, prop) {
  return rules
    .filter((rule) => rule.selector === selector && !rule.media)
    .flatMap((rule) => rule.decls.filter((d) => d.prop === prop))
    .at(-1)?.value
}

describe('brand palette', () => {
  const t = tokens(THEMES.light)

  it.each([
    ['--brand-navy', '#073763'],
    ['--brand-gold', '#f4b223'],
    ['--brand-ink', '#1d2433'],
    ['--brand-muted', '#5f6b7d'],
    ['--brand-line', '#dde2ea'],
    ['--brand-page', '#eef1f5'],
    ['--brand-panel', '#ffffff'],
    ['--brand-field', '#f6f8fb'],
    ['--brand-danger', '#b42318'],
    ['--brand-success', '#1f7a4d'],
    ['--brand-whatsapp', '#1f9d55'],
  ])('%s is %s', (name, value) => {
    expect(t(name)).toBe(value)
  })

  it.each([
    ['--bg-page', '#eef1f5'],
    ['--bg-surface', '#ffffff'],
    ['--bg-field', '#f6f8fb'],
    ['--bg-field-focus', '#ffffff'],
    ['--text-primary', '#1d2433'],
    ['--text-secondary', '#5f6b7d'],
    ['--border-default', '#dde2ea'],
    ['--danger', '#b42318'],
    ['--success', '#1f7a4d'],
    ['--nav-active-bg', '#073763'],
    ['--text-nav-active', '#ffffff'],
    ['--button-primary-bg', '#f4b223'],
    ['--button-primary-fg', '#073763'],
    ['--header-bg', '#073763'],
    ['--header-fg', '#ffffff'],
  ])('light theme maps %s onto the brand (%s)', (name, value) => {
    expect(t(name)).toBe(value)
  })

  it('keeps the two dark blocks (OS preference, explicit toggle) identical', () => {
    expect(resolveRootVars(rules, THEMES.darkSystem)).toEqual(resolveRootVars(rules, THEMES.darkExplicit))
  })
})

describe('dark mode reads as LHQ navy, not purple-grey', () => {
  for (const [name, theme] of THEME_CASES.slice(1)) {
    it.each(['--bg-page', '--bg-sidebar', '--bg-surface', '--bg-surface-muted', '--header-bg'])(
      `%s is a blue-dominant navy in ${name}`,
      (token) => {
        const [r, g, b] = toRgb(tokens(theme)(token))
        expect(b).toBeGreaterThan(r + 20)
        expect(b).toBeGreaterThan(g)
      },
    )

    it(`keeps gold as the primary action color in ${name}`, () => {
      expect(tokens(theme)('--button-primary-bg')).toBe('#f4b223')
    })
  }
})

describe('brand token pairs stay readable', () => {
  // [label, foreground, background, minimum ratio, optional base under a translucent bg]
  const PAIRS = [
    ['body text on page', '--text-primary', '--bg-page', 4.5],
    ['body text on panel', '--text-primary', '--bg-surface', 4.5],
    ['muted text on page', '--text-secondary', '--bg-page', 4.5],
    ['muted text on panel', '--text-secondary', '--bg-surface', 4.5],
    ['field text', '--text-primary', '--bg-field', 4.5],
    ['focused field text', '--text-primary', '--bg-field-focus', 4.5],
    ['placeholder-level text in a field', '--text-secondary', '--bg-field', 4.5],
    ['nav item', '--text-nav', '--bg-sidebar', 4.5],
    ['nav item hover', '--text-nav-hover', '--nav-hover-bg', 4.5],
    ['active nav item', '--text-nav-active', '--nav-active-bg', 4.5],
    ['primary button', '--button-primary-fg', '--button-primary-bg', 4.5],
    ['primary button hover', '--button-primary-fg', '--button-primary-hover-bg', 4.5],
    ['selected option', '--selected-fg', '--selected-bg', 4.5],
    ['selected option hover', '--selected-fg', '--selected-hover-bg', 4.5],
    ['danger text on panel', '--danger', '--bg-surface', 4.5],
    ['header text', '--header-fg', '--header-bg', 4.5],
    ['header icon', '--header-fg-muted', '--header-bg', 4.5],
    ['header icon hover', '--header-fg', '--header-hover-bg', 4.5, '--header-bg'],
    ['accent mark', '--accent-fg', '--accent', 4.5],
    // Non-text UI (focus indicators) needs 3:1 against what it sits on.
    ['focus ring on panel', '--focus-ring', '--bg-surface', 3],
    ['focus ring on page', '--focus-ring', '--bg-page', 3],
    ['header focus ring', '--header-focus-ring', '--header-bg', 3],
  ]

  for (const [name, theme] of THEME_CASES) {
    const t = tokens(theme)
    it.each(PAIRS)(`%s in ${name}`, (_label, fg, bg, min, base) => {
      expect(contrast(t(fg), t(bg), base ? t(base) : t(bg))).toBeGreaterThanOrEqual(min)
    })
  }
})

describe('buttons', () => {
  for (const [name, theme] of THEME_CASES) {
    const t = tokens(theme)
    const style = (classes, prop, hover = false) =>
      computeProperty(rules, { tag: 'button', classes, hover }, theme, prop)?.value

    it(`a plain button is gold with navy text in ${name}`, () => {
      expect(style([], 'background')).toBe(t('--brand-gold'))
      expect(style([], 'color')).toBe(t('--brand-navy'))
    })

    it(`a plain button is bold in ${name}`, () => {
      expect(style([], 'font-weight')).toBe('700')
    })

    it(`secondary is the panel color with a border in ${name}`, () => {
      expect(style(['button', 'button--secondary'], 'background')).toBe(t('--bg-surface'))
      expect(style(['button', 'button--secondary'], 'border-color')).toBe(t('--border-default'))
    })

    it(`danger keeps red text on no fill in ${name}`, () => {
      expect(style(['button', 'button--danger'], 'background')).toBe('transparent')
      expect(style(['button', 'button--danger'], 'color')).toBe(t('--danger'))
    })
  }

  it('has no theme-scoped rule repainting every button', () => {
    // The old black/white dark flip sat at (0,2,1) and silently beat every
    // component's own button styling in dark mode. Buttons theme through
    // tokens now; a rule like this must not come back.
    const flips = rules.filter((rule) =>
      /^:root\S*\s+(button|\.button)(:hover)?$/.test(rule.selector.trim()),
    )
    expect(flips.map((rule) => rule.selector)).toEqual([])
  })
})

describe('navigation and selection', () => {
  it('paints the active nav item from the nav-active tokens', () => {
    expect(decl('.nav-item--active', 'background')).toBe('var(--nav-active-bg)')
    expect(decl('.nav-item--active', 'color')).toBe('var(--text-nav-active)')
  })

  it('paints selected subject chips and switches from the selected tokens', () => {
    expect(decl('.subject-chip--selected', 'background')).toBe('var(--selected-bg)')
    expect(decl('.subject-chip--selected', 'color')).toBe('var(--selected-fg)')
    expect(decl(".checkbox-label input[type='checkbox']:checked", 'background')).toBe('var(--selected-bg)')
  })
})

describe('header', () => {
  it('is a navy bar with header-colored text', () => {
    expect(decl('.app-header', 'background')).toBe('var(--header-bg)')
    expect(decl('.app-header', 'color')).toBe('var(--header-fg)')
    expect(decl('.app-header__title', 'color')).toBe('var(--header-fg)')
    expect(decl('.app-header__greeting', 'color')).toBe('var(--header-fg)')
  })

  it('has a gold accent line along its lower edge in every theme', () => {
    expect(decl('.app-header', 'border-bottom')).toBe('2px solid var(--header-border)')
    for (const [, theme] of THEME_CASES) expect(tokens(theme)('--header-border')).toBe('#f4b223')
  })

  it('keeps its icon buttons and account menu readable on navy', () => {
    expect(decl('.app-header .icon-button', 'color')).toBe('var(--header-fg-muted)')
    expect(decl('.app-header .icon-button:hover', 'background')).toBe('var(--header-hover-bg)')
    expect(decl('.app-header .icon-button:hover', 'color')).toBe('var(--header-fg)')
    expect(decl('.app-header .icon-button:focus-visible', 'outline-color')).toBe('var(--header-focus-ring)')
    expect(decl('.app-header .user-menu__trigger', 'color')).toBe('var(--header-fg)')
  })

  it('leaves the account dropdown on the panel colors', () => {
    expect(decl('.user-menu__panel', 'background')).toBe('var(--bg-surface)')
    expect(decl('.user-menu__item', 'color')).toBe('var(--text-primary)')
  })
})

describe('inputs', () => {
  it.each(['input', 'select', 'textarea'])('%s sits on the field color and lifts on focus', (tag) => {
    const bg = computeProperty(rules, { tag, classes: [], hover: false }, THEMES.light, 'background')
    expect(bg.value).toBe('#f6f8fb')
    expect(decl(`${tag}:focus`, 'background-color')).toBe('var(--bg-field-focus)')
  })

  it('turns a focused field white in light mode', () => {
    expect(tokens(THEMES.light)('--bg-field-focus')).toBe('#ffffff')
  })
})

describe('logo', () => {
  it.each(['logo.png', 'arrow.png'])('ships public/%s', (file) => {
    expect(existsSync(join(ROOT, 'public', file))).toBe(true)
  })

  it('uses arrow.png as the favicon', () => {
    expect(html).toMatch(/<link rel="icon"[^>]*href="\/arrow\.png"/)
    expect(html).not.toMatch(/favicon\.svg/)
  })

  it('puts the logo on a white chip in every theme', () => {
    expect(decl('.sidebar__logo-chip', 'background')).toBe('var(--logo-chip-bg)')
    for (const [, theme] of THEME_CASES) expect(tokens(theme)('--logo-chip-bg')).toBe('#ffffff')
  })

  it('swaps to the small mark in the collapsed sidebar instead of squashing the logo', () => {
    const collapsed = (selector, prop) =>
      rules
        .filter((rule) => rule.selector === selector && rule.media?.includes('min-width: 768px'))
        .flatMap((rule) => rule.decls.filter((d) => d.prop === prop))
        .at(-1)?.value
    expect(decl('.sidebar__logo-mark', 'display')).toBe('none')
    expect(collapsed('.sidebar--collapsed .sidebar__logo-full', 'display')).toBe('none')
    expect(collapsed('.sidebar--collapsed .sidebar__logo-mark', 'display')).toBe('block')
  })
})

describe('fonts', () => {
  it('keeps Inter as the app font', () => {
    expect(tokens(THEMES.light)('--font-primary')).toMatch(/^'Inter'/)
  })

  it('loads Carlito from Google Fonts', () => {
    expect(html).toMatch(/fonts\.googleapis\.com\/css2\?[^"]*family=Carlito/)
  })

  it('exposes Carlito as --font-document without applying it yet', () => {
    expect(tokens(THEMES.light)('--font-document')).toMatch(/'Carlito'/)
    const uses = css.match(/var\(--font-document\)/g) ?? []
    expect(uses).toEqual([])
  })
})

describe('colors live in index.css only', () => {
  function sourceFiles(dir) {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return name === 'test-utils' ? [] : sourceFiles(path)
      return /\.(jsx?|css)$/.test(name) && !/\.test\.jsx?$/.test(name) && name !== 'index.css' ? [path] : []
    })
  }

  it('has no hex colors in components, pages or other stylesheets', () => {
    const offenders = []
    for (const path of sourceFiles(join(ROOT, 'src'))) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (/#[0-9a-fA-F]{3,8}\b/.test(line)) offenders.push(`${path}:${index + 1}`)
        })
    }
    expect(offenders).toEqual([])
  })
})
