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

import { isTemplateKind, TEMPLATE_KINDS, type TemplateKind } from '@/lib/templates/types'
import { BOX_HEIGHT, LIST_MAX_VH, SLASH_SIZES, type PickerSize } from './picker-chrome'

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
  /** The board's shortcut hint at rest — `#`, `"`, `-`, `[]`, `proposes`. */
  key?: string
  icon?: SlashIcon
  /** Omitted rows list ungrouped. */
  group?: SlashGroup
  /** The registered module type this row mints — read by the derived registry guard. */
  type?: string
  /** The row opens a pane rather than inserting. */
  submenu?: 'templates'
  /** The row makes a page rather than a block: beside the current page, or under it. */
  placement?: 'sibling' | 'child'
  /** The row picks a template rather than inserting a block (the blank-page list's leading rows). */
  template?: TemplatePick
  /** The row mints the unmatched query itself, as text or a heading (KAN-84), rather than picking a registered row. */
  freeText?: { as: FreeTextAs; word: string }
}

/** The two shapes an unmatched `/word` can land as (KAN-84). */
export type FreeTextAs = 'text' | 'heading'

export type TemplatePick =
  { origin: 'premade'; kind: TemplateKind } | { origin: 'yours'; id: string }

export interface YourTemplate {
  id: string
  name: string
  hint?: string
}

export type SlashEntry =
  | { kind: 'group'; label: string }
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
 * `board`, `calendar` and `timeline` are not on the board, which draws no row for
 * those kinds (ADR 0009 gives each its own); they follow its grid and stroke.
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
  board: { d: 'M2.2 2.5h2.6v9H2.2zM5.7 2.5h2.6v6.2H5.7zM9.2 2.5h2.6v4H9.2z' },
  calendar: {
    d: 'M3.7 3h6.6a1.2 1.2 0 0 1 1.2 1.2v6.6a1.2 1.2 0 0 1-1.2 1.2H3.7a1.2 1.2 0 0 1-1.2-1.2V4.2A1.2 1.2 0 0 1 3.7 3zM2.5 6.2h9M5.2 1.8v2.4M8.8 1.8v2.4',
  },
  timeline: { d: 'M2.5 3.5h5M5 7h6.5M3.8 10.5h4.4' },
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

/** One stretch of a `matchRuns` split: a matched run underlines, the rest doesn't. */
export interface MatchRun {
  text: string
  hit: boolean
}

/** NFD combining marks, stripped by `fold` so `cafe` matches `Café` (KAN-390). */
const COMBINING_MARKS = /[\u0300-\u036f]/g

/**
 * `label` folded one code point at a time (NFD, combining marks stripped,
 * lowercased) rather than as one string, so a matched range in `text` can
 * grow back to the exact original character it came from — `map[i]` names
 * `source[map[i]]` as `text[i]`'s origin — and an accent a fold would
 * otherwise consume (e.g. `é`'s own combining mark) still underlines with
 * its base letter instead of being left off the run.
 */
interface FoldedLabel {
  text: string
  map: readonly number[]
  source: readonly string[]
}

function foldLabel(label: string): FoldedLabel {
  const source = Array.from(label)
  const text: string[] = []
  const map: number[] = []
  source.forEach((ch, i) => {
    const folded = ch.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
    for (let u = 0; u < folded.length; u++) {
      text.push(folded[u])
      map.push(i)
    }
  })
  return { text: text.join(''), map, source }
}

/**
 * Case- and mark-insensitive fold, shared with `palette-entries.ts`'s
 * `matchTier` (KAN-390) — one owner, so a scoring tier and a highlighted run
 * never disagree about what counts as a match.
 */
export function fold(s: string): string {
  return foldLabel(s).text
}

/**
 * The tightest subsequence window `q` fits in `text`: for every position
 * where `q`'s first character matches, a greedy forward scan finds the
 * earliest end for the rest of `q`; the scan whose window ends up shortest
 * wins. Returns the matched indices for that window, in order — shared by
 * `matchTier`'s span (`palette-entries.ts`, KAN-390) and `matchRuns`'
 * highlight below, so a score and its underline can never disagree about
 * which window matched. Anchoring on the first occurrence of `q[0]` alone
 * (rather than trying every one) is the bug this guards: "pond projects"
 * scored for `prj` would anchor on `pond`'s own `p` and span the whole
 * label, instead of `projects`' tighter p-r-j. `null` when `q` is not a
 * subsequence of `text` at all.
 */
