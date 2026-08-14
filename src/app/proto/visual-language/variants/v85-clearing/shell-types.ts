/**
 * v85 CLEARING — the contract the shell hands to every surface.
 *
 * One navigable product: the shell owns the rail, the top-right glass cluster,
 * the bottom AI bar, and the ⌘K palette. Each surface renders inside <main> and
 * talks back to the shell only through this small context — so navigation, the
 * chat, and focus-mode chrome-recede stay coherent across all four surfaces.
 */

export type SurfaceId = 'home' | 'read' | 'plan' | 'focus'

export interface SurfaceCtx {
  /** The currently-open page id (drives Read + Focus context). */
  openId: string
  /** Open a page in the Read surface. */
  goRead: (id: string) => void
  /**
   * Open a page the "right" way: a module-page (finance, sleep, shelf, a project…)
   * opens its dedicated dashboard; anything else opens in the Read surface. This is
   * what the tree/palette use, so Today's digest can route the same way.
   */
  openPage: (id: string) => void
  /** Enter a focus session on a page. */
  goFocus: (id: string) => void
  /** Switch to the Plan surface. */
  goPlan: () => void
  /** Switch to the Today/home surface. */
  goHome: () => void
  /** Open the bottom AI bar, optionally seeded with a quoted line to ask about. */
  askPond: (seed?: string) => void
  /**
   * Tell the shell a focus session is live. The shell responds by letting the
   * chrome (rail · cluster · AI bar) RECEDE — the calm "context collapse".
   */
  setSessionActive: (active: boolean) => void
}
