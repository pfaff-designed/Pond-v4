'use client'

/**
 * The saved-view bar (`Pond 06.15 Change log` 6o f2) — one segment per saved
 * view on a view block, switching between them. Clicking a segment is
 * READING, not editing (KAN-36's ruling), so this wraps base-ui's `Tabs`
 * rather than `ToggleGroup` (the seg `SourcePicker.tsx` already wears):
 * `Toggle` only gives `aria-pressed`, and this bar needs `aria-selected` +
 * arrow-key movement between segments, which `Tabs.Tab`/`Tabs.List` give for
 * free through the same roving-focus composite every other base-ui
 * collection uses. There is no panel content — the active view's config
 * feeds the block's own renderer elsewhere, not a `Tabs.Panel`.
 *
 * Values from 6o f2, read inline off the board (and mirrored in
 * `ChangeLogPage.tsx`'s own "＋ view", the same frame's inert affordance):
 * row `flex items-center gap-[4px] text-[12.5px]`; segment
 * `rounded-[999px] px-[11px] py-[5px]`; active `bg-mn-text/[0.07]` + `font-
 * medium` + ink 100; inactive ink .68, no ground; "＋ view"
 * `px-[9px] py-[5px]`, ink .68, mono 11px, no pill, inert (Views 3/4 wires
 * it).
 */

import { Tabs } from '@base-ui/react/tabs'

import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'

export interface ViewBarView {
  id: string
  label: string
}

export interface ViewBarProps {
  views: readonly ViewBarView[]
  activeId: string
  onSelect: (id: string) => void
  /** Editable only — a reader can still switch views, but never adds one. */
  showAddView: boolean
}

const ROW = 'flex items-center gap-[4px] text-[12.5px]'
const SEGMENT_ROW = 'flex items-center gap-[4px]'
const SEGMENT = `rounded-[999px] px-[11px] py-[5px] ${FOCUS_VISIBLE_RING}`
const SEGMENT_ON = 'bg-mn-text/[0.07] font-medium text-mn-text'
const SEGMENT_OFF = 'text-mn-text-secondary'
const ADD_VIEW = 'px-[9px] py-[5px] font-mono text-[11px] text-mn-text-secondary'

export function ViewBar({ views, activeId, onSelect, showAddView }: ViewBarProps) {
  return (
    <Tabs.Root
      value={activeId}
      onValueChange={(value) => {
        if (typeof value === 'string') onSelect(value)
      }}
      className={ROW}
    >
      {/* A segmented control previews on arrow-key movement, unlike a tabbed
          panel's manual activation — `activateOnFocus` makes ←/→ select, not
          just move focus. */}
      <Tabs.List activateOnFocus className={SEGMENT_ROW}>
        {views.map((view) => (
          <Tabs.Tab
            key={view.id}
            value={view.id}
            className={`${SEGMENT} ${view.id === activeId ? SEGMENT_ON : SEGMENT_OFF}`}
          >
            {view.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {showAddView && (
        <span aria-disabled="true" className={ADD_VIEW}>
          ＋ view
        </span>
      )}
    </Tabs.Root>
  )
}