export function subsequenceMatch(text: string, q: string): readonly number[] | null {
  if (!q) return []
  let best: number[] | null = null
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== q[0]) continue
    const positions = [start]
    let pos = start + 1
    let ok = true
    for (let qi = 1; qi < q.length; qi++) {
      const idx = text.indexOf(q[qi], pos)
      if (idx === -1) {
        ok = false
        break
      }
      positions.push(idx)
      pos = idx + 1
    }
    if (!ok) continue
    if (!best || positions[positions.length - 1] - positions[0] < best[best.length - 1] - best[0]) {
      best = positions
    }
  }
  return best
}

/**
 * The palette's highlight (KAN-390): a contiguous hit (exact / prefix / word-
 * start / substring tier) still splits `pre` / `hit` / `post` like
 * `splitMatch` — one run each side, at most one underlined. A subsequence
 * (fuzzy) hit has no contiguous span to split, so this scatters the query's
 * characters across the folded label using `subsequenceMatch`'s tightest
 * window (the SAME scan that scored the tier, not a second one), maps each
 * matched folded position back to its original character via `foldLabel`'s
 * `map`, and merges adjacent matched characters into runs, so `nwp` against
 * "new page" underlines `n`, `w`, `p` as three separate runs rather than one.
 */
export function matchRuns(label: string, q: string): MatchRun[] {
  if (!q) return [{ text: label, hit: false }]
  const { text: foldedLabel, map, source } = foldLabel(label)
  const foldedQuery = fold(q)
  const at = foldedLabel.indexOf(foldedQuery)
  const hitAt = new Set<number>()
  if (at !== -1) {
    for (let i = at; i < at + foldedQuery.length; i++) hitAt.add(i)
  } else {
    subsequenceMatch(foldedLabel, foldedQuery)?.forEach((i) => hitAt.add(i))
  }
  const sourceHit = new Array<boolean>(source.length).fill(false)
  hitAt.forEach((i) => {
    sourceHit[map[i]] = true
  })
  const runs: MatchRun[] = []
  let run = ''
  let runHit = false
  source.forEach((ch, i) => {
    const hit = sourceHit[i]
    if (run && hit === runHit) {
      run += ch
      return
    }
    if (run) runs.push({ text: run, hit: runHit })
    run = ch
    runHit = hit
  })
  if (run) runs.push({ text: run, hit: runHit })
  return runs
}

/**
 * The DC's `mob` caps: the open list shows its first 12 entries, group heads
 * counted; the templates pane shows 8 premade shapes. A query is never capped.
 */
export const MOBILE_ROW_CAP = 12
export const MOBILE_PREMADE_CAP = 8
/** The blank list's own mobile cap (KAN-276): four leading template rows, capped
 * independently of `MOBILE_ROW_CAP` so the ordinary rows below — text included —
 * always survive the scroll. */
export const MOBILE_TEMPLATE_CAP = 4

/**
 * How tall the open list can get at `size`, for choosing which way the glass grows
 * before it renders: the entries it would list, stopped at the list's own cap,
 * plus the foot and the glass's padding. `leadWithTemplates` sizes off the blank
 * list's own caps (KAN-276), not the ordinary list's.
 */
export function slashMenuHeight(
  rows: readonly SlashRow[],
  size: PickerSize,
  viewportHeight: number,
  leadWithTemplates = false,
  yours: readonly YourTemplate[] = [],
  siblingRanking: readonly string[] = [],
  justSavedId: string | null = null,
  parentTitle: string | null = null
): number {
  const cap = size === 'mobile' ? MOBILE_ROW_CAP : undefined
  const entries = leadWithTemplates
    ? blankRowEntries(rows, yours, '', cap, siblingRanking, justSavedId, parentTitle)
    : rowEntries(rows, '', cap)
  const list = entries.reduce(
    (height, e) => height + (e.kind === 'group' ? BOX_HEIGHT.group : SLASH_SIZES[size].rowHeight),
    0
  )
  return Math.min(list, viewportHeight * LIST_MAX_VH) + BOX_HEIGHT.foot + BOX_HEIGHT.glass
}

/** The `rows` pane: grouped at rest, a flat match list under a query, two free-text rows (KAN-84) when nothing registered matches. */
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
        template: row.template,
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
      template: row.template,
    })
  }
  const out = [...byLabel, ...byAlias]
  if (out.length) return out
  // 7f/6i: an unknown word after `/` offers to insert it as text or a heading,
  // drawn as two ordinary `slash` rows rather than the DC's `empty` note.
  // `word` keeps the query's own casing (trimmed only, never lowercased via
  // `q`) so `/Wine` lands `Wine`, not `wine` — only the match above runs on `q`.
  return FREE_TEXT_AS.map((as) => freeTextEntry(as, query.trim()))
}

