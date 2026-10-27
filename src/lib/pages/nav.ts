/**
 * The one way a node becomes a workspace URL. The rail, the children-grid cards,
 * the breadcrumb, the New page modal, and the AI create_page accept path all
 * navigate by pushing this href, so the params a surface reads
 * (?nodeType, ?nodeId, ?nodeName) can never drift between entry points.
 *
 * There is one route (`/workspace`). The sandbox's second base path went with
 * the `/sandbox` route when the sandbox became a pond (#315) — a pond is scope
 * carried in `?pond=`, not a route of its own.
 */

/** The only route the shell renders at; the sandbox's `/sandbox` is retired. */
export const WORKSPACE_PATH = '/workspace'

export interface WorkspaceNodeRef {
  id: string
  type: string
  title: string
}

/**
 * The pond in the address right now (#312, #313).
 *
 * Read from the live URL rather than threaded through all thirteen call sites,
 * because the pond is a property of WHERE YOU ARE, exactly like the page is.
 * Threading it would also have left the same hole open: a caller that forgot the
 * param would drop the pond again. Reading it here means every navigation keeps
 * it by default.
 *
 * Returns null during server rendering, where there is no address to read — the
 * URL is then pond-less and the shell resolves the person's first pond, which is
 * the behaviour before ponds existed.
 */
export function currentPondId(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('pond')
}

/**
 * The workspace href for a node — or the workspace root when `node` is null.
 * NEVER reads `window` — the one builder safe to call during render, where the
 * server and the first client pass must agree byte-for-byte. Used ONLY for an
 * href computed during render (the rail rows, the page-link row, the
 * breadcrumb's ancestor segments) — a click-time caller wants `workspaceUrl`,
 * which carries the live address's `?pond=` as a fallback.
 *
 * Carries `?pond=` so a click stays in the pond you are in, but only the
 * `pondId` handed in: no ambient fallback. A render-time caller that passes
 * `null` (pond not resolved yet) gets a pond-less href on every pass — server
 * and client alike — rather than one that depends on whichever `window.location`
 * happens to read at the moment a particular pass runs (KAN-474: `usePondId()`
 * is null on the server AND the first client render, so a fallback to
 * `window.location` there disagreed between the two whenever the address bar
 * already carried a `?pond=`, which React's hydration never patches up).
 */
export function workspaceRenderHref(
  node: WorkspaceNodeRef | null,
  pondId: string | null = null
): string {
  if (!node) return pondId ? `${WORKSPACE_PATH}?pond=${encodeURIComponent(pondId)}` : WORKSPACE_PATH
  const params = new URLSearchParams({
    nodeType: node.type,
    nodeId: node.id,
    nodeName: node.title,
  })
  // Appended last so the page params keep their historical order — several tests
  // assert the href string, and `?pond=` is additive rather than a reshuffle.
  if (pondId) params.set('pond', pondId)
  return `${WORKSPACE_PATH}?${params.toString()}`
}

/**
 * The workspace href for a node, falling back to the live address's `?pond=`
 * when no `pondId` is given — safe only at click time (a `useCallback`/event
 * handler), never during render (see `workspaceRenderHref`, which this
 * delegates to). Every pre-existing caller (AITerminal, RelationValueField,
 * BacklinksPanel, `usePageLinkCapabilities`) wants this one, not the render-safe
 * builder — they build a URL at the moment of a click or an accepted diff, not
 * during a render pass.
 */
export function workspaceUrl(node: WorkspaceNodeRef | null, pondId?: string | null): string {
  return workspaceRenderHref(node, pondId ?? currentPondId())
}

/** The click-event fields `isNewTabClick` reads — matches a React MouseEvent of any target. */
export interface NewTabClickEvent {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  button: number
}

/**
 * Whether a click on an `<a href>` should be left to the browser's own
 * new-tab/window handling (⌘/Ctrl-click, ⇧-click, or a non-primary button —
 * i.e. middle-click) rather than intercepted for in-app navigation (KAN-474).
 *
 * The rail row, the page-link row and the breadcrumb crumb each used to carry
 * their own copy of this predicate, which let them drift (KAN-396) — one home.
 *
 * Alt/⌥-click is deliberately NOT included: it downloads the link's target in
 * Chrome (Win/Linux) and Safari, which the spec never asks for, so an
 * Alt-click falls through to plain in-app navigation instead.
 */
export function isNewTabClick(e: NewTabClickEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0
}

/** The subset of `useRouter()` a page open needs — just enough to mock in tests. */
export interface WorkspaceNavRouter {
  push: (url: string) => void
}

/**
 * The one way to open a workspace URL (KAN-449).
 *
 * On `/workspace`, every surface reads `?nodeId=`/`?nodeType=`/`?nodeName=`
 * client-side (DocumentPanel, Rail, ShellCommands, AITerminal), so a shallow
 * `pushState` switches the open page with no RSC round trip. Off `/workspace`
 * (Cover.tsx at `/`), pushState cannot change the route, so the caller still
 * needs a real navigation.
 *
 * Re-opening the page already open is a no-op: raw `pushState` has no
 * same-URL check of its own (unlike `router.push`, which Next's app router
 * resolves against the current href and replaces instead of pushing), so
 * without this guard clicking the open page again pushed a duplicate entry
 * and the first browser-back press did nothing.
 *
 * A same-page open that carries a different block hash (KAN-473: an ⌘K "in
 * pages" row for a block on the page you're already on) is not that no-op —
 * it still needs to land on the block. `pushState` never fires `hashchange`
 * on its own, so setting `location.hash` directly is what re-triggers
 * `useBlockLinkArrival`.
 *
 * Same hash too (KAN-473: Esc/click-away cleared the selection but the hash
 * never moved, then ⌘K ↵ the same row): assigning the identical hash is
 * itself a no-op, and `landedOn` already consumed it, so neither fires.
 * Clearing the hash first forces the drop-then-restore `useBlockLinkArrival`
 * already handles for a cross-page `pushState` (`block-link.ts`), landing
 * again instead of leaving the selection cleared.
 */
export function openWorkspaceUrl(url: string, router: WorkspaceNavRouter): void {
  if (window.location.pathname === WORKSPACE_PATH) {
    const target = new URL(url, window.location.href)
    const current = `${window.location.pathname}${window.location.search}`
    if (`${target.pathname}${target.search}` === current) {
      if (target.hash) {
        if (target.hash !== window.location.hash) {
          window.location.hash = target.hash
        } else {
          window.location.hash = ''
          window.location.hash = target.hash
        }
      }
      return
    }
    window.history.pushState(null, '', url)
    return
  }
  router.push(url)
}
