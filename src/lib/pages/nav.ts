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
function currentPondId(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('pond')
}

/**
 * The workspace href for a node — or the workspace root when `node` is null.
 *
 * Carries `?pond=` so a click stays in the pond you are in. Without this, every
 * rail row, breadcrumb crumb and children-grid card navigated to a pond-less URL,
 * which resolved to the FIRST pond — so opening anything inside a second pond
 * dropped you back into `life`.
 *
 * `pondId` overrides the ambient one, for the caller that is deliberately moving
 * you to a different pond.
 */
export function workspaceUrl(node: WorkspaceNodeRef | null, pondId?: string | null): string {
  const pond = pondId ?? currentPondId()
  if (!node) return pond ? `${WORKSPACE_PATH}?pond=${encodeURIComponent(pond)}` : WORKSPACE_PATH
  const params = new URLSearchParams({
    nodeType: node.type,
    nodeId: node.id,
    nodeName: node.title,
  })
  // Appended last so the page params keep their historical order — several tests
  // assert the href string, and `?pond=` is additive rather than a reshuffle.
  if (pond) params.set('pond', pond)
  return `${WORKSPACE_PATH}?${params.toString()}`
}

/** Ticket-26 alias for the same URL; new call sites should use workspaceUrl. */
export const workspaceHref = (node: WorkspaceNodeRef, pondId?: string | null): string =>
  workspaceUrl(node, pondId)
