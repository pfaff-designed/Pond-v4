/**
 * The ⌘K palette's board rows as items (#279) — ONE fixture for the jest suite
 * (`command-palette.test.tsx`) and the stories (`PondCommand.stories.tsx`),
 * so the two cannot drift, and so the stories file exports nothing Storybook
 * would mistake for a story (it treats every named export as one; this repo
 * sets `excludeStories` nowhere).
 *
 * The rows are `PondPicker.dc.html`'s palette frames: the three recent pages,
 * the pages and records its `typing` / `record` / `empty` / `scoped` states
 * list, a `pond` row, and its actions. `Savings` is
 * the one row the board does not draw: a page whose title is capitalised, so a
 * guard that the CHROME is lowercase is exercised against page content that
 * keeps its case (ADR 0004 §4 — "a page's name is page content quoted inside a
 * machine surface").
 */

import type { PaletteItem } from '@/components/molecules/palette-entries'

export const PALETTE_ITEMS: readonly PaletteItem[] = [
  {
    id: 'kitchen',
    label: 'kitchen renovation',
    kind: 'page',
    sub: 'creativity',
    glyph: 'star-01',
    recent: true,
    path: ['creativity'],
  },
  {
    id: 'budget',
    label: 'budget',
    kind: 'page',
    sub: 'money',
    glyph: 'ring',
    recent: true,
    path: ['money'],
  },
  {
    id: 'journal',
    label: 'journal',
    kind: 'page',
    sub: 'personal',
    glyph: 'house',
    recent: true,
    path: ['personal'],
  },
  {
    id: 'subscriptions',
    label: 'subscriptions',
    kind: 'page',
    sub: 'money',
    glyph: 'ring',
    path: ['money'],
  },
  { id: 'savings', label: 'Savings', kind: 'page', sub: 'money', glyph: 'ring', path: ['money'] },
  {
    id: 'cabinet-plan',
    label: 'cabinet plan',
    kind: 'page',
    sub: 'creativity',
    glyph: 'star-01',
    path: ['creativity', 'kitchen'],
  },
  {
    id: 'make-page',
    label: 'make this a page',
    kind: 'page',
    sub: 'journal · mentions make noise',
    glyph: 'house',
    path: ['personal', 'journal'],
  },
  { id: 'transactions', label: 'transactions', kind: 'database', sub: 'money', path: ['money'] },
  {
    id: 'make-noise',
    label: 'make noise',
    kind: 'pond',
    sub: 'pond · switch',
    glyph: 'lightning-03',
  },
  { id: 'chase', label: 'chase the cable quote', kind: 'action' },
  { id: 'log-workout', label: 'log a workout', kind: 'action' },
  { id: 'log-meal', label: 'log a meal', kind: 'action' },
  { id: 'log-sleep', label: 'log sleep', kind: 'action' },
]

/** What the host feeds under `records` for a query — listed as handed over, never re-filtered. */
export const PALETTE_RECORDS: Readonly<Record<string, readonly PaletteItem[]>> = {
  cab: [{ id: 'cabinet-quote', label: 'cabinet quote', kind: 'record', sub: 'tasks' }],
  adobe: [
    {
      id: 'adobe',
      label: 'adobe creative cloud',
      kind: 'record',
      sub: 'subscriptions · renews 28 sep',
    },
  ],
}

/** The fixture list as the shell would hand it for `query`: pages and actions, plus its records. */
export const paletteItemsFor = (query: string): readonly PaletteItem[] => [
  ...PALETTE_ITEMS,
  ...(PALETTE_RECORDS[query] ?? []),
]

/**
 * The `opened` frame's `suggested` group, in the board's order — "two actions
 * Pond expects from the time and the page you are on". A fixture: the shell has
 * no such inference yet (#285) and passes none.
 */
export const PALETTE_SUGGESTED: readonly PaletteItem[] = ['chase', 'log-workout'].map((id) =>
  PALETTE_ITEMS.find((i) => i.id === id)!
)

/**
 * Every string on the open box that is Pond's own — the chrome — as one string:
 * group labels, the note, the foot, the input's placeholder, the `esc` chip and
 * scope chip, and the action rows (minted or standing, all in Pond's words).
 * Page, record and pond names are content and are left out: they keep their case.
 */
export function paletteChrome(box: HTMLElement): string {
  const parts = [
    ...box.querySelectorAll(
      '[data-part="group"], [data-part="note"], [data-part="foot"], [data-part="scope"], [data-part="chip"], [data-kind="action"]'
    ),
  ].map((el) => el.textContent ?? '')
  return [...parts, box.querySelector('input')?.placeholder ?? ''].join('')
}