const FREE_TEXT_AS: readonly FreeTextAs[] = ['text', 'heading']
const FREE_TEXT_ICON: Record<FreeTextAs, SlashIcon> = { text: ICON.text, heading: ICON.heading }

function freeTextEntry(as: FreeTextAs, word: string): SlashEntry {
  const label = `${as} — “${word}”`
  return {
    kind: 'row',
    id: `freetext:${as}`,
    label,
    pre: label,
    hit: '',
    post: '',
    ...(as === 'text' ? { hint: `no block named ${word}` } : {}),
    icon: FREE_TEXT_ICON[as],
    row: { id: `freetext:${as}`, label: as, freeText: { as, word } },
  }
}

/**
 * The `templates` group for the blank-page list (KAN-276): the person's own
 * shapes first (6f frame 2: `recipe`, `weeknight recipe` lead the board's
 * list), then the twelve premade ones, flattened to rows `rowEntries` can
 * thread alongside the ordinary block rows — one `group: 'templates'` for
 * the lot.
 */
export function templateRows(yours: readonly YourTemplate[]): SlashRow[] {
  const out: SlashRow[] = []
  for (const t of yours) {
    out.push({
      id: `yours:${t.id}`,
      label: t.name,
      group: 'templates',
      // `key` is the row's hint at rest — names where this one came from.
      key: 'yours',
      icon: TPL_ICON,
      template: { origin: 'yours', id: t.id },
    })
  }
  for (const kind of TEMPLATE_KINDS) {
    out.push({
      id: `premade:${kind}`,
      label: kind,
      group: 'templates',
      // The blank `page` carries the page mark; every shaped template the `tpl` mark.
      icon: kind === 'page' ? PAGE_ICON : TPL_ICON,
      template: { origin: 'premade', kind },
    })
  }
  return out
}

/**
 * The blank-page list's `templates` group, ranked (KAN-138): (1) the template
 * just saved this session and not yet applied, (2) `siblingRanking`'s ids in
 * that order (a premade id already reads `premade:{kind}`, matching the stamp
 * `applyTemplateInPlace` writes — see `src/lib/templates/apply.ts`), (3) your
 * remaining templates, (4) the remaining premade twelve in canonical order.
 * Deduped across tiers; a `siblingRanking` id with no matching row (its
 * template was deleted) is skipped, never thrown.
 */
export function rankTemplateRows(
  yours: readonly YourTemplate[],
  siblingRanking: readonly string[] = [],
  justSavedId: string | null = null,
  parentTitle: string | null = null
): SlashRow[] {
  const yoursById = new Map(yours.map((t) => [t.id, t]))
  const used = new Set<string>()
  const out: SlashRow[] = []
  const usedHint = parentTitle ? `used in ${parentTitle}` : 'used'

  const pushYours = (t: YourTemplate, hint: string): void => {
    out.push({
      id: `yours:${t.id}`,
      label: t.name,
      group: 'templates',
      key: hint,
      icon: TPL_ICON,
      template: { origin: 'yours', id: t.id },
    })
    used.add(t.id)
  }
  const pushPremade = (kind: TemplateKind, hint?: string): void => {
    out.push({
      id: `premade:${kind}`,
      label: kind,
      group: 'templates',
      ...(hint ? { key: hint } : {}),
      icon: kind === 'page' ? PAGE_ICON : TPL_ICON,
      template: { origin: 'premade', kind },
    })
    used.add(`premade:${kind}`)
  }

  if (justSavedId) {
    const t = yoursById.get(justSavedId)
    if (t) pushYours(t, 'yours · just saved')
  }

  for (const id of siblingRanking) {
    if (used.has(id)) continue
    const kind = id.startsWith('premade:') ? id.slice('premade:'.length) : null
    if (kind !== null) {
      if (isTemplateKind(kind)) pushPremade(kind, usedHint)
      continue
    }
    const t = yoursById.get(id)
    if (t) pushYours(t, `yours · ${usedHint}`)
  }

  for (const t of yours) {
    if (!used.has(t.id)) pushYours(t, 'yours')
  }

  for (const kind of TEMPLATE_KINDS) {
    if (!used.has(`premade:${kind}`)) pushPremade(kind)
  }

  return out
}

/** The blank-page list's scroll cue (6f frame 2) — replaces the `text` group's own label when the query is empty. */
export const BLANK_TEXT_GROUP = 'text — scroll for blocks, templates, pages'

