/**
 * The one way a node becomes a workspace URL. The rail, the overview cards,
 * and the breadcrumb all navigate by pushing this href, so the params a
 * surface reads (?nodeType, ?nodeId, ?nodeName) can never drift between the
 * three entry points.
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
