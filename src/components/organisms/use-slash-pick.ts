'use client'

import { useState } from 'react'
import type { SlashRow, TemplatePick } from '@/components/molecules/SlashMenu'
import { sourceBlockOf, type SourceBlock } from '@/components/molecules/source-entries'
import type { Block } from '@/lib/documents/types'
import { mintPreset } from '@/lib/modules/palette'
import { splitAtSlashLine, type SlashLine, type SlashLineAt } from '@/lib/modules/text/slash-line'

const mintId = () => crypto.randomUUID()

/** Where a `/` pick lands: the text block the `/` was typed in, and the `/` line inside it. */
export interface SlashTarget {
  hostId: string
  /** The host's content when the pick began. A host edited since is not split. */
  content: string
  line: SlashLine | null
}

export interface Landing {
  next: Block[]
  /** The inserted block as it landed: it can take the host's identity. */
  landed: Block | null
  /** What puts the `/` back in the landed block's place; null when removing it is enough. */
  slash: Block | null
}

const partsFor = (
  host: Block,
  target: SlashTarget,
  inserted: Block | null
): Omit<Landing, 'next'> & { parts: Block[] } => {
  const placed = inserted ? [inserted] : []
  if (!target.line) return { parts: placed, landed: inserted, slash: host }
  if (host.type !== 'text' || host.content !== target.content)
    return { parts: [host, ...placed], landed: inserted, slash: null }
  const split = splitAtSlashLine(host, target.line, inserted, mintId)
  const replacedHost = split.blocks.every((b) => b.id !== host.id || b === split.inserted)
  return {
    parts: split.blocks,
    landed: split.inserted,
    slash: replacedHost ? host : { id: mintId(), type: 'text', content: target.line.markdown },
  }
}

/**
 * The page with `inserted` (or nothing) landed where the `/` was, read against
 * `blocks` as they are now: in place of the `/…` block, or in place of the `/`
 * line with the prose around it kept. Null when the host is gone.
 */
export const landAtSlash = (
  blocks: Block[],
  target: SlashTarget,
  inserted: Block | null
): Landing | null => {
  const at = blocks.findIndex((b) => b.id === target.hostId)
  if (at === -1) return null
  const { parts, landed, slash } = partsFor(blocks[at], target, inserted)
  return { next: [...blocks.slice(0, at), ...parts, ...blocks.slice(at + 1)], landed, slash }
}

interface SlashPickOptions {
  blocks: Block[]
  onChange: (next: Block[]) => void
  markInserted: (id: string) => void
  /** Opens the source picker; the page changes only when it picks. */
  openSourcePicker: (
    source: SourceBlock,
    target: SlashTarget,
    at: number,
    anchor: Element | null
  ) => void
  /** Makes a page; the page changes only once it is made. */
  makePageFromRow: (placement: 'sibling' | 'child', target: SlashTarget) => void
  makePageFromTemplate: (pick: TemplatePick, target: SlashTarget) => void
}

/**
 * Which block has the `/` menu open, and what a pick from it does. A row that is
 * a block lands at once, as one page change; a source row and a page row hand the
 * target on, and nothing on the page moves until that gesture completes.
 */
export const useSlashPick = ({
  blocks,
  onChange,
  markInserted,
  openSourcePicker,
  makePageFromRow,
  makePageFromTemplate,
}: SlashPickOptions) => {
  // An index, not an id: the menu belongs to the block at that position.
  const [slashMenuOpenAt, setSlashMenuOpenAt] = useState<number | null>(null)
  const closeSlashMenu = () => setSlashMenuOpenAt(null)

  const targetOf = (index: number, at: SlashLineAt | null): SlashTarget | null => {
    const host = blocks[index]
    if (host?.type !== 'text') return null
    return { hostId: host.id, content: host.content, line: at?.line ?? null }
  }

  const handleSlashSelect = (index: number, row: SlashRow, at: SlashLineAt | null) => {
    closeSlashMenu()
    const target = targetOf(index, at)
    if (!target) return
    const source = sourceBlockOf(row.id)
    if (source) {
      openSourcePicker(source, target, index, at?.element ?? null)
      return
    }
    if (row.placement) {
      makePageFromRow(row.placement, target)
      return
    }
    const minted = mintPreset(row.id)
    if (!minted) return
    const landing = landAtSlash(blocks, target, minted)
    if (!landing?.landed) return
    markInserted(landing.landed.id)
    onChange(landing.next)
  }

  const handleSlashPickTemplate = (index: number, pick: TemplatePick, at: SlashLineAt | null) => {
    closeSlashMenu()
    const target = targetOf(index, at)
    if (!target) return
    makePageFromTemplate(pick, target)
  }

  return {
    slashMenuOpenAt,
    openSlashMenuAt: setSlashMenuOpenAt,
    closeSlashMenu,
    handleSlashSelect,
    handleSlashPickTemplate,
  }
}
