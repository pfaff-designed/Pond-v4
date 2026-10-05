/**
 * What the `/` menu lists for a given query and pane — pure, so the surface in
 * `SlashMenu.tsx` only draws (#278).
 *
 * `PondPicker.dc.html`'s `filtered` state splits each matched label `pre` / `hit` /
 * `post` and underlines the hit — a three-part split, never a background wash —
 * and drops the group labels while a query is live. Matching is the label and
 * the row's short alias, nothing else (2c: "narrows by name and alias"): a row
 * whose label does not match but whose alias does still lists, with that alias as
 * its hint and nothing underlined (the board's `entry log · dated table`).
 */

import { TEMPLATE_KINDS, type TemplateKind } from '@/lib/templates/types'

export interface SlashIcon {
  /** A path on the board's 14 × 14 grid, stroked at 1.4 — or filled when `filled`. */
  d: string
  filled?: boolean
}

/** The board's group labels for the slash kind (`PondPicker.dc.html`'s `G(…)` calls). */
export type SlashGroup = 'text' | 'blocks' | 'templates' | 'pages'

export interface SlashRow {
  id: string
  /** Pond's word for what this row inserts — lowercase, from the glossary or the board. */
  label: string
  /** A second name, short and lowercase; matched against the query and shown as the hint when it matched. */
  alias?: string
  /** Neither matched nor drawn. `AITerminal`'s `CHAT_COMMANDS` still supplies it and may not change. */
  description?: string
  /** The board's shortcut hint at rest — `#`, `"`, `-`, `[]`, `proposes`. */
  key?: string
  icon?: SlashIcon
  /** Omitted rows list ungrouped. */
  group?: SlashGroup
  /** The registered module type this row mints — read by the derived registry guard. */
  type?: string
  /** The row opens a pane rather than inserting. */
  submenu?: 'templates'
}

export type TemplatePick =
  { origin: 'premade'; kind: TemplateKind } | { origin: 'yours'; id: string }

export interface YourTemplate {
  id: string
  name: string
  hint?: string
}

export type SlashEntry =
  | { kind: 'group'; label: string }
  | { kind: 'note'; text: string }
  | {
      kind: 'row'
      id: string
      label: string
      pre: string
      hit: string
      post: string
      hint?: string
      /** The board's `sub`: inline after the label, mono 10.5 at ink .68 (the source picker's chart rows). */
      sub?: string
      /** The board's `faint`: the whole row at ink .8 rather than full ink (the `field` add row). */
      faint?: boolean
      icon?: SlashIcon
      row?: SlashRow
      template?: TemplatePick
    }

export type SlashPane = 'rows' | 'templates'

/**
 * `PondPicker.dc.html`'s `I` table — every hand-drawn mark the three picker kinds
 * lead a row with, on the board's 14 × 14 grid, stroked at 1.4. ONE owner (#280):
 * the `/` menu's rows (`lib/modules/palette.ts`), the palette's `db` mark
 * (`palette-row.tsx`) and the source picker (`source-entries.ts`) all read it here.
 */
export const ICON = {
  text: { d: 'M3 3.5h8M7 3.5v7.5' },
  heading: { d: 'M3.5 3v8M10 3v8M3.5 7H10' },
  link: {
    d: 'M6 8l2-2M5.4 6.4 4 7.8a1.9 1.9 0 0 0 2.7 2.7L8 9.2M8.6 7.6 10 6.2a1.9 1.9 0 0 0-2.7-2.7L6 4.8',
  },
  file: { d: 'M4 2h4l3 3v7H4zM8 2v3h3' },
  quote: { d: 'M5.6 3.4C4 4 3 5.2 3 7v3.2h2.8V7.4H4M11 3.4C9.4 4 8.4 5.2 8.4 7v3.2h2.8V7.4H9.4' },
  number: { d: 'M5.4 2.5 4.4 11.5M9.6 2.5l-1 9M2.6 5.4h9M2.2 8.6h9' },
  pond: { d: 'M7 7 L12.74 5.25 A6 6 0 1 1 8.75 1.26 Z' },
  list: { d: 'M6 4h5.5M6 7h5.5M6 10h5.5M3.2 4h.01M3.2 7h.01M3.2 10h.01' },
  check: { d: 'M2.4 4.2l1 1 1.8-2M7 4.2h4.6M2.4 9.8l1 1 1.8-2M7 9.8h4.6' },
  table: {
    d: 'M3.2 2.5h7.6a1.2 1.2 0 0 1 1.2 1.2v6.6a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 10.3V3.7a1.2 1.2 0 0 1 1.2-1.2zM2 6h10M6 2.5v9',
  },
  gallery: { d: 'M2 2.5h4.2v4.2H2zM7.8 2.5H12v4.2H7.8zM2 8h4.2v4.2H2zM7.8 8H12v4.2H7.8z' },
  chart: { d: 'M2.5 11.5h9M4.2 11.5V7.5M7 11.5V3.5M9.8 11.5V8.8' },
  log: { d: 'M2 7a5 5 0 1 0 10 0a5 5 0 1 0-10 0M7 4.4V7l1.9 1.2' },
  tpl: { d: 'M2 2h10v3H2zM2 6.5h10v2H2zM2 10h6v2H2z' },
  page: { d: 'M3.5 2h5l2.5 2.5V12h-7.5zM8.5 2v2.5H11' },
  plus: { d: 'M7 3v8M3 7h8' },
  db: {
    d: 'M2.4 3.4a4.6 1.6 0 1 0 9.2 0a4.6 1.6 0 1 0-9.2 0M2.4 3.4v7.2c0 .9 2 1.6 4.6 1.6s4.6-.7 4.6-1.6V3.4M2.4 7c0 .9 2 1.6 4.6 1.6s4.6-.7 4.6-1.6',
  },
  line: { d: 'M2 10.5l3-3 2.5 2L12 4' },
  area: { d: 'M2 11.5V8.5l3-2.5 2.5 2L12 4.5v7z' },
  heat: {
    d: 'M2.5 2.5h2v2h-2zM6 2.5h2v2H6zM9.5 2.5h2v2h-2zM2.5 6h2v2h-2zM6 6h2v2H6zM9.5 6h2v2h-2zM2.5 9.5h2v2h-2zM6 9.5h2v2H6z',
  },
} as const satisfies Record<string, SlashIcon>

