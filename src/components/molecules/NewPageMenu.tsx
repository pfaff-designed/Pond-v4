'use client'

/**
 * NewPageMenu — the board's new-page menu (6s f1), anchored to a row's ＋.
 * "page" is 6f's one step done through the menu; "from a template" opens the
 * existing `/` picker on a fresh blank page. The freeform ticket adds a third
 * row here. Presentational: the host owns the parent, the anchor and what
 * each row does.
 */

import type { ReactElement } from 'react'
import { Menu } from '@base-ui/react/menu'
import { PondMenu, type PondMenuGroup, type PondMenuPlacement } from './PondMenu'

export type NewPageMenuAction = 'page' | 'template'

export interface NewPageMenuProps {
  /** The page the new page is made under — named in the header, which truncates (G7). */
  parentTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (action: NewPageMenuAction) => void
  /** The element that opens the menu; it gets the trigger's ARIA and press handling. */
  trigger: ReactElement
  placement: PondMenuPlacement
  /** Where the popup is portaled. @default document.body */
  container?: Menu.Portal.Props['container']
}

export const NewPageMenu = ({
  parentTitle,
  open,
  onOpenChange,
  onSelect,
  trigger,
  placement,
  container,
}: NewPageMenuProps) => {
  const groups: PondMenuGroup<NewPageMenuAction>[] = [
    {
      id: 'new-page',
      label: `new page in ${parentTitle}`,
      heading: true,
      items: [
        { id: 'page', label: 'page', value: 'blocks, text, databases', action: 'page' },
        { id: 'template', label: 'from a template', value: 'twelve to start from', action: 'template' },
      ],
    },
  ]

  return (
    <PondMenu
      kind="newPage"
      label="new page menu"
      groups={groups}
      open={open}
      onOpenChange={onOpenChange}
      onSelect={onSelect}
      trigger={trigger}
      placement={placement}
      container={container}
    />
  )
}
