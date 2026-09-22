/* A tiny, deterministic CSS cascade resolver for stylesheet gate tests.
 *
 * Why this exists: jsdom does not implement :hover, and it does not apply
 * @media (prefers-color-scheme) rules, so `getComputedStyle` cannot answer
 * "what color is a selected subject chip while the mouse is over it, in light
 * mode?" - which is exactly the question behind the class of bug where a
 * `.chip:hover` rule (specificity 0,2,0) silently outranks a
 * `.chip--selected` rule (0,1,0) and repaints dark text onto a dark fill.
 *
 * Scope is deliberately narrow: the selector shapes this stylesheet actually
 * uses (compound class/element selectors, :hover, :not(), and a :root theme
 * context as the only ancestor). Anything outside that is skipped rather than
 * guessed at, so a rule this resolver cannot model can never silently change
 * a test's answer.
 */

const ROOT_CONTEXTS = {
  ':root': () => true,
  ":root:not([data-theme='light'])": (t) => t.dataTheme !== 'light',
  ":root[data-theme='dark']": (t) => t.dataTheme === 'dark',
  ":root[data-theme='light']": (t) => t.dataTheme === 'light',
}

/** Theme presets: the three states a viewer can actually be in. */
export const THEMES = {
  light: { dataTheme: null, prefersDark: false },
  darkExplicit: { dataTheme: 'dark', prefersDark: false },
  darkSystem: { dataTheme: null, prefersDark: true },
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Flatten a stylesheet into ordered { selector, decls, media } rules. */
export function parseCss(css) {
  const text = stripComments(css)
  const rules = []
  walk(text, null)
  return rules

  function walk(body, media) {
    let i = 0
    let start = 0
    while (i < body.length) {
      const ch = body[i]
      if (ch === '{') {
        const prelude = body.slice(start, i).trim()
        const end = matchBrace(body, i)
        const inner = body.slice(i + 1, end)
        if (prelude.startsWith('@')) {
          // Only at-rules that wrap other rules are descended into.
          if (/^@(media|supports|layer)\b/.test(prelude)) walk(inner, prelude.startsWith('@media') ? prelude : media)
        } else {
          const decls = parseDecls(inner)
          for (const selector of splitSelectors(prelude)) rules.push({ selector, decls, media })
        }
        i = end + 1
        start = i
      } else {
        i += 1
      }
    }
  }
}

function matchBrace(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return text.length - 1
}

/** Split "a, b:hover" without breaking on commas inside :not(...) / :has(...). */
function splitSelectors(prelude) {
  const out = []
  let depth = 0
  let buf = ''
  for (const ch of prelude) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(buf.trim())
      buf = ''
    } else {
      buf += ch
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

function parseDecls(body) {
  const decls = []
  let depth = 0
  let buf = ''
  for (const ch of body) {
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    if (ch === ';' && depth === 0) {
      pushDecl(decls, buf)
      buf = ''
    } else if (depth === 0) {
      buf += ch
    }
  }
  pushDecl(decls, buf)
  return decls
}

function pushDecl(decls, raw) {
  const text = raw.trim()
  if (!text) return
  const colon = text.indexOf(':')
  if (colon === -1) return
  const prop = text.slice(0, colon).trim()
  let value = text.slice(colon + 1).trim()
  let important = false
  if (/!important$/i.test(value)) {
    important = true
    value = value.replace(/!important$/i, '').trim()
  }
  if (prop) decls.push({ prop, value, important })
}

/** Parse one compound selector (no combinators). Returns null if unsupported. */
function parseCompound(sel) {
  const out = { tag: null, classes: [], pseudoClasses: [], attrs: [], nots: [] }
  let i = 0
  while (i < sel.length) {
    const ch = sel[i]
    if (ch === '.') {
      const m = /^\.([A-Za-z0-9_-]+)/.exec(sel.slice(i))
      if (!m) return null
      out.classes.push(m[1])
      i += m[0].length
    } else if (ch === '[') {
      const end = sel.indexOf(']', i)
      if (end === -1) return null
      out.attrs.push(sel.slice(i + 1, end))
      i = end + 1
    } else if (ch === ':') {
      const m = /^::?([A-Za-z-]+)/.exec(sel.slice(i))
      if (!m) return null
      const name = m[1]
      i += m[0].length
      if (sel[i] === '(') {
        const close = matchParen(sel, i)
        if (close === -1) return null
        const arg = sel.slice(i + 1, close)
        i = close + 1
        if (name === 'not') {
          const inner = parseCompound(arg.trim())
          if (!inner) return null
          out.nots.push(inner)
        } else {
          return null // :has(), :nth-child(), ... are not modeled
        }
      } else if (name === 'hover') {
        out.pseudoClasses.push('hover')
      } else if (name === 'root') {
        out.pseudoClasses.push('root')
      } else {
        return null // :focus-visible, ::after, ... are not modeled
      }
    } else if (/[A-Za-z*]/.test(ch)) {
      const m = /^[A-Za-z*][A-Za-z0-9-]*/.exec(sel.slice(i))
      if (!m) return null
      out.tag = m[0]
      i += m[0].length
    } else {
      return null
    }
  }
  return out
}

function matchParen(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function compoundMatches(compound, el) {
  if (compound.pseudoClasses.includes('root')) return false
  if (compound.tag && compound.tag !== '*' && compound.tag !== el.tag) return false
  if (compound.attrs.length > 0) return false
  if (!compound.classes.every((c) => el.classes.includes(c))) return false
  if (compound.pseudoClasses.includes('hover') && !el.hover) return false
  if (compound.nots.some((n) => compoundMatches(n, el))) return false
  return true
}

function specificity(compound) {
  let a = 0
  let b = 0
  for (const c of compound.classes) void c, (b += 1)
  b += compound.attrs.length
  b += compound.pseudoClasses.length
  if (compound.tag && compound.tag !== '*') a += 1
  for (const n of compound.nots) {
    const s = specificity(n)
    a += s[1]
    b += s[0]
  }
  return [b, a] // [classish, elementish]
}

function addSpec(x, y) {
  return [x[0] + y[0], x[1] + y[1]]
}

function cmpSpec(x, y) {
  if (x[0] !== y[0]) return x[0] - y[0]
  return x[1] - y[1]
}

/** Does `selector` apply to `el` under `theme`? Returns specificity or null. */
function selectorApplies(selector, el, theme) {
  if (selector.includes('>') || selector.includes('+') || selector.includes('~')) return null
  const parts = selector.trim().split(/\s+/)
  const last = parts[parts.length - 1]
  const ancestors = parts.slice(0, -1)

  let spec = [0, 0]
  for (const ancestor of ancestors) {
    const test = ROOT_CONTEXTS[ancestor]
    if (!test) return null // an ancestor we do not model - skip the rule
    if (!test(theme)) return null
    const compound = parseCompound(ancestor.replace(/^:root/, ''))
    spec = addSpec(spec, compound ? addSpec(specificity(compound), [0, 0]) : [0, 0])
    spec = addSpec(spec, [1, 0]) // :root itself is one pseudo-class
  }

  const compound = parseCompound(last)
  if (!compound) return null
  if (!compoundMatches(compound, el)) return null
  return addSpec(spec, specificity(compound))
}

function mediaApplies(media, theme) {
  if (!media) return true
  if (/prefers-color-scheme:\s*dark/.test(media)) return theme.prefersDark
  if (/prefers-color-scheme:\s*light/.test(media)) return !theme.prefersDark
  if (/prefers-reduced-motion|print|forced-colors|max-width|min-width/.test(media)) return false
  return false
}

/** Resolve custom properties declared on a matching :root context. */
export function resolveRootVars(rules, theme) {
  const vars = {}
  for (const rule of rules) {
    if (!mediaApplies(rule.media, theme)) continue
    const parts = rule.selector.trim().split(/\s+/)
    if (parts.length !== 1) continue
    const test = ROOT_CONTEXTS[parts[0]]
    if (!test || !test(theme)) continue
    for (const d of rule.decls) if (d.prop.startsWith('--')) vars[d.prop] = d.value
  }
  return vars
}

export function resolveValue(value, vars, depth = 0) {
  if (depth > 10 || !value.includes('var(')) return value.trim()
  const open = value.indexOf('var(')
  const close = matchParen(value, value.indexOf('(', open))
  if (close === -1) return value.trim()
  const inner = value.slice(open + 4, close)
  const comma = splitTop(inner)
  const name = comma[0].trim()
  const fallback = comma.slice(1).join(',').trim()
  const replacement = vars[name] !== undefined ? vars[name] : fallback
  const next = value.slice(0, open) + replacement + value.slice(close + 1)
  return resolveValue(next, vars, depth + 1)
}

function splitTop(text) {
  const out = []
  let depth = 0
  let buf = ''
  for (const ch of text) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  out.push(buf)
  return out
}

/**
 * Compute one property for `el` under `theme`, applying specificity then
 * source order, exactly as the cascade does for a single stylesheet.
 */
export function computeProperty(rules, el, theme, prop) {
  const vars = resolveRootVars(rules, theme)
  let winner = null
  rules.forEach((rule, index) => {
    if (!mediaApplies(rule.media, theme)) return
    const spec = selectorApplies(rule.selector, el, theme)
    if (!spec) return
    for (const d of rule.decls) {
      if (d.prop !== prop) continue
      const candidate = { spec, index, important: d.important, value: d.value, selector: rule.selector }
      if (!winner) winner = candidate
      else if (candidate.important !== winner.important) winner = candidate.important ? candidate : winner
      else if (cmpSpec(candidate.spec, winner.spec) >= 0) winner = candidate
    }
  })
  if (!winner) return null
  return { value: resolveValue(winner.value, vars), selector: winner.selector }
}

/* --- contrast ------------------------------------------------------------ */

const NAMED = { white: '#ffffff', black: '#000000' }

export function toRgb(color) {
  const value = color.trim().toLowerCase()
  if (NAMED[value]) return toRgb(NAMED[value])
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value)
  if (short) return short.slice(1).map((h) => parseInt(h + h, 16))
  const long = /^#([0-9a-f]{6})$/.exec(value)
  if (long) {
    const n = parseInt(long[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(value)
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => parseFloat(p))
    return [parts[0], parts[1], parts[2]]
  }
  return null
}

function channel(c) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.1 contrast ratio, 1..21. */
export function contrastRatio(fg, bg) {
  const a = relativeLuminance(toRgb(fg))
  const b = relativeLuminance(toRgb(bg))
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}