const PAGE_ICON: SlashIcon = ICON.page
/** The board's `tpl` mark — a template row's, and the fallback for a row with no mark of its own. */
export const TPL_ICON: SlashIcon = ICON.tpl

/** The board's split: the first occurrence of `q` in `label`, or the whole label as `pre`. */
export function splitMatch(label: string, q: string): { pre: string; hit: string; post: string } {
  const at = q ? label.toLowerCase().indexOf(q) : -1
  if (at === -1) return { pre: label, hit: '', post: '' }
  return {
    pre: label.slice(0, at),
    hit: label.slice(at, at + q.length),
    post: label.slice(at + q.length),
  }
}

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

/**
 * The DC's `mob` caps: the open list shows its first 12 entries, group heads
 * counted; the templates pane shows 8 premade shapes. A query is never capped.
 */
export const MOBILE_ROW_CAP = 12
export const MOBILE_PREMADE_CAP = 8

/** The `rows` pane: grouped at rest, a flat match list under a query, a note when nothing matches. */
export function rowEntries(
  rows: readonly SlashRow[],
  query: string,
  cap: number = Infinity
): SlashEntry[] {
  const q = normalizeQuery(query)
  if (!q) {
    const out: SlashEntry[] = []
    let group: string | undefined
    for (const row of rows) {
      if (row.group && row.group !== group) {
        group = row.group
        out.push({ kind: 'group', label: group })
      }
      out.push({
        kind: 'row',
        id: row.id,
        label: row.label,
        ...splitMatch(row.label, ''),
        hint: row.key,
        icon: row.icon,
        row,
      })
    }
    return out.slice(0, cap)
  }
  // Rows matched on their label lead (the board's `table` ahead of `entry log ·
  // dated table`); rows matched only through their alias follow.
  const byLabel: SlashEntry[] = []
  const byAlias: SlashEntry[] = []
  for (const row of rows) {
    const onLabel = row.label.toLowerCase().includes(q)
    const onAlias = !onLabel && row.alias?.toLowerCase().includes(q)
    if (!onLabel && !onAlias) continue
    ;(onLabel ? byLabel : byAlias).push({
      kind: 'row',
      id: row.id,
      label: row.label,
      ...splitMatch(row.label, onLabel ? q : ''),
      hint: onAlias ? row.alias : row.key,
      icon: row.icon,
      row,
    })
  }
  const out = [...byLabel, ...byAlias]
  return out.length
    ? out
    : [
        {
          kind: 'note',
          text: `nothing called “${q}”. esc to keep it as text, or ask pond in the composer.`,
        },
      ]
}

/** The `templates` pane: the twelve premade shapes (#261), then the person's own. */
export function templateEntries(
  yours: readonly YourTemplate[] = [],
  premadeCap: number = TEMPLATE_KINDS.length
): SlashEntry[] {
  const out: SlashEntry[] = [{ kind: 'group', label: 'premade' }]
  for (const kind of TEMPLATE_KINDS.slice(0, premadeCap)) {
    out.push({
      kind: 'row',
      id: `premade:${kind}`,
      label: kind,
      ...splitMatch(kind, ''),
      // The blank `page` carries the page mark; every shaped template the `tpl` mark.
      icon: kind === 'page' ? PAGE_ICON : TPL_ICON,
      template: { origin: 'premade', kind },
    })
  }
  if (yours.length) {
    out.push({ kind: 'group', label: 'yours' })
    for (const t of yours) {
      out.push({
        kind: 'row',
        id: `yours:${t.id}`,
        label: t.name,
        ...splitMatch(t.name, ''),
        hint: t.hint,
        icon: TPL_ICON,
        template: { origin: 'yours', id: t.id },
      })
    }
  }
  return out
}

/** The foot legend per pane and query — the board's own words. */
export function footItems(
  pane: SlashPane,
  query: string,
  matches: number,
  preview: boolean
): string[] {
  if (pane === 'templates')
    return preview ? ['↵ new nested page', '→ preview'] : ['↵ new nested page']
  const q = normalizeQuery(query)
  if (!q) return ['↑↓ move', '↵ insert', 'esc keep as text']
  if (matches === 0) return []
  return [`/ ${q} — ${matches} ${matches === 1 ? 'match' : 'matches'}`]
}
