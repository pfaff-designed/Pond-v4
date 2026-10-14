'use client'

/**
 * The session's "just saved" template: per pond, the most recently saved
 * template that has not yet been applied anywhere.
 *
 * Lasts until it is first applied or the tab closes (the undo session
 * boundary) — so it lives in memory only, keyed by pond like
 * `session-undo.ts`'s histories map.
 */

export interface JustSaved {
  /** The template a save-as-template just produced in this pond. */
  set: (pondId: string, templateId: string) => void
  /** Clears it once applied — only if `templateId` is still the one held. */
  clear: (pondId: string, templateId: string) => void
  get: (pondId: string) => string | null
}

interface JustSavedStore extends JustSaved {
  reset: () => void
}

export const createJustSaved = (): JustSavedStore => {
  const ids = new Map<string, string>()
  return {
    set: (pondId, templateId) => {
      ids.set(pondId, templateId)
    },
    clear: (pondId, templateId) => {
      if (ids.get(pondId) === templateId) ids.delete(pondId)
    },
    get: (pondId) => ids.get(pondId) ?? null,
    reset: () => ids.clear(),
  }
}

/**
 * Wipes every pond's "just saved" on `pagehide` — a closed tab loses it
 * anyway; this only matters when the page is kept in the back/forward cache
 * and restored, which would otherwise bring the old value back with it.
 * Returns the release.
 */
export const clearOnPageHide = (target: Window, store: JustSavedStore): (() => void) => {
  const handlePageHide = () => store.reset()
  target.addEventListener('pagehide', handlePageHide)
  return () => target.removeEventListener('pagehide', handlePageHide)
}

/** The tab's "just saved" template, one per pond. */
export const justSaved: JustSavedStore = createJustSaved()

if (typeof window !== 'undefined') clearOnPageHide(window, justSaved)
