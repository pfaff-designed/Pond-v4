'use client'

/**
 * The bridge for a module view that draws its OWN card rather than being
 * wrapped by `PondBlock` (#227's chart card bypasses the frame) or that holds
 * its own step-out rule (table, todo — KAN-344) — mirrors `sibling-context.tsx`'s
 * pattern: the row host provides it, a view reads it, and a view rendered
 * OUTSIDE a page host (Storybook, the AI terminal reference) degrades to an
 * unselected row whose `stepOut` is a no-op rather than crashing.
 */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { Block } from '@/lib/documents/types'

export interface BlockRowValue {
  /** The row is pointer/keyboard-selected (07.05) — `PondBlock`'s own `selected` state. */
  selected: boolean
  /**
   * The row's existing `insertLineAfter(i)` — never a second insert path. An
   * optional `patch` replaces this row's own block in the SAME call (KAN-344's
   * checklist: removing the triggering empty item and stepping out must land
   * as one `onChange`, since a second call would rebuild from the pre-patch
   * `blocks` array and silently drop the edit). An optional `content` seeds
   * the new block's text (KAN-506's split on Enter) — absent is today's
   * empty block. `where` is explicit, never inferred from the patch/content
   * shapes (KAN-506): `'below'` (default) puts the new block after this row's
   * block; `'above'` puts it before — a row is never split by landing between
   * its members either way.
   */
  stepOut: (patch?: Block, content?: string, where?: 'above' | 'below') => void
  /**
   * One structural edit, as its own change-log record (KAN-355): the host
   * flushes whatever save is already pending (the typing before this edit),
   * applies `patch`, then flushes again so THIS edit's own debounced save
   * lands now rather than merging with whatever comes next inside the same
   * pause. A view calls this for add/remove/move/reorder — never for label
   * typing or ticking, which stay the ordinary debounced `onChange`.
   * Optional, and absent from the default below: a host that doesn't provide
   * one (no `BlockRowProvider` above it — Storybook, a bare `ModuleView`
   * host like `page/view.tsx`) has no save to flush twice, so a view falls
   * back to its own `onChange` rather than silently dropping the edit.
   */
  commitStep?: (patch: Block) => void
  /**
   * ↑ at this row's first visual line hands focus to the page title (KAN-464).
   * Only block 0's row gets one — every other row leaves ArrowUp to its own
   * handling, so absent is "not the first block", not "not yet supported".
   */
  leaveUp?: () => void
}

const BlockRowContext = createContext<BlockRowValue>({
  selected: false,
  stepOut: () => {},
})

export function BlockRowProvider({
  value,
  children,
}: {
  value: BlockRowValue
  children: ReactNode
}) {
  return <BlockRowContext.Provider value={value}>{children}</BlockRowContext.Provider>
}

export function useBlockRow(): BlockRowValue {
  return useContext(BlockRowContext)
}
