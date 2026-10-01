'use client'

/**
 * The shell-level home for the breadcrumb pill (#96, `Pond 05 Shell`). The
 * pill is positioned against the WHOLE shell — `left: calc(50% + 13px)`,
 * `top: 20px` — not against the content column, so it cannot live in the
 * surfaces' flow. But what it SHOWS (the trail, the editable tail, the lead
 * mark) belongs to whichever surface is open. So the shell renders one empty
 * slot and provides it here; a surface renders its pill through
 * `<ShellBreadcrumb>`, which portals into that slot.
 *
 * Outside a shell (Storybook, a surface rendered alone in a test) there is no
 * provider, and the pill renders inline where it is written — so every
 * surface stays exercisable on its own.
 */

import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface BreadcrumbSlotValue {
  /** The slot element once mounted; null for the first commit. */
  slot: HTMLElement | null
}

const BreadcrumbSlotContext = createContext<BreadcrumbSlotValue | null>(null)

export function BreadcrumbSlotProvider({
  slot,
  children,
}: {
  slot: HTMLElement | null
  children: ReactNode
}) {
  return (
    <BreadcrumbSlotContext.Provider value={{ slot }}>{children}</BreadcrumbSlotContext.Provider>
  )
}

/** True inside a shell that owns the pill's placement (so a surface pads for it, not around it). */
export function useBreadcrumbFloats(): boolean {
  return useContext(BreadcrumbSlotContext) !== null
}

/**
 * Renders the pill cluster into the shell's slot when inside a shell, inline
 * otherwise. Inside a shell whose slot has not mounted yet (the first commit)
 * it renders nothing, so the pill never flashes in the flow before floating.
 */
export function ShellBreadcrumb({ children }: { children: ReactNode }) {
  const ctx = useContext(BreadcrumbSlotContext)
  if (ctx === null) return <>{children}</>
  if (!ctx.slot) return null
  return createPortal(children, ctx.slot)
}
