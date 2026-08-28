/**
 * The one way a node becomes a workspace URL. The rail, the overview cards,
 * the breadcrumb, the New page modal, and the AI create_page accept path all
 * navigate by pushing this href, so the params a surface reads
 * (?nodeType, ?nodeId, ?nodeName) can never drift between entry points.
 */

export interface WorkspaceNodeRef {
  id: string
  type: string
  title: string
}

/** The workspace href for a node — or the Life root when `node` is null. */
export function workspaceUrl(node: WorkspaceNodeRef | null): string {
  if (!node) return '/workspace'
  const params = new URLSearchParams({
    nodeType: node.type,
    nodeId: node.id,
    nodeName: node.title,
  })
  return `/workspace?${params.toString()}`
}

/** Ticket-26 alias for the same URL; new call sites should use workspaceUrl. */
export const workspaceHref = (node: WorkspaceNodeRef): string => workspaceUrl(node)
