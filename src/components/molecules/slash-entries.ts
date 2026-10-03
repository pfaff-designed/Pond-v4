/**
 * What the `/` menu lists for a given query and pane — pure, so the surface in
 * `SlashMenu.tsx` only draws (#278).
 *
 * `PondPicker.dc.html`'s `filtered` state splits each matched label `pre` / `hit` /
 * `post` and underlines the hit — a three-part split, never a background wash —
 * and drops the group labels while a query is live. A row whose label does not
 * match but whose short description does still lists, with that description as
 * its hint and nothing underlined (the board's `entry log · dated table`).
 */

import { TEMPLATE_KINDS, type TemplateKind } from '@/lib/templates/types'

export interface SlashIcon {
  /** A path on the board's 14 × 14 grid, stroked at 1.4 — or filled when `filled`. */
  d: string
  filled?: boolean
}

/** The board's group labels for the slash kind (`PondPicker.dc.html`'s `G(…)` calls). */
export type SlashGroup = 'text' | 'blocks' | 'templates'

export interface SlashRow {
  id: string
  /** Pond's word for what this row inserts — lowercase, from the glossary or the board. */
  label: string
  /** Short, lowercase; matched against the query and shown as the hint when it matched. */
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
      icon?: SlashIcon
      row?: SlashRow
      template?: TemplatePick
    }

export type SlashPane = 'rows' | 'templates'

const PAGE_ICON: SlashIcon = { d: 'M3.5 2h5l2.5 2.5V12h-7.5zM8.5 2v2.5H11' }
/** The board's `tpl` mark — a template row's, and the fallback for a row with no mark of its own. */
export const TPL_ICON: SlashIcon = { d: 'M2 2h10v3H2zM2 6.5h10v2H2zM2 10h6v2H2z' }

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

/** The `rows` pane: grouped at rest, a flat match list under a query, a note when nothing matches. */
export function rowEntries(rows: readonly SlashRow[], query: string): SlashEntry[] {
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
    return out
  }
  // Rows matched on their label lead (the board's `table` ahead of `entry log ·
  // dated table`); rows matched only through their description follow.
  const byLabel: SlashEntry[] = []
  const byDescription: SlashEntry[] = []
  for (const row of rows) {
    const onLabel = row.label.toLowerCase().includes(q)
    const onDescription = !onLabel && row.description?.toLowerCase().includes(q)
    if (!onLabel && !onDescription) continue
    ;(onLabel ? byLabel : byDescription).push({
      kind: 'row',
      id: row.id,
      label: row.label,
      ...splitMatch(row.label, onLabel ? q : ''),
      hint: onDescription ? row.description : row.key,
      icon: row.icon,
      row,
    })
  }
  const out = [...byLabel, ...byDescription]
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
export function templateEntries(yours: readonly YourTemplate[] = []): SlashEntry[] {
  const out: SlashEntry[] = [{ kind: 'group', label: 'premade' }]
  for (const kind of TEMPLATE_KINDS) {
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
