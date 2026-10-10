'use client'

/**
 * Zen's half of the shell's commands (`Pond 06.17` 6q frame 1): its `mode` rows,
 * ⌘. and what picking a row does, and how the breadcrumb sits while in zen.
 *
 *   rows     `zen` and `zen, on ink`; in zen, `leave zen` alone
 *   ⌘.       enters, as the `zen` row does — never while a dialog or sheet the
 *            palette launched is open, where it would enter zen beneath it
 *   pill     hidden at rest in zen, and still grows into the palette on ⌘K,
 *            since ⌘K › leave zen is one of the two ways out
 */

import { useCallback, useEffect } from 'react'

import { useZen } from '@/lib/layout/zen'
import { modeItems } from '@/lib/pages/palette-items'
import { isZenChord } from '@/lib/shell-commands'

/** What zen's `mode` rows ask the shell to do. */
export type ZenAction = 'zen' | 'zen-on-ink' | 'leave-zen'

const ZEN_ACTIONS: readonly ZenAction[] = ['zen', 'zen-on-ink', 'leave-zen']
const isZenAction = (action: string | undefined): action is ZenAction =>
  ZEN_ACTIONS.some((zenAction) => zenAction === action)

/** In zen the breadcrumb fades on the settle tier, and is out of reach while hidden. */
const COMMAND_FADE =
  'transition-[opacity,visibility] duration-[var(--motion-settle)] ease-[var(--ease-mn)] motion-reduce:transition-none'

export const useZenCommands = ({
  blocked,
  onEnter,
}: {
  /** A dialog or sheet is open over the shell. */
  blocked: boolean
  /** Called as ⌘. enters zen — the host closes its palette. */
  onEnter: () => void
}) => {
  const { zen, enterZen, leaveZen } = useZen()
  const inZen = zen !== null

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isZenChord(e)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat || inZen || blocked) return
      onEnter()
      enterZen({ onInk: false })
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [inZen, blocked, onEnter, enterZen])

  /** Acts on a picked row's action when it is zen's; false for any other. */
  const handleModeSelect = useCallback(
    (action: string | undefined): boolean => {
      if (!isZenAction(action)) return false
      if (action === 'leave-zen') leaveZen()
      else enterZen({ onInk: action === 'zen-on-ink' })
      return true
    },
    [enterZen, leaveZen]
  )

  const commandClassName = (open: boolean) =>
    `${COMMAND_FADE} ${inZen && !open ? 'invisible opacity-0' : ''}`

  return { inZen, items: modeItems(inZen), handleModeSelect, commandClassName }
}
