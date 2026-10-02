/**
 * The one way a node becomes a workspace URL. The rail, the children-grid cards,
 * the breadcrumb, the New page modal, and the AI create_page accept path all
 * navigate by pushing this href, so the params a surface reads
 * (?nodeType, ?nodeId, ?nodeName) can never drift between entry points.
 *
 * ticket-43: an optional `basePath` scopes navigation to the sandbox route.
 * The real workspace omits it (defaults to '/workspace') so its URLs are
 * byte-identical; the sandbox passes '/sandbox' so clicks stay in-scope.
 */

export interface WorkspaceNodeRef {
  id: string
  type: string
  title: string
}

/** The workspace href for a node — or the workspace root when `node` is null. */
export function workspaceUrl(node: WorkspaceNodeRef | null, basePath = '/workspace'): string {
  if (!node) return basePath
  const params = new URLSearchParams({
    nodeType: node.type,
    nodeId: node.id,
    nodeName: node.title,
  })
  return `${basePath}?${params.toString()}`
}

/** Ticket-26 alias for the same URL; new call sites should use workspaceUrl. */
export const workspaceHref = (node: WorkspaceNodeRef, basePath = '/workspace'): string =>
  workspaceUrl(node, basePath)

/** The route base path for a workspace scope (ticket-43). */
export function workspaceBasePath(workspace: 'main' | 'sandbox'): string {
  return workspace === 'sandbox' ? '/sandbox' : '/workspace'
}
