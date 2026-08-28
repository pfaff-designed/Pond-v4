/**
 * The one way to build the workspace URL that opens a page. The rail, the
 * overview cards, the New page modal, and the AI create_page accept path all
 * navigate with the same `{nodeType, nodeId, nodeName}` search params — build
 * them here so the shape can't drift between surfaces.
 *
 * (Ticket-26; ticket-25's wayfinding work introduces a nav helper for the same
 * URL — reconcile to a single module on merge.)
 */

export function workspaceHref(node: { id: string; type: string; title: string }): string {
  const params = new URLSearchParams({
    nodeType: node.type,
    nodeId: node.id,
    nodeName: node.title,
  })
  return `/workspace?${params.toString()}`
}
