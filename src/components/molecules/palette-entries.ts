/**
 * What the ⌘K palette lists for a query — pure, so `CommandPalette.tsx` only
 * draws (#279, child b of #226). The states are `PondPicker.dc.html`'s
 * `kind="palette"` frames and `Pond 02` 2g's captions:
 *
 *   opened   nothing typed: the last pages under `recent`, then the host's
 *            `suggested` actions — 2g: "two actions Pond expects from the time
 *            and the page you are on". That inference does not exist yet (#285),
 *            so the shell passes none and the group draws nothing: offered when
 *            true, never faked (`PROJECT_RULES.md`; the #239 precedent).
 *   typing   `pages`, then `records`, then `actions` (the matched ones, then
 *            `ask pond about “q”`); `ponds` lead when one matches (6m).
 *   actions  a leading `>` drops pages and records.
 *   empty    no dead end: a note, ask pond, make the page, then `did you mean`.
 *   scoped   a page and its children, with the kind under each name.
 *
 * The split and the query normaliser are #278's `splitMatch` / `normalizeQuery`
 * — one owner, not a second copy.
 */

import { normalizeQuery, splitMatch } from './slash-entries'

export type PaletteKind = 'page' | 'database' | 'record' | 'action' | 'pond'

/**
 * What the host does when an `action` row is picked. The shell's standing row
 * (`new page`) and the one the palette mints from the query (`new page “q”`) are
 * two rows — both can list at once — doing one job, so they share this one field
 * and the host reads it, never two ids.
 */
export type PaletteAction = 'new-page' | 'ask-pond'

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
}

/** The ids of the two rows the palette mints from the query — the host acts on them. */
export const ASK_POND_ID = 'palette:ask-pond'
export const NEW_PAGE_ID = 'palette:new-page'

/** The board's foot legend — one for every state. */
export const PALETTE_FOOT = ['↑↓ move', '↵ open', '> actions only', 'esc close'] as const

/** How many close spellings `did you mean` offers. */
const DID_YOU_MEAN_MAX = 3

export function paletteEntries(
  items: readonly PaletteItem[],
  query: string,
  { scope = null, pondName = 'life', parentTitle = pondName, suggested = [] }: PaletteOptions = {}
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
  const records = hits(['record'])
  const actions = hits(['action'], items)
  const ask: PaletteItem = {
    id: ASK_POND_ID,
    label: `ask pond about “${q}”`,
    kind: 'action',
    action: 'ask-pond',
    query: q,
  }

  // A query that matches only an action is not empty: the `typing` frame lists it.
  if (!ponds.length && !pages.length && !records.length && !actions.length) {
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
      row(ask, ''),
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
  out.push(group('actions'), ...actions.map((i) => row(i, q)), row(ask, ''))
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
