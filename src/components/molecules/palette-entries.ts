/**
 * What the ⌘K palette lists for a query — pure, so `PondCommand.tsx` only
 * draws (#279, child b of #226). The states are `PondPicker.dc.html`'s
 * `kind="palette"` frames and `Pond 02` 2g's captions:
 *
 *   opened   nothing typed: the last pages under `recent`, then the host's
 *            `suggested` actions — 2g: "two actions Pond expects from the time
 *            and the page you are on". That inference does not exist yet (#285),
 *            so the shell passes none and the group draws nothing: offered when
 *            true, never faked (`PROJECT_RULES.md`; the #239 precedent).
 *   typing   `pages`, then `records`, then `mode` (zen, `Pond 06.17` 6q frame 1),
 *            then `actions` (the matched ones, then `ask pond about “q”` unless the
 *            host cannot ask); `ponds` lead when one matches (6m), and
 *            `new pond “q”` joins the actions.
 *   actions  a leading `>` drops pages and records.
 *   empty    no dead end: a note, ask pond, make the page, then `did you mean`.
 *   scoped   a page and its children, with the kind under each name.
 *
 * The split and the query normaliser are #278's `splitMatch` / `normalizeQuery`
 * — one owner, not a second copy.
 */

import type { ZenAction } from '@/lib/layout/use-zen-commands'
import { normalizeQuery, splitMatch } from './slash-entries'

export type PaletteKind = 'page' | 'database' | 'record' | 'action' | 'pond'

/**
 * What the host does when an `action` row is picked. The shell's standing row
 * (`new page`) and the one the palette mints from the query (`new page “q”`) are
 * two rows — both can list at once — doing one job, so they share this one field
 * and the host reads it, never two ids.
 *
 * `save-as-template` is a PAGE action, so it lists only when a page is open —
 * board `6i` frame 3: "Saving is a page action, so it lives in the command
 * palette, not the / menu."
 */
export type PaletteAction =
  | 'new-page'
  | 'new-pond'
  | 'ask-pond'
  | 'deep-research'
  | 'save-as-template'
  | 'import-a-page'
  | 'report-a-problem'
  | ZenAction

export interface PaletteItem {
  id: string
  /** A page's title verbatim; an action in Pond's words, lowercase. */
  label: string
  kind: PaletteKind
  /** An `action` row's job for the host. */
  action?: PaletteAction
  /** The line beside the name: a page's area, a record's database and matched field, `pond · switch`. */
  sub?: string
  /** A page's mark — a `public/icons` glyph. `resolveMark` owns which. */
  glyph?: string
  /** The mono key at the row's end — `⌘2`. */
  key?: string
  /** Lists under `recent` when the palette opens with nothing typed. */
  recent?: boolean
  /** Ancestor ids, so a scope keeps what sits under the scoped page. */
  path?: readonly string[]
  /** Set on the rows the palette mints from the query itself (`ask pond about “q”`). */
  query?: string
  /** An action that lists under its own group rather than `actions` — zen's `mode` (6q frame 1). */
  group?: 'mode'
}

export interface PaletteScope {
  id: string
  label: string
}

export type PaletteEntry =
  | { kind: 'group'; label: string }
  | { kind: 'note'; text: string }
  | { kind: 'row'; item: PaletteItem; pre: string; hit: string; post: string; sub?: string }

export interface PaletteOptions {
  scope?: PaletteScope | null
  /** For `pages in <pond>`, and where `new page “q”` files when no `parentTitle` is given. @default 'life' */
  pondName?: string
  /**
   * Where `new page “q”` files. The host names here the SAME page it hands the
   * New page dialog — one owner for the label and the destination, so the row
   * can never name a parent the dialog then ignores (the #239 shape).
   * @default pondName
   */
  parentTitle?: string
  /**
   * The `opened` state's second group — `Pond 02` 2g: "then two actions Pond
   * expects from the time and the page you are on". The host supplies them once
   * it can infer them (#285 owns that); until then it passes none and nothing
   * is drawn.
   */
  suggested?: readonly PaletteItem[]
  /**
   * Whether the palette mints `ask pond about “q”`. The row lands in the composer,
   * so a host whose composer is out of sight (zen) passes false rather than offer
   * a row that does nothing visible. @default true
   */
  ask?: boolean
}

