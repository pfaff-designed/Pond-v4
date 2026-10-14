/**
 * KAN-305 fix — the page-changes panel must paint the #30312A floating-glass
 * card in dark, not the pond switcher's #4A4940 lifted menu it was borrowing
 * --mn-menu-* from. Pins the new --mn-panel-* role trio (globals.css) and
 * that PageChangesSection.tsx consumes it rather than the menu's.
 */
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
const block = (css: string, selector: string) => {
  const m = css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\n\\}`))
  if (!m) throw new Error(`no ${selector} block`)
  return m[1]
}

describe("globals.css — the page-changes panel's own glass roles", () => {
  const css = read('src/app/globals.css')
  const root = block(css, ':root')
  const dark = block(css, '.dark')

  it('light: the panel trio is the board s6o8 recipe (today’s light --mn-menu-* values)', () => {
    expect(root).toMatch(
      /--mn-panel-bg:\s*linear-gradient\(160deg, rgba\(255, 255, 255, 0\.92\), rgba\(255, 255, 255, 0\.76\)\)/
    )
    expect(root).toMatch(/--mn-panel-border:\s*1px solid rgba\(255, 255, 255, 0\.9\)/)
    expect(root).toMatch(
      /--mn-panel-shadow:\s*inset 0 1px 0 rgba\(255, 255, 255, 0\.7\), 0 20px 54px rgba\(40, 34, 24, 0\.16\)/
    )
  })

  it('dark: the panel points at the floating-glass roles, not the switcher menu', () => {
    expect(dark).toMatch(/--mn-panel-bg:\s*var\(--mn-glass-bg\)/)
    expect(dark).toMatch(/--mn-panel-border:\s*var\(--mn-glass-border\)/)
    expect(dark).toMatch(/--mn-panel-shadow:\s*var\(--mn-glass-shadow\)/)
    expect(dark).not.toMatch(/--mn-panel-bg:\s*var\(--mn-menu-bg\)/)
  })

  it('dark --mn-glass-bg (what the panel now resolves to) is the #30312A card, not the #4A4940 menu', () => {
    expect(dark).toMatch(/--mn-glass-bg:\s*linear-gradient\(160deg, rgba\(48, 49, 42,/)
    expect(dark).toMatch(/--mn-menu-bg:\s*linear-gradient\(\s*160deg,\s*rgb\(from var\(--raw-neutral-600\)/)
  })
})

describe("PageChangesSection.tsx — paints the panel roles, not the menu's", () => {
  it('uses --mn-panel-bg/border/shadow and no --mn-menu-* token', () => {
    const source = read('src/components/molecules/PageChangesSection.tsx')
    expect(source).toMatch(/var\(--mn-panel-bg\)/)
    expect(source).toMatch(/var\(--mn-panel-border\)/)
    expect(source).toMatch(/var\(--mn-panel-shadow\)/)
    expect(source).not.toMatch(/--mn-menu-/)
  })
})
