/**
 * `applyPondTheme` (KAN-503): an in-session pond switch applies `'ink'` as
 * dark outright. Every other value — `'paper'` (the column default) and the
 * six pills `PondControl` still disables — has no chosen theme, so it
 * restores the person's own STORED mode (resolving `system`) instead of
 * leaving whatever an earlier switch forced — one visit to an ink pond must
 * not leave every other pond dark until a manual toggle.
 */

import { applyPondTheme } from '@/lib/theme/mode'
import { MODE_KEY } from '@/lib/theme/mode-boot'

const html = document.documentElement
const isDark = () => html.classList.contains('dark')

// Same eight pills as `NewPondSheet.tsx`'s THEMES — not exported, so mirrored here.
const THEMES = ['paper', 'ink', 'sage', 'mist', 'navy', 'wheat', 'burnt orange', 'ember'] as const

afterEach(() => {
  html.classList.remove('dark')
  window.localStorage.clear()
})

describe('applyPondTheme', () => {
  it.each(THEMES)('%s starting light, no stored mode (jsdom has no matchMedia, resolves light)', (theme) => {
    html.classList.remove('dark')
    applyPondTheme(theme)
    expect(isDark()).toBe(theme === 'ink')
  })

  it.each(THEMES)('%s starting dark, no stored mode — non-ink restores to light, not leaving dark standing', (theme) => {
    html.classList.add('dark')
    applyPondTheme(theme)
    expect(isDark()).toBe(theme === 'ink')
  })

  it.each(THEMES)('%s starting light, stored mode dark — non-ink restores dark', (theme) => {
    html.classList.remove('dark')
    window.localStorage.setItem(MODE_KEY, 'dark')
    applyPondTheme(theme)
    expect(isDark()).toBe(true)
  })
})