/**
 * The blank-page list (KAN-276): `templates` first, ranked (KAN-138:
 * `rankTemplateRows`), then the ordinary rows as they are today. At rest the
 * leading `text` group is relabeled with the scroll cue so the templates
 * above don't read as the whole list.
 */
export function blankRowEntries(
  rows: readonly SlashRow[],
  yours: readonly YourTemplate[],
  query: string,
  cap: number = Infinity,
  siblingRanking: readonly string[] = [],
  justSavedId: string | null = null,
  parentTitle: string | null = null
): SlashEntry[] {
  const ranked = rankTemplateRows(yours, siblingRanking, justSavedId, parentTitle)
  if (normalizeQuery(query)) return rowEntries([...ranked, ...rows], query, cap)
  // A query is never capped (`rowEntries` ignores `cap` once filtered), but at
  // rest the two groups are capped on their own: the templates group to its own
  // small mobile cap, the ordinary rows to `cap` — never the combined list, or
  // the templates alone could eat every row and leave nothing for `text`.
  const templates = Number.isFinite(cap) ? ranked.slice(0, MOBILE_TEMPLATE_CAP) : ranked
  const templateHead = rowEntries(templates, '')
  const ordinary = rowEntries(rows, '', cap)
  const firstText = ordinary.findIndex((e) => e.kind === 'group' && e.label === 'text')
  const relabeled =
    firstText === -1
      ? ordinary
      : ordinary.map((e, i) =>
          i === firstText ? { kind: 'group' as const, label: BLANK_TEXT_GROUP } : e
        )
  return [...templateHead, ...relabeled]
}

/**
 * The `templates` pane: the twelve premade shapes (#261), then the person's own —
 * built from `templateRows`'s same id/icon/pick rules so the two panes never
 * drift apart; only the order (premade first here) and the `yours` hint differ.
 */
export function templateEntries(
  yours: readonly YourTemplate[] = [],
  premadeCap: number = TEMPLATE_KINDS.length
): SlashEntry[] {
  const rows = templateRows(yours)
  const toEntry = (row: SlashRow, hint?: string): SlashEntry => ({
    kind: 'row',
    id: row.id,
    label: row.label,
    ...splitMatch(row.label, ''),
    hint,
    icon: row.icon,
    template: row.template,
  })
  const premade = rows
    .filter((r) => r.template?.origin === 'premade')
    .slice(0, premadeCap)
    .map((r) => toEntry(r))
  const yoursRows = rows.filter((r) => r.template?.origin === 'yours')
  const out: SlashEntry[] = [{ kind: 'group', label: 'premade' }, ...premade]
  if (yoursRows.length) {
    out.push(
      { kind: 'group', label: 'yours' },
      ...yoursRows.map((r, i) => toEntry(r, yours[i]?.hint))
    )
  }
  return out
}

/**
 * The foot legend per pane and query — the board's own words. The blank list's
 * rest-state foot (KAN-276, `leadWithTemplates`) draws no `esc keep as text` —
 * 6f frame 2's empty-page foot is `↑↓ move · ↵ <verb>` only, with no `→ preview`
 * while `onPreviewTemplate` is unwired at that call site — except when the
 * active row is itself a template pick (KAN-124), whose foot is the board's
 * `↑↓ move · → preview · ↵ apply`. While a template is actually previewing
 * (KAN-131), the board drops `↑↓ move` entirely: `↵ apply · esc back` only,
 * ahead of every other branch. When the active row is one of the two free-text
 * rows (KAN-84), the foot names what ↵ inserts — `↵ insert as text` /
 * `↵ insert as heading` — ahead of the ordinary match-count branches, which
 * never fire for this case since the two free-text rows count as matches.
 */
export function footItems(
  pane: SlashPane,
  query: string,
  matches: number,
  preview: boolean,
  activeIsTemplate = false,
  leadWithTemplates = false,
  previewing = false,
  activeFreeText?: FreeTextAs
): string[] {
  if (previewing) return ['↵ apply', 'esc back']
  if (pane === 'templates')
    return preview ? ['↵ new nested page', '→ preview'] : ['↵ new nested page']
  const q = normalizeQuery(query)
  if (!q) {
    if (leadWithTemplates && activeIsTemplate) return ['↑↓ move', '→ preview', '↵ apply']
    const verb = activeIsTemplate ? '↵ new nested page' : '↵ insert'
    return leadWithTemplates ? ['↑↓ move', verb] : ['↑↓ move', verb, 'esc keep as text']
  }
  if (activeFreeText) return [`↵ insert as ${activeFreeText}`]
  if (matches === 0) return []
  return [`/ ${q} — ${matches} ${matches === 1 ? 'match' : 'matches'}`]
}
