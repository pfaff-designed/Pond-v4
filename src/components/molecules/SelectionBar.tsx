'use client'

/**
 * The one selection bar (`Pond 02 Component library.dc.html` frame `2t`,
 * item order AUDIT C6): text style, bold, italic, link, list, highlight,
 * comment, ask pond, new page from this, copy. Static for now — selection
 * watching, positioning and per-item wiring land in later KAN-95 items.
 */

import { Fragment } from 'react'

export type SelectionBarItemId =
  | 'text-style'
  | 'bold'
  | 'italic'
  | 'link'
  | 'list'
  | 'highlight'
  | 'comment'
  | 'ask-pond'
  | 'new-page-from-this'
  | 'copy'

export interface SelectionBarItem {
  id: SelectionBarItemId
  /** The item's accessible name, and its visible label where the board draws one. */
  label: string
  /** False for `highlight`, `comment` and `new page from this` — their own tickets wire them. */
  enabled: boolean
  /** A divider sits after this item, per `2t`'s three groups. */
  dividerAfter?: true
}

/** The ten items, in the board's own order. */
export const SELECTION_BAR_ITEMS: readonly SelectionBarItem[] = [
  { id: 'text-style', label: 'text', enabled: true, dividerAfter: true },
  { id: 'bold', label: 'bold', enabled: true },
  { id: 'italic', label: 'italic', enabled: true },
  { id: 'link', label: 'link', enabled: true },
  { id: 'list', label: 'list', enabled: true, dividerAfter: true },
  { id: 'highlight', label: 'highlight', enabled: false },
  { id: 'comment', label: 'comment', enabled: false, dividerAfter: true },
  { id: 'ask-pond', label: 'ask pond', enabled: true },
  { id: 'new-page-from-this', label: 'new page from this', enabled: false },
  { id: 'copy', label: 'copy', enabled: true },
]

/** Items the board draws with their own visible label — the rest need `aria-label`. */
const HAS_VISIBLE_LABEL: ReadonlySet<SelectionBarItemId> = new Set([
  'text-style',
  'highlight',
  'comment',
  'ask-pond',
  'new-page-from-this',
])

/** The board's shared 14×14 icon recipe (`fill none`, `currentColor`, round caps/joins). */
const ICON_14 = {
  width: 14,
  height: 14,
  viewBox: '0 0 14 14',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** The sans label the two-type-register note (`2t`) draws at 12.5px — `text`, `highlight`, `comment`. */
const SansLabel = ({ children }: { children: string }) => (
  <span className="text-[12.5px]">{children}</span>
)

/** The machine-surface label the same note draws mono 11.5px — `ask pond`, `new page from this`. */
const MonoLabel = ({ children }: { children: string }) => (
  <span className="font-mono text-[11.5px] lowercase">{children}</span>
)

/** Each item's mark, read off the board's own svg path data and type. */
const Mark = ({ item }: { item: SelectionBarItem }) => {
  switch (item.id) {
    case 'text-style':
      return (
        <>
          <SansLabel>text</SansLabel>
          <svg
            width="9"
            height="9"
            viewBox="0 0 9 9"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: 'rotate(90deg)' }}
            aria-hidden
          >
            <path d="M3.5 2 L7 5 L3.5 8" />
          </svg>
        </>
      )
    case 'bold':
      return <span className="text-[14px] font-bold">B</span>
    case 'italic':
      return <span className="font-serif text-[17px] font-extralight italic">I</span>
    case 'link':
      return (
        <svg {...ICON_14} aria-hidden>
          <path d="M6 8a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.6.6M8 6a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 6 11.5l.6-.6" />
        </svg>
      )
    case 'list':
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M5.5 3.5h6M5.5 7h6M5.5 10.5h6" />
          <path d="M2.6 3.5h.01M2.6 7h.01M2.6 10.5h.01" strokeWidth={2} />
        </svg>
      )
    case 'highlight':
      return (
        <>
          <svg {...ICON_14} aria-hidden>
            <path d="M8.5 2.5l3 3-5 5H3.5v-3z" />
            <path d="M2.5 12h9" />
          </svg>
          <SansLabel>highlight</SansLabel>
        </>
      )
    case 'comment':
      return (
        <>
          <svg
            width="14"
            height="14"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2.5 3h7v4.6h-3.6L3.8 9.4V7.6H2.5z" />
          </svg>
          <SansLabel>comment</SansLabel>
        </>
      )
    case 'ask-pond':
      return <MonoLabel>ask pond</MonoLabel>
    case 'new-page-from-this':
      return <MonoLabel>new page from this</MonoLabel>
    case 'copy':
      return (
        <svg {...ICON_14} aria-hidden>
          <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" />
          <path d="M9.5 4.5V3.2a.7.7 0 0 0-.7-.7H3.2a.7.7 0 0 0-.7.7v5.6c0 .4.3.7.7.7h1.3" />
        </svg>
      )
  }
}

/**
 * The one selection bar: the board's glass, gap and item chrome over the ten
 * items, in order. No selection watching, positioning or handlers yet.
 */
export function SelectionBar() {
  return (
    <div
      data-part="selection-bar"
      className="mn-glass box-border flex items-center gap-[2px] rounded-[14px] p-[4px]"
    >
      {SELECTION_BAR_ITEMS.map((item) => (
        <Fragment key={item.id}>
          <button
            type="button"
            aria-label={HAS_VISIBLE_LABEL.has(item.id) ? undefined : item.label}
            className="box-border inline-flex h-[32px] min-w-[32px] items-center justify-center gap-[6px] rounded-[10px] px-[9px] hover:bg-mn-text/[0.07] active:bg-mn-text/[0.07]"
          >
            <Mark item={item} />
          </button>
          {item.dividerAfter && <span aria-hidden className="h-[18px] w-px bg-mn-text/[0.12]" />}
        </Fragment>
      ))}
    </div>
  )
}
