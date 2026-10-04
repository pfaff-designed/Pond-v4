/**
 * The AI `link_records` accept path (#40, #20 second-half slice C) — framework-
 * agnostic domain logic for linking EXISTING rows.
 *
 * A `link_records` tool call is client-resolved (no execute), exactly like
 * add_row: the model proposes linking a source row to target row(s) through a
 * relation property — naming everything by TITLE/NAME, never by id — the user
 * reviews it on a proposal card, and ONLY on accept do we resolve titles→ids and
 * write. Forward-only and ADD-ONLY: links are appended through the pure
 * {@link addLink} (dedupes; a `single` relation replaces) — no unlink, no general
 * row update.
 *
 * Resolution is STRICT, unlike add_row's lenient drop (#18 decision 9): linking
 * names specific existing rows, so an unresolvable or duplicate ("ambiguous")
 * title THROWS with a clear message the card surfaces — a dangling id must NEVER
 * be written, and silently guessing between two same-titled rows would link the
 * wrong record.
 *
 * No Next.js imports — takes a SupabaseClient, exercised directly in jest.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getPage, getCollectionRows, listPages, setProperty } from '@/lib/pages/client'
import { addLink } from '@/lib/modules/view/relation-value-ops'
import { readSchema, coerceValue, ROW_TYPE } from '@/lib/properties/schema'

/** A linkable page reduced to what resolution needs — id + title. */
export interface RowCandidate {
  id: string
  title: string
}

/** The outcome of resolving one proposed row reference (a title, or already an id). */
export type TitleResolution =
  | { kind: 'resolved'; id: string }
  | { kind: 'ambiguous'; title: string; candidates: RowCandidate[] }
  | { kind: 'not-found'; title: string }

/**
 * Resolve one proposed row reference against a candidate list. An exact id match
 * wins first (idempotent — the model may echo an id it read from context); then a
 * trimmed, case-insensitive TITLE match: exactly one → resolved; several →
 * ambiguous (with the tied candidates, so a message can name them); none →
 * not-found. Pure — the accept paths fetch the candidates.
 */
export function resolveRowRef(candidates: RowCandidate[], ref: string): TitleResolution {
  const trimmed = ref.trim()
  if (!trimmed) return { kind: 'not-found', title: trimmed }
  if (candidates.some((c) => c.id === trimmed)) return { kind: 'resolved', id: trimmed }
  const key = trimmed.toLowerCase()
  const matches = candidates.filter((c) => c.title.trim().toLowerCase() === key)
  if (matches.length === 1) return { kind: 'resolved', id: matches[0].id }
  if (matches.length > 1) return { kind: 'ambiguous', title: trimmed, candidates: matches }
  return { kind: 'not-found', title: trimmed }
}

/**
 * The pages a relation's proposed target titles resolve against (#20 semantics,
 * shared with useRelationTitles): a TARGETED relation links rows of its target
 * collection; an untargeted one ("link any page") links any non-row page in the
 * pond (#312 — never another pond's, which you cannot even open from here).
 */
export async function relationCandidates(
  supabase: SupabaseClient<Database>,
  userId: string,
  target: string | undefined,
  pondId?: string | null
): Promise<RowCandidate[]> {
  if (target) {
    const rows = await getCollectionRows(supabase, userId, target)
    return rows.map((r) => ({ id: r.id, title: r.title }))
  }
  const pages = await listPages(supabase, userId, pondId)
  return pages.filter((p) => p.type !== ROW_TYPE).map((p) => ({ id: p.id, title: p.title }))
}

/** A link_records proposal after the user has (optionally) corrected its source
 *  collection (the card's picker resolves/overrides the proposed NAME to an id). */
export interface LinkRecordsProposal {
  /** The source row's collection (a page carrying a `_schema`), as an id. */
  collectionId: string
  /** The source row, by TITLE (or id) — resolved within `collectionId`'s rows. */
  fromRow: string
  /** The relation property on the source collection, by NAME. */
  relation: string
  /** The target row(s), by TITLE (or id) — resolved within the relation's target. */
  toRows: string[]
}