/** The ids of the two rows the palette mints from the query — the host acts on them. */
export const ASK_POND_ID = 'palette:ask-pond'
export const NEW_PAGE_ID = 'palette:new-page'
export const NEW_POND_ID = 'palette:new-pond'

/** The board's foot legend — one for every state. */
export const PALETTE_FOOT: readonly string[] = ['↑↓ move', '↵ open', '> actions only', 'esc close']

/** The foot below `md` — the board's `mob` branch drops the two hints a touch screen has no key for. */
export const PALETTE_FOOT_MOBILE: readonly string[] = ['↵ open', '> actions only']

/** How many close spellings `did you mean` offers. */
const DID_YOU_MEAN_MAX = 3

const EXACT_SCORE = 100
const PREFIX_SCORE = 80
const WORD_START_SCORE = 60
const SUBSTRING_SCORE = 40
const SUBSEQUENCE_SCORE = 20
/** The full boost a visit at the newest position of `visits` adds; older positions scale down from it. */
const VISIT_BOOST = 15

/** Case- and mark-insensitive, so `cafe` matches `Café` (KAN-390). */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function isSubsequence(label: string, q: string): boolean {
  let i = 0
  for (const ch of label) {
    if (ch === q[i]) i++
    if (i === q.length) return true
  }
  return q.length === 0
}

function matchTier(foldedLabel: string, foldedQuery: string): number {
  if (!foldedQuery) return 0
  if (foldedLabel === foldedQuery) return EXACT_SCORE
  if (foldedLabel.startsWith(foldedQuery)) return PREFIX_SCORE
  const isWordStart = foldedLabel
    .split(/[^a-z0-9]+/)
    .some((word) => word && word !== foldedLabel && word.startsWith(foldedQuery))
  if (isWordStart) return WORD_START_SCORE
  if (foldedLabel.includes(foldedQuery)) return SUBSTRING_SCORE
  if (isSubsequence(foldedLabel, foldedQuery)) return SUBSEQUENCE_SCORE
  return 0
}

/**
 * `visits` is newest first (`readRecentPageIds`'s shape): a hit at index 0
 * gets the full boost, one at the last index barely more than none, scaled by
 * `visits.length` so the curve holds whether the list is 3 or 20 long.
 */
function visitBoost(id: string, visits: readonly string[]): number {
  if (!visits.length) return 0
  const index = visits.indexOf(id)
  return index === -1 ? 0 : VISIT_BOOST * (1 - index / visits.length)
}

/**
 * Ranks `items` for `q` — exact beats a prefix, a prefix beats a word
 * boundary, a contiguous substring beats a scattered subsequence; a label
 * that doesn't even scatter-match scores 0 and is dropped, so the caller
 * never has to filter twice. A visit boost and a depth tiebreak (shallower
 * pages first) break ties within a tier; a full tie keeps `items`' own order
 * (the `index` carried through `sort`, since engine stability isn't a given
 * across the scores Node and the browser might produce here).
 */
