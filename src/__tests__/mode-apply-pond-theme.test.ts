/**
 * `applyPondTheme` (KAN-503): an in-session pond switch applies a theme only
 * when it is `'ink'`. Every other value — `'paper'` (the column default) and
 * the six pills `PondControl` still disables — is a no-op, so the person's
 * own mode stands whatever it was before the switch.
 */

import { applyPondTheme } from '@/lib/theme/mode'

const html = document.documentElement
const isDark = () => html.classList.contains('dark')

// Same eight pills as `NewPondSheet.tsx`'s THEMES — not exported, so mirrored here.
const THEMES = ['paper', 'ink', 'sage', 'mist', 'navy', 'wheat', 'burnt orange', 'ember'] as const

afterEach(() => {
  html.classList.remove('dark')
})

describe('applyPondTheme', () => {
  it.each(THEMES)('%s starting light', (theme) => {
    html.classList.remove('dark')
    applyPondTheme(theme)
    expect(isDark()).toBe(theme === 'ink')
  })

  it.each(THEMES)('%s starting dark', (theme) => {
    html.classList.add('dark')
    applyPondTheme(theme)
    // ink stays dark; every non-ink value no-ops, leaving the person's own dark mode standing
    expect(isDark()).toBe(true)
  })
})
