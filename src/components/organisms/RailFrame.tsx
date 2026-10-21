'use client'

/**
 * The rail's place in the shell. Minimized, the card stays mounted (its tree
 * survives) but leaves the layout, and the same toggle sits in the corner it
 * left. The button, ⌘\ and the palette all write `rail-chrome`, so this is
 * the one reader of whether the card is on screen.
 */

import type { ReactNode } from 'react'
import { RailToggle } from '@/components/organisms/RailToggle'
import { setRailMinimized, useRailMinimized } from '@/lib/layout/rail-chrome'

export function RailFrame({ children }: { children: ReactNode }) {
  const minimized = useRailMinimized()
  return (
    <>
      <div hidden={minimized || undefined} className={minimized ? undefined : 'contents'}>
        {children}
      </div>
      {minimized && (
        <div className="absolute top-5 left-5 z-20">
          <RailToggle minimized onClick={() => setRailMinimized(false)} />
        </div>
      )}
    </>
  )
}
