/**
 * Pure backlink derivation (#39, #20 second-half slice B). A backlink is the reverse
 * of a one-way relation: given a target page T, "which rows link to T?" Relations are
 * stored one-way (a `string[]` of page-ids), so the reverse is always DERIVED on read
 * — never a stored mirror, never a cascade. Remove the forward link and the backlink
 * simply stops being computed; there is no stale reverse to clean up.
 *
 * Two pure halves, both unit-tested with no I/O (the hook `use-backlinks` supplies the
 * pages and rows from the shared caches and calls these):
 *   - findBacklinkSources — DISCOVERY. Scans the workspace collections for every
 *     relation property that COULD point at T: its `target` matches T's collection, or
 *     it is unset ("link any page"). Scoping by target (not a blind full-workspace
 *     scan) keeps the reverse query cheap and matches the forward relation's semantics.
 *   - computeBacklinks — FILTER + GROUP. For each discovered source, keep the rows
 *     whose relation value actually contains T's id, grouped by source property. Values
 *     are read leniently (coerceValue → `[]` for anything non-array), so a dangling or
 *     garbage stored value is tolerated, never a crash (matching the relation half).
 */
import { coerceValue, readSchema, type PropertyDef } from '@/lib/properties/schema'

/** The minimal page shape discovery needs — `PondPage` satisfies it structurally. */
export interface BacklinkPage {
  id: string
  title: string
  props: Record<string, unknown>
}

/** The minimal source-row shape the filter needs — `PondPage` satisfies it. */
export interface BacklinkSourceRow {
  id: string
  title: string
  props: Record<string, unknown>
}

/** One discovered source: a relation property on a collection that could link T. */
export interface BacklinkSource {
  sourceCollectionId: string
  sourceCollectionTitle: string
  /** The relation PropertyDef on the source collection. */
  def: PropertyDef
}

/** A discovered source paired with the source collection's rows, ready to filter. */
export interface BacklinkCandidate extends BacklinkSource {
  rows: BacklinkSourceRow[]
}

/** A resolved inbound link, ready to render as a read-only chip. */
export interface BacklinkChip {
  id: string
  title: string
}

/** The inbound links from ONE source property, grouped under a source-property label. */
export interface BacklinkGroup {
  sourceCollectionId: string
  sourceCollectionTitle: string
  propertyId: string
  propertyName: string
  rows: BacklinkChip[]
}

/**
 * Discover every relation property across the workspace collections that could link a
 * target whose collection is `targetCollectionId` (null when the target is a plain page
 * that belongs to no collection). A relation is a source iff:
 *   - its `target` equals `targetCollectionId` (a targeted relation into T's collection), OR
 *   - its `target` is unset (an untargeted "link any page" relation — always a source).
 * A plain-page target (`targetCollectionId === null`) therefore only ever has untargeted
 * sources: a targeted relation points at a collection, and a plain page is a row of none.
 */
export function findBacklinkSources(
  pages: BacklinkPage[],
  targetCollectionId: string | null
): BacklinkSource[] {
  const sources: BacklinkSource[] = []
  for (const page of pages) {
    const schema = readSchema(page.props)
    if (!schema) continue // not a collection → no relation properties to scan
    for (const def of schema) {
      if (def.type !== 'relation') continue
      const untargeted = def.target == null
      const matchesTarget = targetCollectionId != null && def.target === targetCollectionId
      if (untargeted || matchesTarget) {
        sources.push({
          sourceCollectionId: page.id,
          sourceCollectionTitle: page.title,
          def,
        })
      }
    }
  }
  return sources
}

/**
 * Filter each candidate source's rows to those whose relation value contains `targetId`,
 * grouped by source property. A source with no inbound links is dropped, so the caller
 * renders only non-empty groups (or the empty state when nothing links back). Relation
 * values are coerced leniently, so a garbage/dangling stored value simply fails the
 * `includes` check rather than throwing.
 */
export function computeBacklinks(
  targetId: string,
  candidates: BacklinkCandidate[]
): BacklinkGroup[] {
  const groups: BacklinkGroup[] = []
  for (const candidate of candidates) {
    if (candidate.def.type !== 'relation') continue // defensive; discovery already filters
    const rows: BacklinkChip[] = []
    for (const row of candidate.rows) {
      const value = coerceValue(candidate.def, row.props[candidate.def.id])
      if (Array.isArray(value) && value.includes(targetId)) {
        rows.push({ id: row.id, title: row.title })
      }
    }
    if (rows.length > 0) {
      groups.push({
        sourceCollectionId: candidate.sourceCollectionId,
        sourceCollectionTitle: candidate.sourceCollectionTitle,
        propertyId: candidate.def.id,
        propertyName: candidate.def.name,
        rows,
      })
    }
  }
  return groups
}
