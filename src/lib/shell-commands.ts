/**
 * The command-key chords — ⌘K for the palette, ⌘/ for a block's menu, ⌘. for zen — read the
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

/**
 * ⌘. on a Mac, Ctrl+. everywhere else: zen (`Pond 06.17` 6q frame 1). Mid-composition
 * it is the IME's — macOS cancels a composition with ⌘. — so it is left alone then.
 */
export const isZenChord = (e: KeyboardEvent) => {
  if (e.altKey || e.shiftKey || e.isComposing || e.key !== '.') return false
  return isCommandOnly(e)
}

/**
 * ⌘Z on a Mac, Ctrl+Z everywhere else: undo. Also matches `я`, the Cyrillic-layout
 * key sharing `z`'s QWERTY position, so a non-Latin layout binds the same chord
 * (KAN-268). Unlike `isZenChord`, this is never refused for `isComposing`: an
 * unhandled ⌘Z falls through to the browser's own contenteditable undo, which
 * wipes a field it never saw typed — intercepting is the fix, so there is no safe
 * reason to hand the keydown back.
 */
export const isUndoChord = (e: KeyboardEvent) => {
  if (e.altKey || e.shiftKey) return false
  const key = e.key.toLowerCase()
  if (key !== 'z' && key !== 'я') return false
  return isCommandOnly(e)
}

/**
 * ⌘⇧Z or ⌘Y on a Mac, Ctrl equivalents everywhere else: redo, including the
 * Cyrillic-layout ⌘⇧Я and ⌘Я (KAN-268). Same no-`isComposing`-refusal reasoning
 * as `isUndoChord`.
 */
export const isRedoChord = (e: KeyboardEvent) => {
  if (e.altKey) return false
  const key = e.key.toLowerCase()
  const matchesKey = e.shiftKey ? key === 'z' || key === 'я' : key === 'y'
  if (!matchesKey) return false
  return isCommandOnly(e)
}
