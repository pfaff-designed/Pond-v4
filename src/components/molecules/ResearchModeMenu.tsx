'use client'

/**
 * ResearchModeMenu — the composer's mode menu (6r f1): two fixed rows, `ask`
 * and `deep research`, picking the mode for the next question. Presentational:
 * the host owns the trigger, the anchor and which row is current.
 */

import type { ReactElement } from 'react'
import { Menu } from '@base-ui/react/menu'
import { PondMenu, type PondMenuGroup, type PondMenuPlacement } from './PondMenu'

export type ResearchModeMenuAction = 'ask' | 'deep-research'

export interface ResearchModeMenuProps {
  /** Which row is the current mode. */
  selected: ResearchModeMenuAction
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (action: ResearchModeMenuAction) => void
  /** The element that opens the menu; it gets the trigger's ARIA and press handling. */
  trigger: ReactElement
  placement: PondMenuPlacement
  /** Where the popup is portaled. @default document.body */
  container?: Menu.Portal.Props['container']
}

export const ResearchModeMenu = ({
  selected,
  open,
  onOpenChange,
  onSelect,
  trigger,
  placement,
  container,
}: ResearchModeMenuProps) => {
  const groups: PondMenuGroup<ResearchModeMenuAction>[] = [
    {
      id: 'mode',
      label: 'mode',
      items: [
        {
          id: 'ask',
          label: 'ask',
          value: 'reads this pond. quick.',
          action: 'ask',
          selected: selected === 'ask',
        },
        {
          id: 'deep-research',
          label: 'deep research',
          value:
            'reads the web and this pond. slow and thorough: primary sources, every claim checked against independent ones.',
          action: 'deep-research',
          selected: selected === 'deep-research',
        },
      ],
    },
  ]

  return (
    <PondMenu
      kind="mode"
      label="mode menu"
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
