/**
 * The block menu's content (`PondMenu` kind `block`): its groups for one block,
 * the actions its items carry, and the one dispatch from an action to what it
 * does. A group with nothing in it is not drawn, so a slot left out costs no row
 * and no rule.
 */

import type { ReactNode } from 'react'
import type { PondMenuGroup, PondMenuItem } from '@/components/molecules/PondMenu'
import { conversionsFor, type Conversion } from '@/lib/modules/conversions'
import type { Block, BlockWidth } from '@/lib/modules/content'

export type BlockMenuAction =
  | { type: 'turn-into'; conversion: Conversion }
  | { type: 'move-into-new-page' }
  | { type: 'copy-link' }
  | { type: 'delete' }
  | { type: 'set-width'; width: BlockWidth }

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

/**
 * Derive only for a block whose menu is open: the table preview scans the
 * block's whole content.
 */
export const blockMenuGroups = (
  block: Block,
  slots: BlockMenuSlots = {}
): PondMenuGroup<BlockMenuAction>[] => [
  {
    id: 'turn-into',
    label: 'turn into',
    heading: true,
    items: conversionsFor(block).map((conversion) => ({
      id: `turn-into:${conversion.target}`,
      label: conversion.target,
      ...(conversion.preview ? { value: conversion.preview } : {}),
      action: { type: 'turn-into', conversion },
    })),
  },
  { id: 'width', label: 'width', heading: true, content: slots.width },
  {
    id: 'block',
    label: 'block',
    items: [
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
