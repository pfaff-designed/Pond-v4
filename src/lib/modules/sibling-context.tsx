'use client'

/**
 * Sibling-block access seam (ticket-23) — the clean way for a module view to read
 * its *neighbours'* current state.
 *
 * Module views receive only their own `data` (t12 `ModuleViewProps`) — deliberately,
 * so a module never reaches into another module's internals. But a bound metric must
 * derive its value from a sibling block's live state. Rather than widen every view's
 * props (a metric-only concern leaking into the shared contract), the host that lays
 * out a page's blocks (PageView, DocumentPanel) provides them through this context,
 * mirroring how `editable` is host-passed rather than declared on the descriptor.
 *
 * A view that needs siblings reads them via `useSiblingBlocks()`; a view rendered
 * OUTSIDE a page host (a Storybook story, the AI terminal reference render) gets an
 * empty list and degrades gracefully — never crashes. This keeps the registry
 * contract intact: the seam is host-provided context, not a new required prop.
 *
 * `scrollToBlock` rides along so a bound metric's link affordance can jump to its
 * source. The host owns the DOM ids (`block-<id>`), so it owns the scroll too.
 */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { Block } from './content'

export interface SiblingBlocksValue {
  /** The current blocks of the page hosting this module (including the reader). */
  blocks: readonly Block[]
  /** Scroll to and briefly highlight a sibling block by id (host owns the DOM ids). */
  scrollToBlock?: (blockId: string) => void
  /**
   * The id of the page hosting this module (ticket-38). A cross-page rollup metric
   * (`source: { pages: 'children' }`) needs it to find the page's direct children in
   * the ['pages'] tree. Optional: a host without a page identity (a Storybook story,
   * the AI-terminal reference render) omits it, and a cross-page metric then degrades
   * to a quiet placeholder rather than deriving from the wrong data — never a wrong
   * number.
   */
  pageId?: string
}

const SiblingBlocksContext = createContext<SiblingBlocksValue>({ blocks: [] })

export function SiblingBlocksProvider({
  value,
  children,
}: {
  value: SiblingBlocksValue
  children: ReactNode
}) {
  return <SiblingBlocksContext.Provider value={value}>{children}</SiblingBlocksContext.Provider>
}

export function useSiblingBlocks(): SiblingBlocksValue {
  return useContext(SiblingBlocksContext)
}