export interface LinkedRecords {
  /** The source row whose relation value was written. */
  sourceRowId: string
  /** The relation property the links were appended to. */
  propertyId: string
  /** The relation's target collection — undefined for an untargeted relation. */
  targetCollectionId?: string
  /** The full relation value after the links were applied. */
  value: string[]
}

/** Format an unresolvable/ambiguous reference as the clear card-facing error. */
function refError(res: Exclude<TitleResolution, { kind: 'resolved' }>, where: string): Error {
  if (res.kind === 'ambiguous') {
    return new Error(
      `Multiple rows titled "${res.title}" in ${where} — rename one, or link it manually from the row`
    )
  }
  return new Error(`No row titled "${res.title}" in ${where}`)
}

/**
 * Write an accepted link_records proposal. Confirms the source collection exists
 * AND is a collection, resolves the source row + relation property + every target
 * title (STRICT — any failure throws before anything is written, so the card can
 * surface the message and revert), then appends the resolved ids onto the source
 * row's current relation value via {@link addLink} (dedupes; `single` replaces)
 * and persists through the merge-safe {@link setProperty}.
 */
export async function linkRecordsFromProposal(
  supabase: SupabaseClient<Database>,
  proposal: LinkRecordsProposal,
  /** #312: the pond an UNTARGETED relation's candidates come from. */
  pondId?: string | null
): Promise<LinkedRecords> {
  const collection = await getPage(supabase, proposal.collectionId)
  if (!collection) {
    throw new Error(`Cannot link records: collection ${proposal.collectionId} was not found`)
  }
  const schema = readSchema(collection.props)
  if (!schema) {
    throw new Error(
      `Cannot link records: page ${proposal.collectionId} is not a collection (it has no schema)`
    )
  }

  // The relation property, by NAME (case-insensitive; first def wins — the same
  // convention as resolveRowValues/resolveViewConfig).
  const relKey = proposal.relation.trim().toLowerCase()
  const def = schema.find((d) => d.type === 'relation' && d.name.trim().toLowerCase() === relKey)
  if (!def) {
    throw new Error(
      `Cannot link records: "${collection.title}" has no relation property named "${proposal.relation}"`
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // The source row, resolved among the collection's own rows.
  const sourceRows = await getCollectionRows(supabase, user.id, proposal.collectionId)
  const sourceCandidates = sourceRows.map((r) => ({ id: r.id, title: r.title }))
  const source = resolveRowRef(sourceCandidates, proposal.fromRow)
  if (source.kind !== 'resolved') throw refError(source, `"${collection.title}"`)
  const sourceRow = sourceRows.find((r) => r.id === source.id)
  if (!sourceRow)
    throw refError({ kind: 'not-found', title: proposal.fromRow }, `"${collection.title}"`)

  // The targets, resolved within the relation's target collection (or the pond's
  // non-row pages for an untargeted relation). ALL must resolve
  // before ANY write — never a dangling id, never a partial link batch.
  const targetCandidates = await relationCandidates(supabase, user.id, def.target, pondId)
  const where =
    def.target === proposal.collectionId ? `"${collection.title}"` : 'the target collection'
  const targetIds: string[] = []
  for (const ref of proposal.toRows) {
    const res = resolveRowRef(targetCandidates, ref)
    if (res.kind !== 'resolved') throw refError(res, def.target ? where : 'this pond')
    targetIds.push(res.id)
  }

  // ADD-ONLY append over the row's CURRENT value via the proven pure op:
  // dedupes an already-linked id; a `single` relation replaces (radio cap).
  const current = coerceValue(def, sourceRow.props[def.id])
  const base = Array.isArray(current) ? current : []
  const value = targetIds.reduce((acc, id) => addLink(acc, id, def.single), base)
  await setProperty(supabase, sourceRow.id, def.id, value)

  return {
    sourceRowId: sourceRow.id,
    propertyId: def.id,
    ...(def.target ? { targetCollectionId: def.target } : {}),
    value,
  }
}
