'use client'

import { useMemo, useState, type RefObject } from 'react'
import type { PickerSize } from '@/components/molecules/picker-chrome'
import { slashMenuHeight, type YourTemplate } from '@/components/molecules/slash-entries'
import type { PickerAnchorBox, PickerSide } from '@/components/molecules/use-anchored-box'
import type { Block } from '@/lib/documents/types'
import { caretRect, sideTowardFreeSpace } from '@/lib/layout/caret-anchor'
import { slashRows } from '@/lib/modules/palette'
import type { SlashLineAt, SlashLineListener } from '@/lib/modules/text/slash-line'

interface SlashLineOptions {
  block: Block
  /** The block's root, where the caret is looked for. */
  rootRef: RefObject<HTMLElement | null>
  open: boolean
  size: PickerSize
  /** A page with nothing on it yet besides this block (6f): the glass sizes off the blank list. */
  leadWithTemplates?: boolean
  yourTemplates?: readonly YourTemplate[]
  onOpen?: () => void
  onClose?: () => void
}

/**
 * The `/` menu as one block's text drives it. A `/` typed into an empty block, or
 * at the start of an empty line inside one, opens it; what follows the slash is
 * its query — there is no filter input, the person keeps typing on the page —
 * and the slash stays as text, so esc keeps it. Deleting the slash, or leaving
 * the line, closes it. The menu hangs off the caret, not the block.
 */
export const useSlashLine = ({
  block,
  rootRef,
  open,
  size,
  leadWithTemplates,
  yourTemplates,
  onOpen,
  onClose,
}: SlashLineOptions) => {
  const [side, setSide] = useState<PickerSide>('bottom')
  const anchor = useMemo<PickerAnchorBox>(
    () => ({
      getBoundingClientRect: () =>
        rootRef.current ? caretRect(rootRef.current) : document.body.getBoundingClientRect(),
    }),
    [rootRef]
  )
  // Kept after the menu closes, so it is read only while the menu is open; every
  // open sets it.
  const [reported, setReported] = useState<SlashLineAt | null>(null)
  const line = open ? reported : null
  const query = line?.line.query ?? (open && block.type === 'text' ? block.content.slice(1) : '')

  const openAt = (at: SlashLineAt | null) => {
    setReported(at)
    if (rootRef.current) {
      // A `/` line has text around it, so the page is not blank — same override
      // the menu itself applies to `leadWithTemplates` at render.
      const height = slashMenuHeight(
        slashRows,
        size,
        window.innerHeight,
        at ? false : leadWithTemplates,
        yourTemplates
      )
      setSide(sideTowardFreeSpace(caretRect(rootRef.current), window.innerHeight, height))
    }
    onOpen?.()
  }

  const handleSlashLine: SlashLineListener = (at, opened) => {
    if (opened && at) {
      openAt(at)
      return
    }
    if (!line) return
    setReported(at)
    if (!at) onClose?.()
  }

  /** Reads an edit of the whole block, for the `/` typed into an empty one. */
  const handleTextChange = (next: Block) => {
    if (next.type !== 'text' || block.type !== 'text') return
    if (block.content === '' && next.content === '/') openAt(null)
    else if (open && !line && !next.content.startsWith('/')) onClose?.()
  }

  return { line, query, anchor, side, handleSlashLine, handleTextChange }
}
