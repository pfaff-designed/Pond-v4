'use client'

/**
 * PondMenu — Pond's glass menus, on the Base UI menu primitive (focus, roving
 * keys, typeahead, dismissal and ARIA are its). Built: kinds `block`, `newPage`,
 * `mode`.
 *
 * The host owns `open` and hands over its trigger element; the popup is
 * portaled, so it is placed against `placement.anchor` rather than the trigger.
 * On close, focus goes back to the trigger when the menu was opened from it, and
 * to wherever it was when the host opened it some other way.
 * A group is drawn only when it has items or content, with a rule between two
 * drawn groups. Keys pressed in the popup stop there: the portal still bubbles
 * them up the React tree, into whatever hosts the trigger.
 *
 * `mode` draws a solid card (`bg-mn-card`), not the other kinds' dismissal
 * glass: it sits inside a host surface (the composer) rather than floating
 * over the canvas, so it carries no blur/backdrop of its own (6r f1). It lays
 * out in flow instead — `position: static`, no `transform`, full width of
 * whatever `container` the host portals it into — so `placement` is unused
 * for this kind.
 *
 * Class strings are template literals, not `cn()`: tailwind-merge reads an
 * arbitrary text size as a colour and drops one of the two.
 */

import {
  Fragment,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { Menu } from '@base-ui/react/menu'

export const POND_MENU_KINDS = ['block', 'newPage', 'mode'] as const
export type PondMenuKind = (typeof POND_MENU_KINDS)[number]
export type PondMenuSize = 'desktop' | 'mobile'

export interface PondMenuItem<Action> {
  id: string
  label: string
  /** The item's mono secondary text — at the right for `block`, stacked beneath the label for `newPage`/`mode`. */
  value?: string
  action: Action
  /** The menu's current pick (kind `mode`): a ground wash + bold title, independent of hover/keyboard highlight. */
  selected?: boolean
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

/** A fixed point to anchor against (a right-click's pointer position) — no element behind it. */
export interface PondMenuVirtualAnchor {
  getBoundingClientRect: () => DOMRect
}

export interface PondMenuPlacement {
  anchor: RefObject<Element | null> | PondMenuVirtualAnchor
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
  'truncate px-[10px] pt-[6px] pb-[4px] text-[10.5px] font-medium tracking-[.1em] uppercase text-mn-text-secondary'

const ITEM_BASE =
  'flex cursor-default items-center gap-[9px] rounded-[10px] outline-none transition-colors data-[highlighted]:bg-mn-hover-fill'

/** A stacked item — label over hint — for kinds like `newPage` that have no inline value. */
const STACK_ITEM_BASE =
  'group flex cursor-default flex-col gap-[2px] rounded-[10px] outline-none transition-colors data-[highlighted]:bg-mn-hover-fill'

/** The stacked item's label — carries the highlighted weight alone; the hint beneath it stays regular. */
const STACK_LABEL = 'group-data-[highlighted]:font-medium'

const VALUE = 'font-mono text-[10.5px] text-mn-text-secondary'

const RULE = 'h-px flex-none mx-[8px] my-[4px] bg-mn-text/[0.09]'

/** Kind `mode`'s own card (6r f1): a solid card over the host surface, not the other kinds' dismissal glass. */
const MODE_BOX =
  'motion-menu box-border flex flex-col gap-[1px] p-[4px] rounded-[14px] font-sans leading-[normal] text-mn-text outline-none ' +
  '[--motion-menu-origin:var(--transform-origin)] bg-mn-card shadow-[0_1px_2px_rgba(40,34,24,0.06)]'

/** Kind `mode`'s selected-row ground wash (6r f1) — set from `item.selected`, not hover/keyboard highlight. */
const MODE_SELECTED_ROW = 'bg-mn-text/[0.07]'

/**
 * Kind `mode` lays out in flow, inside the host's own `container` (6r f1), not
 * floating over it — `transform` applies regardless of `position`, so both are
 * overridden together.
 */
const MODE_STATIC_STYLE: CSSProperties = { position: 'static', transform: 'none' }

const SIZES: Record<PondMenuKind, Record<PondMenuSize, { width: string; item: string; label: string }>> = {
  block: {
    desktop: { width: 'w-[260px]', item: `${ITEM_BASE} px-[10px] py-[7px] text-[13px]`, label: 'flex-1' },
    mobile: {
      width: 'w-[350px]',
      item: `${ITEM_BASE} min-h-[44px] px-[12px] text-[15px]`,
      label: 'flex-1',
    },
  },
  newPage: {
    desktop: {
      width: 'w-[300px]',
      item: `${STACK_ITEM_BASE} px-[10px] py-[8px] text-[13.5px]`,
      label: `flex-1 ${STACK_LABEL}`,
    },
    mobile: {
      width: 'w-[300px]',
      item: `${STACK_ITEM_BASE} px-[10px] py-[8px] text-[13.5px]`,
      label: `flex-1 ${STACK_LABEL}`,
    },
  },
  mode: {
    desktop: {
      width: 'w-full',
      item: `${STACK_ITEM_BASE} px-[10px] py-[9px] text-[13.5px]`,
      label: 'flex-1',
    },
    mobile: {
      width: 'w-full',
      item: `${STACK_ITEM_BASE} px-[10px] py-[9px] text-[13.5px]`,
      label: 'flex-1',
    },
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
  const { width, item: itemClass, label: labelClass } = SIZES[kind][size]
  const boxClass = kind === 'mode' ? MODE_BOX : BOX

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
          className={kind === 'mode' ? undefined : 'z-[100]'}
          style={kind === 'mode' ? MODE_STATIC_STYLE : undefined}
        >
          <Menu.Popup
            aria-label={label}
            aria-labelledby={undefined}
            data-kind={kind}
            data-size={size}
            onKeyDown={handlePopupKeyDown}
            className={`${boxClass} ${width}`}
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
                      onClick={(e) => {
                        // The popup is portaled, but React bubbles synthetic
                        // events through the component tree, not the DOM tree —
                        // without this a menu nested in a clickable row (the
                        // new-page menu in its ＋ trigger) would also fire the
                        // row's own onClick.
                        e.stopPropagation()
                        onSelect(item.action)
                      }}
                      className={item.selected ? `${itemClass} ${MODE_SELECTED_ROW}` : itemClass}
                    >
                      <span className={item.selected ? `${labelClass} font-medium` : labelClass}>
                        {item.label}
                      </span>
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
