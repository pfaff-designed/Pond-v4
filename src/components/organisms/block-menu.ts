/**
 * The block menu's content (`PondMenu` kind `block`): its groups for one block,
 * the actions its items carry, and the one dispatch from an action to what it
 * does. A group with nothing in it is not drawn, so a slot left out costs no row
 * and no rule.
 */

import type { ReactNode } from 'react'
import type { PondMenuGroup, PondMenuItem, PondMenuSize } from '@/components/molecules/PondMenu'
import {
  conversionsFor,
  headingLevelOf,
  type Conversion,
  type ConversionTarget,
} from '@/lib/modules/conversions'
import type { Block, BlockWidth } from '@/lib/modules/content'
import { HEADING_CHORDS } from '@/lib/modules/text/markup'
import { formatChord } from '@/lib/shell-commands'

export type BlockMenuAction =
  | { type: 'turn-into'; conversion: Conversion }
  | { type: 'move-into-new-page' }
  | { type: 'move-to'; block: Block }
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

/** A view draws its host page's own rows, and a page-link's child wouldn't
 *  follow it to a new parent — neither has anything to move (KAN-479). */
const canMoveTo = (block: Block): boolean => block.type !== 'view' && block.type !== 'page-link'

const moveToItem = (block: Block): PondMenuItem<BlockMenuAction> => ({
  id: 'move-to',
  label: 'move to…',
  action: { type: 'move-to', block },
})

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
  page: 'page',
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
 * function of its arguments). `size` gates `delete`: a phone has no ⌘⌫ and
 * no other delete path, so `mobile` keeps the row; `desktop` deletes only
 * via ⌘⌫ (board 8e), so the row is dropped there.
 */
export const blockMenuGroups = (
  block: Block,
  slots: BlockMenuSlots = {},
  apple = true,
  size: PondMenuSize = 'desktop'
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
      ...(canMoveTo(block) ? [moveToItem(block)] : []),
      { id: 'copy-link', label: 'copy link to block', action: { type: 'copy-link' } },
      ...(size === 'mobile'
        ? [
            {
              id: 'delete',
              label: block.type === 'page-link' ? 'remove link' : 'delete',
              action: { type: 'delete' as const },
            },
          ]
        : []),
    ],
  },
]

export const runBlockMenuAction = (action: BlockMenuAction, handlers: BlockMenuHandlers) => {
  const handle = handlers[action.type] as (action: BlockMenuAction) => void
  handle(action)
}
