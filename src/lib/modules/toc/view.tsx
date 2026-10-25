'use client'

import { PondMolecule } from '@/components/molecules/PondMolecule'
import { PondBlockEmpty } from '@/components/organisms/PondBlock'
import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import { useSiblingBlocks } from '../sibling-context'
import { scrollToBlock } from '../block-dom'
import { getHeadings } from './headings'
import { TOC_EMPTY_LINE } from './schema'

/** Per level below the page's shallowest heading — the board is silent (choices, PLAN.md). */
const INDENT_STEP_PX = 14

/**
 * `toc` view — a live, read-only list of the page's own headings
 * (`useSiblingBlocks()`, never the block's own data: it stores none). Each
 * entry is a button so Tab + ↵ reaches it; a click or ↵ scrolls its heading
 * to the top of the page, clear of the composer (`{ block: 'start' }`,
 * KAN-400's scroll-padding) rather than the default centred/highlighted jump
 * a bound metric's link uses.
 */
export function TocView() {
  const { blocks } = useSiblingBlocks()
  const headings = getHeadings(blocks)

  if (headings.length === 0) {
    return <PondBlockEmpty line={TOC_EMPTY_LINE} />
  }

  const shallowest = Math.min(...headings.map((h) => h.level))

  return (
    <div className="flex flex-col gap-0.5">
      {headings.map((heading) => (
        <button
          key={heading.id}
          type="button"
          className={`w-full rounded-mn-row text-left hover:bg-mn-text/5 ${FOCUS_VISIBLE_RING}`}
          style={{ paddingLeft: (heading.level - shallowest) * INDENT_STEP_PX }}
          onClick={() => scrollToBlock(heading.id, { block: 'start', highlight: false })}
        >
          <PondMolecule
            kind="list-row"
            title={heading.text}
            meta=""
            handle={false}
            dot={false}
            className="w-full"
          />
        </button>
      ))}
    </div>
  )
}
