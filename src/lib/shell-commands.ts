/**
 * The command-key chords — ⌘K for the palette, ⌘/ for a block's menu — read the
 * same way wherever they are pressed.
 */

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: { platform: string }
}

const APPLE_PLATFORM = /mac|iphone|ipad|ipod/i

/** Read at press time, not import time: the platform is a fact of the browser, not of the module. */
const onApplePlatform = () => {
  const nav = navigator as NavigatorWithUserAgentData
  return APPLE_PLATFORM.test(nav.userAgentData?.platform ?? nav.platform)
}

/** The platform's command key alone: ⌘ on a Mac, Ctrl everywhere else — never both. */
const isCommandOnly = (e: KeyboardEvent) =>
  onApplePlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey

/** ⌘K on a Mac, Ctrl+K everywhere else (AUDIT K3) — never both on one platform. */
export const isPaletteChord = (e: KeyboardEvent) => {
  if (e.altKey || e.key.toLowerCase() !== 'k') return false
  return isCommandOnly(e)
}

/** ⌘/ on a Mac, Ctrl+/ everywhere else: the focused block's menu. */
export const isBlockMenuChord = (e: KeyboardEvent) => {
  if (e.altKey || e.key !== '/') return false
  return isCommandOnly(e)
}