export function rankPages(
  items: readonly PaletteItem[],
  q: string,
  visits: readonly string[] = []
): PaletteItem[] {
  const foldedQuery = fold(q)
  return items
    .map((item, index) => ({ item, index, tier: matchTier(fold(item.label), foldedQuery) }))
    .filter(({ tier }) => tier > 0)
    .map(({ item, index, tier }) => ({
      item,
      index,
      score: tier + visitBoost(item.id, visits) - (item.path?.length ?? 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item)
}

export function paletteEntries(
  items: readonly PaletteItem[],
  query: string,
  {
    scope = null,
    pondName = 'life',
    parentTitle = pondName,
    suggested = [],
    ask: canAsk = true,
  }: PaletteOptions = {}
): PaletteEntry[] {
  const q = normalizeQuery(query)

  if (q.startsWith('>')) {
    const aq = q.slice(1).trim()
    const rows = items.filter((i) => i.kind === 'action' && i.label.toLowerCase().includes(aq))
    return rows.length
      ? rows.map((i) => row(i, aq))
      : [{ kind: 'note', text: `no action called “${aq}”` }]
  }

  // In scope: the page itself and what sits under it, the kind under each name.
  const pool = scope
    ? items.filter((i) => i.kind !== 'action' && (i.id === scope.id || i.path?.includes(scope.id)))
    : items
  // A kind is already Pond's word for it — `page`, `database`, `record`.
  const subOf = (i: PaletteItem) => (scope ? i.kind : i.sub)

  if (!q) {
    if (scope) return pool.map((i) => row(i, '', subOf(i)))
    const recent = items.filter((i) => i.recent)
    const pages = items.filter((i) => i.kind === 'page' || i.kind === 'database')
    const lead = recent.length
      ? [group('recent'), ...recent.map((i) => row(i, ''))]
      : pages.length
        ? [group('pages'), ...pages.map((i) => row(i, ''))]
        : []
    return suggested.length
      ? [...lead, group('suggested'), ...suggested.map((i) => row(i, ''))]
      : lead
  }

  const hits = (kinds: PaletteKind[], from: readonly PaletteItem[] = pool) =>
    from.filter((i) => kinds.includes(i.kind) && i.label.toLowerCase().includes(q))
  const ponds = hits(['pond'])
  const pages = hits(['page', 'database'])
  // A record is searched by the host (title or field value), so it is not
  // filtered on its label again here — a field match would never survive that.
  const records = pool.filter((i) => i.kind === 'record')
  const matched = hits(['action'], items)
  const modes = matched.filter((i) => i.group === 'mode')
  const actions = matched.filter((i) => i.group !== 'mode')
  const ask: PaletteEntry[] = canAsk
    ? [
        row(
          {
            id: ASK_POND_ID,
            label: `ask pond about “${q}”`,
            kind: 'action',
            action: 'ask-pond',
            query: q,
          },
          ''
        ),
      ]
    : []

  // A query that matches only an action is not empty: the `typing` frame lists it.
  if (!ponds.length && !pages.length && !records.length && !matched.length) {
    const make: PaletteItem = {
      id: NEW_PAGE_ID,
      label: `new page “${q}” under ${parentTitle}`,
      kind: 'action',
      action: 'new-page',
      query: q,
    }
    const near = didYouMean(pool, q)
    return [
      { kind: 'note', text: `no page or record called “${q}”` },
      ...ask,
      row(make, ''),
      ...(near.length ? [group('did you mean'), ...near.map((i) => row(i, '', subOf(i)))] : []),
    ]
  }

  const out: PaletteEntry[] = []
  if (ponds.length) out.push(group('ponds'), ...ponds.map((i) => row(i, q)))
  if (pages.length)
    out.push(
      group(ponds.length ? `pages in ${pondName}` : 'pages'),
      ...pages.map((i) => row(i, q, subOf(i)))
    )
  if (records.length) out.push(group('records'), ...records.map((i) => row(i, q, subOf(i))))
  if (modes.length) out.push(group('mode'), ...modes.map((i) => row(i, q)))
  // `ponds` state: `new pond “q”` stands where the person is looking at ponds.
  const newPond: PaletteItem = {
    id: NEW_POND_ID,
    label: `new pond “${q}”`,
    kind: 'action',
    action: 'new-pond',
    query: q,
  }
  const actionRows = [
    ...actions.map((i) => row(i, q)),
    ...(ponds.length ? [row(newPond, '')] : []),
    ...ask,
  ]
  if (actionRows.length) out.push(group('actions'), ...actionRows)
  return out
}

/** Pages and records whose name, or a word of it, is within two edits of the query. */
export function didYouMean(items: readonly PaletteItem[], q: string): PaletteItem[] {
  return items
    .filter((i) => i.kind !== 'action' && i.kind !== 'pond')
    .filter((i) => {
      const label = i.label.toLowerCase()
      return [label, ...label.split(/\s+/)].some((w) => editDistance(w, q) <= 2)
    })
    .slice(0, DID_YOU_MEAN_MAX)
}

function group(label: string): PaletteEntry {
  return { kind: 'group', label }
}

function row(item: PaletteItem, q: string, sub = item.sub): PaletteEntry {
  return { kind: 'row', item, ...splitMatch(item.label, q), sub }
}

/** Levenshtein, small strings only — the palette compares a word to a query. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}
