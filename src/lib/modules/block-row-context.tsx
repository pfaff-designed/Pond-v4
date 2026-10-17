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
   * `blocks` array and silently drop the edit).
   */
  stepOut: (patch?: Block) => void
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
