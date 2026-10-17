'use client'

/**
 * The saved-view bar (`Pond 02 Component library` 2w, values read off
 * `PondCalendar.dc.html:133,143`) — one segment per saved view on a view
 * block, switching between them. Clicking a segment is READING, not editing
 * (KAN-36's ruling), so this wraps base-ui's `Tabs` rather than `ToggleGroup`
 * (the seg `SourcePicker.tsx` already wears): `Toggle` only gives
 * `aria-pressed`, and this bar needs `aria-selected` + arrow-key movement
 * between segments, which `Tabs.Tab`/`Tabs.List` give for free through the
 * same roving-focus composite every other base-ui collection uses. There is
 * no panel content — the active view's config feeds the block's own
 * renderer elsewhere, not a `Tabs.Panel`.
 *
 * Values from PondCalendar's segmented pill, read inline off the board:
 * container `rounded-full p-[3px] bg-mn-text/[0.055]` (`.08` on ink); every
 * segment `rounded-full px-[10px] py-[4px] text-[10.5px] font-medium`;
 * active is a solid chip — `bg-mn-text text-raw-paper dark:text-raw-ink`,
 * the codebase's existing inverse-text pattern (`ZenPill.tsx`,
 * `NewPondSheet.tsx`'s `Pill`, `button.tsx`'s `primary` variant); inactive
 * ink .68, no fill. "＋ view" stays 6o's inert affordance in the trailing
 * slot, outside the pill (Views 3/4 wires it; KAN-243).
 */

import { useRef, useState } from 'react'

import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import { ViewTabsList, ViewTabsRoot, ViewTabsTab } from '@/components/molecules/view-tabs'
import { ViewKindPicker, type ViewKindPickerRow } from '@/components/molecules/ViewKindPicker'
import type { ViewMode } from '@/lib/modules/view/schema'

export interface ViewBarView {
  id: string
  label: string
}

interface ViewBarBase {
  views: readonly ViewBarView[]
  activeId: string
  onSelect: (id: string) => void
}

export type ViewBarProps = ViewBarBase &
  (
    | {
        /** Editable only — a reader can still switch views, but never adds one. */
        showAddView: true
        /** The ＋ view picker's rows, one per `VIEW_KINDS` entry. */
        addViewRows: readonly ViewKindPickerRow[]
        /** Picking a row closes the picker and hands the host the chosen kind. */
        onAddView: (mode: ViewMode) => void
      }
    | { showAddView: false; addViewRows?: undefined; onAddView?: undefined }
  )

const ROW = 'flex items-center gap-[4px]'
const SEGMENT_ROW =
  // leading-[normal]: board seg is 26.5px tall. Not leading-normal, which
  // globals.css sets to 1.5 and measures 29px (10.5px × 1.5).
  'flex items-center gap-[4px] rounded-full p-[3px] text-[10.5px] font-medium leading-[normal] bg-mn-text/[0.055] dark:bg-mn-text/[0.08]'
const SEGMENT = `rounded-full px-[10px] py-[4px] ${FOCUS_VISIBLE_RING}`
const SEGMENT_ON = 'bg-mn-text text-raw-paper dark:text-raw-ink'
const SEGMENT_OFF = 'text-mn-text-secondary'
const ADD_VIEW = `px-[9px] py-[5px] font-mono text-[11px] text-mn-text-secondary ${FOCUS_VISIBLE_RING}`

export function ViewBar(props: ViewBarProps) {
  const { views, activeId, onSelect, showAddView } = props
  const addViewRef = useRef<HTMLButtonElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const closePicker = () => {
    setPickerOpen(false)
    addViewRef.current?.focus()
  }

  return (
    <ViewTabsRoot value={activeId} onValueChange={onSelect} className={ROW}>
      <ViewTabsList className={SEGMENT_ROW}>
        {views.map((view) => (
          <ViewTabsTab
            key={view.id}
            value={view.id}
            className={`${SEGMENT} ${view.id === activeId ? SEGMENT_ON : SEGMENT_OFF}`}
          >
            {view.label}
          </ViewTabsTab>
        ))}
      </ViewTabsList>
      {showAddView && (
        <button
          ref={addViewRef}
          type="button"
          aria-label="add a view"
          onClick={() => setPickerOpen((open) => !open)}
          className={ADD_VIEW}
        >
          ＋ view
        </button>
      )}
      {showAddView && pickerOpen && (
        <ViewKindPicker
          rows={props.addViewRows}
          anchor={addViewRef}
          onPick={(mode) => {
            closePicker()
            props.onAddView(mode)
          }}
          onClose={closePicker}
        />
      )}
    </ViewTabsRoot>
  )
}
