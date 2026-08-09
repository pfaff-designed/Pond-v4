'use client'

/**
 * One row in the sidebar page tree, rendered recursively so the tree nests to
 * arbitrary depth. Presentational — all state (selection, collapse, async work)
 * and mutations live in the parent Sidebar; this component only renders and
 * raises callbacks.
 */

export interface PageNode {
  id: string
  parentId: string | null
  type: string
  title: string
  order: number
  children: PageNode[]
}

interface Props {
  node: PageNode
  depth: number
  selectedId: string | null
  collapsed: Set<string>
  busyId: string | null
  onSelect: (node: PageNode) => void
  onToggle: (id: string) => void
  onAddChild: (node: PageNode) => void
  onDelete: (node: PageNode) => void
}

export function PageTreeItem({
  node,
  depth,
  selectedId,
  collapsed,
  busyId,
  onSelect,
  onToggle,
  onAddChild,
  onDelete,
}: Props) {
  const hasChildren = node.children.length > 0
  const isExpanded = hasChildren && !collapsed.has(node.id)
  const isSelected = node.id === selectedId
  const isBusy = node.id === busyId

  return (
    <div>
      <div
        className={`group flex items-center gap-1 pr-2 rounded transition-colors ${
          isSelected ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-100'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {/* expand / collapse chevron (only when there are children) */}
        <button
          className={`w-4 flex-shrink-0 text-xs text-zinc-400 hover:text-zinc-700 ${
            hasChildren ? '' : 'invisible'
          }`}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          onClick={() => onToggle(node.id)}
        >
          {isExpanded ? '▾' : '▸'}
        </button>

        {/* title — selects the page */}
        <button
          className={`flex-1 text-left py-1.5 text-sm truncate ${isSelected ? 'font-medium' : ''}`}
          onClick={() => onSelect(node)}
          title={node.title || 'Untitled'}
        >
          {node.title || 'Untitled'}
        </button>

        {/* hover actions */}
        <button
          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-700 text-sm leading-none px-0.5 disabled:opacity-30"
          title="Add sub-page"
          aria-label={`Add sub-page to ${node.title || 'Untitled'}`}
          disabled={isBusy}
          onClick={() => onAddChild(node)}
        >
          +
        </button>
        <button
          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-600 text-sm leading-none px-0.5 disabled:opacity-30"
          title="Delete page"
          aria-label={`Delete ${node.title || 'Untitled'}`}
          disabled={isBusy}
          onClick={() => onDelete(node)}
        >
          ×
        </button>
      </div>

      {isExpanded &&
        node.children.map((child) => (
          <PageTreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            collapsed={collapsed}
            busyId={busyId}
            onSelect={onSelect}
            onToggle={onToggle}
            onAddChild={onAddChild}
            onDelete={onDelete}
          />
        ))}
    </div>
  )
}
