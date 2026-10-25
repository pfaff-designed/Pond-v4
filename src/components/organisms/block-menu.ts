/**
 * The block menu's content (`PondMenu` kind `block`): its groups for one block,
 * the actions its items carry, and the one dispatch from an action to what it
 * does. A group with nothing in it is not drawn, so a slot left out costs no row
 * and no rule.
 */

import type { ReactNode } from 'react'
import type { PondMenuGroup, PondMenuItem } from '@/components/molecules/PondMenu'
import { conversionsFor, headingLevelOf, type Conversion, type ConversionTarget } from '@/lib/modules/conversions'
import type { Block, BlockWidth } from '@/lib/modules/content'
import { HEADING_CHORDS } from '@/lib/modules/text/markup'
import { formatChord } from '@/lib/shell-commands'

export type BlockMenuAction =
  | { type: 'turn-into'; conversion: Conversion }
  | { type: 'move-into-new-page' }
  | { type: 'copy-link' }
  | { type: 'delete' }
  | { type: 'set-width'; width: BlockWidth }
  | { type: 'fit-height' }

export interface BlockMenuSlots {
  /** The width row, drawn under a `width` head. */
  width?: ReactNode
  /** Offer `move into a new page`. */
  moveIntoNewPage?: boolean
}

export type BlockMenuHandlers = {
  [T in BlockMenuAction['type']]: (action: Extract<BlockMenuAction, { type: T }>) => void
}

const MOVE_INTO_NEW_PAGE: PondMenuItem<BlockMenuAction> = {
  id: 'move-into-new-page',
  label: 'move into a new page',
  action: { type: 'move-into-new-page' },
}

const FIT_HEIGHT: PondMenuItem<BlockMenuAction> = {
  id: 'fit-height',
  label: 'fit height',
  action: { type: 'fit-height' },
}

/** In the board's lowercase words — never the dashed target id itself. */
const CONVERSION_LABELS: Record<ConversionTarget, string> = {
  table: 'table',
  'heading-1': 'heading 1',
  'heading-2': 'heading 2',
  'heading-3': 'heading 3',
  quote: 'quote',
  code: 'code',
  list: 'list',
  checklist: 'checklist',
  text: 'text',
}

/** A heading row's chord hint — Notion's, shown because the editor really
 * binds it (`extensions.ts` reads the same `HEADING_CHORDS`). Every other
 * target shows none: Pond binds no chord for quote/code, so Notion's would
 * be invented. */
const hintFor = (target: ConversionTarget, apple: boolean): string | undefined => {
  const level = headingLevelOf(target)
  return level ? formatChord(HEADING_CHORDS[level], apple) : undefined
}

/**
 * Derive only for a block whose menu is open: the table preview scans the
 * block's whole content. `apple` is the platform the hint is shown for
 * (`useApplePlatform()`, read at the call site — this module stays a pure
 * function of its arguments).
 */
export const blockMenuGroups = (
  block: Block,
  slots: BlockMenuSlots = {},
  apple = true
): PondMenuGroup<BlockMenuAction>[] => [
  {
    id: 'turn-into',
    label: 'turn into',
    heading: true,
    items: conversionsFor(block).map((conversion) => {
      const value = conversion.preview ?? hintFor(conversion.target, apple)
      return {
        id: `turn-into:${conversion.target}`,
        label: CONVERSION_LABELS[conversion.target],
        ...(value ? { value } : {}),
        action: { type: 'turn-into', conversion },
      }
    }),
  },
  { id: 'width', label: 'width', heading: true, content: slots.width },
  {
    id: 'block',
    label: 'block',
    items: [
      ...(block.height != null ? [FIT_HEIGHT] : []),
      ...(slots.moveIntoNewPage ? [MOVE_INTO_NEW_PAGE] : []),
      { id: 'copy-link', label: 'copy link to block', action: { type: 'copy-link' } },
      {
        id: 'delete',
        label: block.type === 'page-link' ? 'remove link' : 'delete',
        action: { type: 'delete' },
      },
    ],
  },
]

export const runBlockMenuAction = (action: BlockMenuAction, handlers: BlockMenuHandlers) => {
  const handle = handlers[action.type] as (action: BlockMenuAction) => void
  handle(action)
}
