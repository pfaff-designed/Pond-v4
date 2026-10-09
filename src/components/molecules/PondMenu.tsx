'use client'

/**
 * PondMenu — Pond's glass menus, on the Base UI menu primitive (focus, roving
 * keys, typeahead, dismissal and ARIA are its). Built: kind `block`.
 *
 * The host owns `open` and hands over its trigger element; the popup is
 * portaled, so it is placed against `placement.anchor` rather than the trigger.
 * On close, focus goes back to the trigger when the menu was opened from it, and
 * to wherever it was when the host opened it some other way.
 * A group is drawn only when it has items or content, with a rule between two
 * drawn groups. Keys pressed in the popup stop there: the portal still bubbles
 * them up the React tree, into whatever hosts the trigger.
 *
 * Class strings are template literals, not `cn()`: tailwind-merge reads an
 * arbitrary text size as a colour and drops one of the two.
 */

import {
  Fragment,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { Menu } from '@base-ui/react/menu'

export const POND_MENU_KINDS = ['block'] as const
export type PondMenuKind = (typeof POND_MENU_KINDS)[number]
export type PondMenuSize = 'desktop' | 'mobile'

export interface PondMenuItem<Action> {
  id: string
  label: string
  /** The mono value at the item's right. */
  value?: string
  action: Action
}

export interface PondMenuGroup<Action> {
  id: string
  /** The group's name — drawn as its head when `heading`, otherwise only announced. */
  label: string
  heading?: boolean
  items?: PondMenuItem<Action>[]
  /** A row that is not a list of items, drawn under the head. */
  content?: ReactNode
}

export interface PondMenuPlacement {
  anchor: RefObject<Element | null>
  /** Which of the anchor's edges the popup lines up with. */
  align: 'start' | 'end'
  /** From the anchor's top edge to the popup's top edge, while it opens downward. */
  top: number
  /** Along the lined-up edge; negative moves the popup outward. */
  alignOffset: number
}

export interface PondMenuProps<Action> {
  kind: PondMenuKind
  /** The menu's accessible name. */
  label: string
  groups: PondMenuGroup<Action>[]
  /** @default 'desktop' */
  size?: PondMenuSize
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (action: Action) => void
  /** The element that opens the menu; it gets the trigger's ARIA and press handling. */
  trigger: ReactElement
  placement: PondMenuPlacement
  /** Where the popup is portaled. @default document.body */
  container?: Menu.Portal.Props['container']
}

const BOX =
  'motion-menu box-border flex flex-col gap-[1px] p-[6px] rounded-[16px] font-sans leading-[normal] text-mn-text outline-none ' +
  '[--motion-menu-origin:var(--transform-origin)] [background:var(--mn-menu-bg)] [border:var(--mn-menu-border)] [box-shadow:var(--mn-menu-shadow)] ' +
  'backdrop-blur-[24px] backdrop-saturate-[1.3]'

const HEAD =
  'px-[10px] pt-[6px] pb-[4px] text-[10.5px] font-medium tracking-[.1em] uppercase text-mn-text-secondary'

const ITEM_BASE =
  'flex cursor-default items-center gap-[9px] rounded-[10px] outline-none transition-colors data-[highlighted]:bg-mn-hover-fill'

const VALUE = 'font-mono text-[10.5px] text-mn-text-secondary'

const RULE = 'h-px flex-none mx-[8px] my-[4px] bg-mn-text/[0.09]'

const SIZES: Record<PondMenuKind, Record<PondMenuSize, { width: string; item: string }>> = {
  block: {
    desktop: { width: 'w-[260px]', item: `${ITEM_BASE} px-[10px] py-[7px] text-[13px]` },
    mobile: { width: 'w-[350px]', item: `${ITEM_BASE} min-h-[44px] px-[12px] text-[15px]` },
  },
}

const isDrawn = <Action,>(group: PondMenuGroup<Action>) =>
  (group.items?.length ?? 0) > 0 || group.content !== undefined

const handlePopupKeyDown = (e: KeyboardEvent<HTMLDivElement>) => e.stopPropagation()

export const PondMenu = <Action,>({
  kind,
  label,
  groups,
  size = 'desktop',
  open,
  onOpenChange,
  onSelect,
  trigger,
  placement,
  container,
}: PondMenuProps<Action>) => {
  const { width, item: itemClass } = SIZES[kind][size]

  return (
    <Menu.Root open={open} onOpenChange={(next) => onOpenChange(next)} modal={false}>
      <Menu.Trigger render={trigger} />
      <Menu.Portal container={container}>
        <Menu.Positioner
          anchor={placement.anchor}
          side="bottom"
          align={placement.align}
          // Measured from the anchor's top, not its bottom edge: the menu overlaps
          // what it acts on. Flipped above, it clears the anchor.
          sideOffset={({ side, anchor }) => (side === 'bottom' ? placement.top - anchor.height : 0)}
          alignOffset={placement.alignOffset}
          className="z-[100]"
        >
          <Menu.Popup
            aria-label={label}
            aria-labelledby={undefined}
            data-kind={kind}
            data-size={size}
            onKeyDown={handlePopupKeyDown}
            className={`${BOX} ${width}`}
          >
            {groups.filter(isDrawn).map((group, index) => (
              <Fragment key={group.id}>
                {index > 0 && <Menu.Separator className={RULE} />}
                <Menu.Group
                  aria-label={group.heading ? undefined : group.label}
                  className="flex flex-col gap-[1px]"
                >
                  {group.heading && (
                    <Menu.GroupLabel className={HEAD}>{group.label}</Menu.GroupLabel>
                  )}
                  {group.content}
                  {group.items?.map((item) => (
                    <Menu.Item
                      key={item.id}
                      label={item.label}
                      onClick={() => onSelect(item.action)}
                      className={itemClass}
                    >
                      <span className="flex-1">{item.label}</span>
                      {item.value && <span className={VALUE}>{item.value}</span>}
                    </Menu.Item>
                  ))}
                </Menu.Group>
              </Fragment>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
