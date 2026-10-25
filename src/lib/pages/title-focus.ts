/**
 * "A new page opens with the caret in its title" (KAN-464). A one-shot
 * request keyed by page id: the creator (rail ＋, ⌘K "new page", `/page`)
 * asks before navigating; that page's own editable `PageTitleRow`, once it
 * mounts for that id, claims the request and focuses. Modeled on
 * `requestTerminalFocus` (`lib/terminal-focus.ts`) — module-level state, not
 * a React store, since the claimer always mounts after the request fires and
 * there's nothing for an already-mounted listener to subscribe to.
 */

let pendingPageId: string | undefined

export function requestTitleFocus(pageId: string) {
  pendingPageId = pageId
}

/** Claim the request for this page id. Leaves another page's still-pending
 *  request untouched, and is false for every id once claimed once. */
export function consumeTitleFocus(pageId: string): boolean {
  if (pendingPageId !== pageId) return false
  pendingPageId = undefined
  return true
}
