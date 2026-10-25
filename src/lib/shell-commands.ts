/**
 * The command-key chords — ⌘K for the palette, ⌘/ for a block's menu, ⌘. for zen — read the
 * same way wherever they are pressed.
 */

import { useEffect, useSyncExternalStore } from 'react'
import { isApplePlatform } from '@/lib/platform'

/** The same detection every other caller reads (`isApplePlatform`, `platform.ts`) — kept as
 *  an alias here so this module's existing callers don't change. */
export const onApplePlatform = isApplePlatform

/** Marks a container whose fields own no undo of their own — a removed row is the
 *  session's to restore, not the focused field's (KAN-445, KAN-355). */
export const SESSION_UNDO_SCOPE_ATTR = 'data-pond-session-undo'

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
 * ⌘\ on a Mac, Ctrl+\ everywhere else: minimize or show the rail. The same
 * chord Notion and Linear use for the side panel. It is global, including
 * inside a text field — the field has no meaning for this chord.
 */
export const isMinimizeRailChord = (e: KeyboardEvent) => {
  if (e.altKey || e.shiftKey || e.key !== '\\') return false
  return isCommandOnly(e)
}

/**
 * ⌘⇧P on a Mac, Ctrl+Shift+P everywhere else: move the open page to… (KAN-469), as in
 * Notion. Kept despite two real browser collisions (AUDIT K1–K4): Firefox reserves this
 * chord for New Private Window and ignores `preventDefault` on it entirely, so the chord
 * never reaches this handler there; Safari binds it to File ▸ Page Setup. Chrome has no
 * conflicting binding. Both collisions fall back to the same destination: the `move page
 * to…` row in ⌘K, which this chord is just a shortcut onto (`ShellCommands.tsx`'s
 * `isMovePageChord` handler opens the identical pick mode).
 */
export const isMovePageChord = (e: KeyboardEvent) => {
  if (e.altKey || !e.shiftKey || e.key.toLowerCase() !== 'p') return false
  return isCommandOnly(e)
}

/**
 * ⌘⌫ on a Mac, Ctrl+⌫ everywhere else: delete the focused block (`Pond 08 Edges` 8e).
 * Inside a text block with text before the caret, the editor's own delete-to-line-start
 * wins instead (AUDIT K1–K4) — that collision is decided at the call site, not here.
 */
export const isDeleteBlockChord = (e: KeyboardEvent) => {
  if (e.altKey || e.shiftKey || e.key !== 'Backspace') return false
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

const APPLE_KEY_GLYPHS: Record<string, string> = { backspace: '⌫', enter: '↵' }
const OTHER_KEY_WORDS: Record<string, string> = { backspace: 'Backspace', enter: 'Enter' }

const formatKey = (key: string, glyphs: Record<string, string>) =>
  glyphs[key] ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1))

/**
 * A chord written as lowercase `+`-joined tokens (`'mod+shift+z'`, `'mod+.'`) read the
 * way a person sees it on their own platform: Apple glyphs in HIG order (⌃⌥⇧⌘) with no
 * separator on a Mac, `Ctrl`/`Alt`/`Shift`/key words space-joined (Ctrl, Alt, Shift order)
 * everywhere else. `mod` is the platform's command key.
 *
 * `apple` defaults to a live read, but a render-time caller should pass `useApplePlatform()`'s
 * value instead — reading live here would make the server and the first client render
 * disagree whenever they differ, which is a hydration mismatch.
 */
export const formatChord = (chord: string, apple: boolean = onApplePlatform()) => {
  const tokens = chord.split('+')
  const key = tokens[tokens.length - 1]
  const modifiers = tokens.slice(0, -1)
  const hasMod = modifiers.includes('mod')
  const hasAlt = modifiers.includes('alt')
  const hasShift = modifiers.includes('shift')

  if (apple) {
    const glyphs = [hasAlt && '⌥', hasShift && '⇧', hasMod && '⌘'].filter(Boolean)
    return [...glyphs, formatKey(key, APPLE_KEY_GLYPHS)].join('')
  }

  const words = [hasMod && 'Ctrl', hasAlt && 'Alt', hasShift && 'Shift'].filter(Boolean)
  return [...words, formatKey(key, OTHER_KEY_WORDS)].join(' ')
}

/**
 * `formatChord`, for the machine surface (the palette, a diff card, a provenance chip):
 * lowercase everywhere (PROJECT_RULES — mono, lowercase). A Mac's glyphs (`⌘↵`) have no
 * case to lower; off Apple the key legend (`Ctrl Enter`) is lowered to `ctrl enter`.
 *
 * `apple` defaults to a live read; see `formatChord`'s doc comment for why a render-time
 * caller should pass `useApplePlatform()`'s value instead.
 */
export const formatChordMachine = (chord: string, apple: boolean = onApplePlatform()) =>
  apple ? formatChord(chord, true) : formatChord(chord, false).toLowerCase()

/**
 * The same chord as a WAI-ARIA `aria-keyshortcuts` value: `+`-joined, modifiers first, one
 * platform only — the other platform's modifier does nothing on this one, so listing it is
 * not a valid alternative, it's dead weight.
 *
 * `apple` defaults to a live read; see `formatChord`'s doc comment for why a render-time
 * caller should pass `useApplePlatform()`'s value instead.
 */
export const ariaKeyshortcuts = (chord: string, apple: boolean = onApplePlatform()) => {
  const tokens = chord.split('+')
  const key = tokens[tokens.length - 1]
  const modifiers = tokens.slice(0, -1)
  const modWord = apple ? 'Meta' : 'Control'
  const parts = [
    modifiers.includes('mod') && modWord,
    modifiers.includes('alt') && 'Alt',
    modifiers.includes('shift') && 'Shift',
  ].filter(Boolean)
  return [...parts, formatKey(key, OTHER_KEY_WORDS)].join('+')
}

/** Apple until a mount effect corrects it — matches the `true` server snapshot below. */
let applePlatformSnapshot = true
const applePlatformListeners = new Set<() => void>()

/** Re-reads the real platform and tells every mounted `useApplePlatform` reader. */
const notifyApplePlatformChange = () => {
  applePlatformSnapshot = onApplePlatform()
  applePlatformListeners.forEach((listener) => listener())
}

const subscribeApplePlatform = (listener: () => void) => {
  applePlatformListeners.add(listener)
  return () => applePlatformListeners.delete(listener)
}

/**
 * `onApplePlatform()` for a render-time read, where a component can't call it directly
 * without a hydration mismatch: the server snapshot is `true` so SSR and the first client
 * paint agree, and a mount effect then corrects it to the real platform.
 */
export const useApplePlatform = (): boolean => {
  useEffect(() => notifyApplePlatformChange(), [])
  return useSyncExternalStore(subscribeApplePlatform, () => applePlatformSnapshot, () => true)
}
