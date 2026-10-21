'use client'

import { createContext, useContext } from 'react'

/**
 * True while a block is drawn at a set height (KAN-442). A view keeps its
 * head and bar fixed and scrolls the body; a chart scrolls its plot.
 * Absent — Storybook, a diff card — means the block is its content.
 */
const BlockHeightContext = createContext(false)

export function BlockHeightProvider({
  constrained,
  children,
}: {
  constrained: boolean
  children: React.ReactNode
}) {
  return <BlockHeightContext.Provider value={constrained}>{children}</BlockHeightContext.Provider>
}

export function useBlockHeightConstrained(): boolean {
  return useContext(BlockHeightContext)
}
