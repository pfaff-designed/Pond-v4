'use client'

import { useState } from 'react'
import type { SlashRow, TemplatePick } from '@/components/molecules/SlashMenu'
import { sourceBlockOf, type SourceBlock } from '@/components/molecules/source-entries'
import type { Block } from '@/lib/documents/types'
import { mintPreset } from '@/lib/modules/palette'
import { HEADING_PREFIX } from '@/lib/modules/text/markup'
import type { TextBlock } from '@/lib/modules/text/schema'
import { splitAtSlashLine, type SlashLine, type SlashLineAt } from '@/lib/modules/text/slash-line'

const mintId = () => crypto.randomUUID()

/** Where a `/` pick lands: the text block the `/` was typed in, and the `/` line inside it. */
export interface SlashTarget {
  hostId: string
  /** The host's content when the pick began. A host edited since is not split. */
  content: string
  line: SlashLine | null
}

/** A text block cut in two around the landed block: its halves as they landed. */
export interface LandedSplit {
  /** The half that kept the block's identity is `above` when there is one, else `below`. */
  above: TextBlock | null
  below: TextBlock | null
  /** The block's content before the cut. */
  content: string
}

export interface Landing {
  next: Block[]
  /** The inserted block as it landed: it can take the host's identity. */
  landed: Block | null
  /** Set when landing cut the host in two. */
  split: LandedSplit | null
  /** What takes the landed block's place when the halves can't rejoin; null when removing it is enough. */
  slash: Block | null
}

const partsFor = (
  host: Block,
  target: SlashTarget,
  inserted: Block | null
): Omit<Landing, 'next'> & { parts: Block[] } => {
  const placed = inserted ? [inserted] : []
  if (host.type !== 'text' || host.content !== target.content)
    return { parts: [host, ...placed], landed: inserted, split: null, slash: null }
  if (!target.line) return { parts: placed, landed: inserted, split: null, slash: host }
  const { blocks: parts, inserted: landed } = splitAtSlashLine(host, target.line, inserted, mintId)
  const at = landed ? parts.indexOf(landed) : -1
  const above = parts[at - 1]
  const below = parts[at + 1]
  if (at === -1 || (!above && !below)) return { parts, landed, split: null, slash: host }
  return {
    parts,
    landed,
    split: {
      above: above?.type === 'text' ? above : null,
      below: below?.type === 'text' ? below : null,
      content: host.content,
    },
    slash: { id: mintId(), type: 'text', content: target.line.markdown },
  }
}

const isAsLanded = (now: Block | undefined, landed: TextBlock | null): boolean =>
  landed === null ||
  (now?.type === 'text' && now.id === landed.id && now.content === landed.content)

/** The host whole again in place of the run its split left, if both halves are as they landed. */
const rejoin = (blocks: Block[], at: number, { above, below, content }: LandedSplit) => {
  const before = blocks[at - 1]
  const after = blocks[at + 1]
  if (!isAsLanded(before, above) || !isAsLanded(after, below)) return null
  const host = above ? before : after
  if (host?.type !== 'text') return null
  const from = above ? at - 1 : at
  const to = below ? at + 2 : at + 1
  return [...blocks.slice(0, from), { ...host, content }, ...blocks.slice(to)]
}

/**
 * The page with a landing taken back, read against `blocks` as they are now. A
 * split whose halves are untouched rejoins into the block it was; one edited
 * since keeps its halves and gets the `/` line back between them.
 */
export const undoLanding = (blocks: Block[], { landed, split, slash }: Landing): Block[] => {
  if (!landed) return blocks
  const at = blocks.findIndex((b) => b.id === landed.id)
  if (at === -1) return blocks
  const rejoined = split && rejoin(blocks, at, split)
  if (rejoined) return rejoined
  if (!slash) return blocks.filter((_, i) => i !== at)
  return blocks.map((b, i) => (i === at ? slash : b))
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
  const { parts, ...landing } = partsFor(blocks[at], target, inserted)
  return { next: [...blocks.slice(0, at), ...parts, ...blocks.slice(at + 1)], ...landing }
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
  /** `index` is the picked block's position — a blank page applies in place instead (KAN-124). */
  makePageFromTemplate: (pick: TemplatePick, target: SlashTarget, index: number) => void
  /**
   * The block a mint-and-land pick just put on the page (KAN-355), called right
   * after `onChange` lands it. A text landing already keeps the host editor's
   * focus; a block with no editor of its own (a todo's item field) does not, and
   * this is the caller's one hook to put focus somewhere real.
   */
  onLanded?: (landed: Block) => void
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
  onLanded,
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
    const minted = row.freeText
      ? {
          id: mintId(),
          type: 'text' as const,
          content: row.freeText.as === 'heading' ? HEADING_PREFIX + row.freeText.word : row.freeText.word,
        }
      : mintPreset(row.id)
    if (!minted) return
    const landing = landAtSlash(blocks, target, minted)
    if (!landing?.landed) return
    markInserted(landing.landed.id)
    onChange(landing.next)
    onLanded?.(landing.landed)
  }

  const handleSlashPickTemplate = (index: number, pick: TemplatePick, at: SlashLineAt | null) => {
    closeSlashMenu()
    const target = targetOf(index, at)
    if (!target) return
    makePageFromTemplate(pick, target, index)
  }

  return {
    slashMenuOpenAt,
    openSlashMenuAt: setSlashMenuOpenAt,
    closeSlashMenu,
    handleSlashSelect,
    handleSlashPickTemplate,
  }
}
