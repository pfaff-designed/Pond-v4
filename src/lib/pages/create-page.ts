/**
 * The AI `create_page` accept path (M1) — framework-agnostic domain logic.
 *
 * A `create_page` tool call is client-resolved (no execute): the model proposes a
 * brand-new page (type + optional kind + title + a proposed parent + id-less
 * scaffolded blocks), the user reviews it on a proposal card, and ONLY on accept do
 * we write. This module owns that write:
 *
 *   1. hydrateProposalBlocks — mint ids (block-level AND nested, e.g. todo items)
 *      for the id-less module data the AI emits, re-validating each block against
 *      `blockSchema` so a malformed block is skipped, never written (mirrors the
 *      accept-time gate in pages/edits.ts — the AI never mints ids, branch 2/7).
 *   2. createPageFromProposal — resolve the proposed parent (UUID or title, reusing
 *      nodes/create.resolveParentId so structural + content creation share one
 *      resolver) and insert via pages/client.createPage, carrying page-kind in
 *      `props.kind` (the coarse `type` enum is unchanged).
 *
 * No Next.js imports — takes a SupabaseClient, exercised directly in jest.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, NodeType } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { CreatePageBlock } from '@/lib/modules/ai-composition'
import { hydrateBlock } from '@/lib/modules/hydrate'
import { collectBatchRefIds, resolveSourceRef } from '@/lib/modules/same-batch-refs'
import { createPage, getPage, defineSchema } from '@/lib/pages/client'
import { resolveParentId } from '@/lib/nodes/create'
import { resolveRowRef, relationCandidates } from '@/lib/pages/link-records'
import { addLink } from '@/lib/modules/view/relation-value-ops'
import {
  propertyDefSchema,
  readSchema,
  isCollection,
  coerceValue,
  resolveOptionValue,
  ROW_TYPE,
  type AiPropertyDef,
  type PropertyDef,
  type PropertySchema,
  type PropertyValue,
} from '@/lib/properties/schema'

/**
 * Hydrate a full proposed block array in order — minting block-level and nested ids
 * and validating each block (shared `hydrateBlock`, the same gate the propose_changes
 * accept path uses). Malformed blocks are skipped (never written); block order is
 * preserved. The `mintId` closure is injected so the client supplies
 * `crypto.randomUUID` and tests supply a deterministic counter.
 *
 * Same-batch bindings (ticket-31): a block entry may carry a `bindKey`, and a metric
 * in the same proposal may bind to it via `source: { ref: <bindKey>, kind }` — so an
 * AI-scaffolded page is born with LIVE metrics (the original audit finding was
 * exactly a create_page metric that could not bind to its own checklist). The whole
 * proposal lands atomically here, so this is the simple single-pass case: keys map
 * only for entries that pass validation (a skipped block can't be a binding target);
 * an unknown ref drops the binding (metric lands manual, never dangling). `bindKey`
 * is authoring-only — `hydrateBlock`'s schema validation strips it from what
 * persists.
 */
export function hydrateProposalBlocks(data: CreatePageBlock[], mintId: () => string): Block[] {
  const refs = collectBatchRefIds(
    data.map((b) => ({ bindKey: b.bindKey, data: b })),
    mintId
  )
  const out: Block[] = []
  for (const item of data) {
    const id = (item.bindKey ? refs.get(item.bindKey) : undefined) ?? mintId()
    const block = hydrateBlock(resolveSourceRef(item, refs), id, mintId)
    if (block) out.push(block)
  }
  return out
}

/** A create_page proposal after the user has (optionally) corrected its placement. */
export interface CreatePageProposal {
  type: NodeType
  /** Page-kind (recipe | document | inventory | dashboard | note | …). Structural
   *  types may omit it — it is stored in `props.kind`, not the coarse `type` enum. */
  kind?: string
  title: string
  /** The chosen parent, as a page UUID OR a page title to resolve (resolveParentId
   *  accepts either), or null = top-level. The AI proposes a title; the client may
   *  substitute a picked page id — both flow through here. */
  parentRef?: string | null
  /** Id-less scaffolded blocks the AI proposed (each may carry a `bindKey`). */
  blocks: CreatePageBlock[]
}

export interface CreatedPage {
  id: string
}

/**
 * Write an accepted create_page proposal. Resolves the parent (UUID or title),
 * hydrates the blocks (minting ids), and inserts the row with `props.kind` set when
 * a kind is present. Throws when unauthenticated or when the parent title can't be
 * resolved (surfaced to the user rather than silently writing at top-level).
 */
export async function createPageFromProposal(
  supabase: SupabaseClient<Database>,
  proposal: CreatePageProposal,
  mintId: () => string,
  /** #312: the pond to write into. See `CreatePageInput.pondId`. */
  pondId: string | null
): Promise<CreatedPage> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const ref = proposal.parentRef?.trim()
  const parentId = ref ? await resolveParentId(sb, user.id, ref, pondId) : null

  const blocks = hydrateProposalBlocks(proposal.blocks, mintId)

  const props = proposal.kind ? { kind: proposal.kind } : {}

  const page = await createPage(supabase, user.id, {
    parentId,
    type: proposal.type,
    title: proposal.title,
    blocks,
    props,
    pondId,
  })
  return { id: page.id }
}

// ── define_schema accept path (#17 slice 5) ─────────────────────────────────
//
// A `define_schema` tool call is client-resolved (no execute), exactly like
// create_page: the model proposes turning an EXISTING page into a collection by
// giving it a property schema (id-less, since the model never mints stable ids),
// the user reviews it on a proposal card, and ONLY on accept do we write. This
// mirror owns that write:
//
//   1. hydratePropertySchema — mint any missing property AND option ids for the
//      id-less schema the AI emits, re-validating each def against the strict
//      `propertyDefSchema` so a malformed property is skipped, never written
//      (the same gate hydrateProposalBlocks applies to blocks).
//   2. defineSchemaFromProposal — confirm the target page exists, then persist
//      through the merge-safe `defineSchema` client fn (which uses `withSchema`,
//      so existing row values alongside the schema are never clobbered).

/**
 * Hydrate an id-less AI property schema into a persistable {@link PropertySchema}:
 * mint an id for every property and every option that lacks one (the AI never
 * mints ids — a rename must never orphan the rows pointing at an option), then
 * validate each def against `propertyDefSchema`. A malformed def is skipped, not
 * written (mirrors block hydration); property order is preserved. The `mintId`
 * closure is injected so the client supplies `crypto.randomUUID` and tests a
 * deterministic counter.
 *
 * `resolveCollectionName` (#20) turns a relation's proposed `target` — a collection
 * NAME the model wrote — into the collection's stable id, exactly as configure_view
 * resolves a group-by name. An unresolvable name (or no resolver) drops the target:
 * the relation stays untargeted (an unscoped "link any page"), never a hard fail.
 * `target` is relation-only — it never rides on another property type.
 *
 * `resolveTargetProperty` (#20 rollups) resolves a rollup's rolled property. A rollup
 * names two things by NAME: its relation sibling (`relation`) and the property to
 * aggregate on that relation's TARGET collection (`rollupProperty`). Both resolve in
 * a second pass — the relation NAME → the sibling's minted id (`relationId`), then the
 * rolled property NAME → its id within the target collection (via `resolveTargetProperty`).
 * A deferred pass is required because the relation may appear AFTER the rollup in the
 * array. Any unresolvable link is left UNSET (renders "—") but the def is KEPT (D7),
 * unlike a relation target (which is dropped). `relationId`/`rollupProperty`/`target`
 * are each type-scoped — none rides on a property type it doesn't belong to.
 *
 * #52 fix 1 (rollup-over-backlink honesty). A rollup whose `relation` NAME doesn't
 * resolve to a relation PHYSICALLY on the resulting collection (the classic "count via
 * Books" over a reverse/backlink that isn't a local relation property) is left inert —
 * it renders "—" (D7, unchanged) — but that silent no-op used to read to the user and
 * the model as success. The optional `inertRollups` collector surfaces the NAMES of
 * every such rollup out of the pass-2 `if (!rel) continue`, so the accept path can put
 * an honest note on the card receipt, the model stamp, and the resolutions envelope.
 * Detection is relation-only: a rollup whose relation DOES resolve but whose
 * rollupProperty/type mismatches stays lenient and is NOT reported here (out of scope).
 *
 * #52 fix 3 (duplicate Name/Title). A proposed TEXT property whose normalized name is
 * "title" or "name" is silently dropped — the intrinsic page title is already the one
 * title column, so a second one only mints a redundant column the user must reconcile.
 * The guard is text-only: a `select`/`status`/etc. named "Status" or "Name" is a real
 * data column and is preserved.
 */
export function hydratePropertySchema(
  defs: AiPropertyDef[],
  mintId: () => string,
  resolveCollectionName?: (name: string) => string | undefined,
  resolveTargetProperty?: (collectionId: string, propertyName: string) => string | undefined,
  existing: PropertySchema = [],
  inertRollups?: string[]
): PropertySchema {
  // #36 — additive merge-by-name. A define_schema proposal is a set of properties to
  // ADD-OR-UPDATE, never a wholesale replacement: a proposed property whose (trimmed,
  // case-insensitive) NAME matches one already in `existing` REUSES that property's id —
  // so the rows keyed by it stay attached — and adopts the proposed type/options; a
  // name with no match is appended as a new property (proposed order); and an existing
  // property the proposal doesn't mention is left untouched. Reusing the id closes both
  // #36 symptoms at once: "add a field" no longer drops the other columns, and a
  // promoted collection's same-named column reconciles instead of splitting into a
  // duplicate id that strands its values.
  const norm = (s: string) => s.trim().toLowerCase()
  const existingIdByName = new Map<string, string>()
  for (const d of existing) {
    const key = norm(d.name)
    if (!existingIdByName.has(key)) existingIdByName.set(key, d.id) // first wins on a dup name
  }

  // Rollups resolve against their relation sibling, which may appear later in the array
  // (or already exist on the collection) — so defer them to a second pass.
  // `relationsByName` maps a relation's (lowercased) NAME to the data a rollup needs: its
  // id + resolved target. Seed it from EXISTING relations first, so a rollup can point at
  // a relation the proposal didn't re-declare (existing tier); a re-proposed relation
  // overrides below (same-batch wins), carrying its reused id.
  const relationsByName = new Map<string, { id: string; target?: string }>()
  for (const d of existing) {
    if (d.type === 'relation') relationsByName.set(norm(d.name), { id: d.id, target: d.target })
  }

  // Hydrate each proposed def, keyed by name for the merge. `newInOrder` collects those
  // with no existing match, to append after the existing block (ordering decision A).
  const hydratedByName = new Map<string, PropertyDef>()
  const newInOrder: PropertyDef[] = []
  const pendingRollups: { def: PropertyDef; relationName?: string; rollupPropName?: string }[] = []

  for (const raw of defs) {
    // Capture the AI-only NAME fields before the strict parse strips/repurposes them
    // (`relation` is an unknown key → stripped; `rollupProperty` is kept as the NAME
    // string, which pass 2 overwrites with the resolved id).
    const relationName =
      raw.type === 'rollup' && typeof raw.relation === 'string' ? raw.relation : undefined
    const rollupPropName =
      raw.type === 'rollup' && typeof raw.rollupProperty === 'string'
        ? raw.rollupProperty
        : undefined

    const nameKey = norm(raw.name ?? '')
    // Reuse the matching existing property's id (unless the model supplied one) — the
    // crux of #36: the rows keyed by that id stay live and no duplicate column is minted.
    const reuseId = raw.id ?? existingIdByName.get(nameKey)

    const candidate = {
      ...raw,
      id: reuseId ?? mintId(),
      ...(raw.options ? { options: raw.options.map((o) => ({ ...o, id: o.id ?? mintId() })) } : {}),
    }
    const parsed = propertyDefSchema.safeParse(candidate)
    if (!parsed.success) continue
    const def = parsed.data

    // #52 fix 3 — never mint a duplicate title column. The page title IS the one title
    // column; a proposed TEXT property named "title"/"name" only splits it. Drop it
    // (text only — a select/status/etc. named "Status" or "Name" is a real data column).
    if (def.type === 'text' && (nameKey === 'title' || nameKey === 'name')) continue

    // A name repeated within one proposal: first occurrence wins (defensive — a dup would
    // otherwise mint a second entry for one logical column, the very split #36 fixes).
    if (nameKey && hydratedByName.has(nameKey)) continue

    if (def.type === 'relation') {
      const resolved =
        def.target && resolveCollectionName ? resolveCollectionName(def.target) : undefined
      if (resolved) def.target = resolved
      else delete def.target
      delete def.relationId
      delete def.rollupProperty
      relationsByName.set(norm(def.name), { id: def.id, target: def.target })
    } else if (def.type === 'rollup') {
      // Unset both link fields until resolved in pass 2 (an unresolved rollup renders "—").
      delete def.target
      delete def.relationId
      delete def.rollupProperty
      pendingRollups.push({ def, relationName, rollupPropName })
    } else {
      // Every type-scoped link field is relation/rollup-only — strip it off the rest.
      delete def.target
      delete def.relationId
      delete def.rollupProperty
    }

    hydratedByName.set(nameKey, def)
    if (!existingIdByName.has(nameKey)) newInOrder.push(def)
  }

  // Build the merged schema: existing order preserved, a matched property replaced in
  // place by its hydrated update; then the brand-new properties appended (ordering A).
  const out: PropertyDef[] = existing.map((d) => hydratedByName.get(norm(d.name)) ?? { ...d })
  for (const def of newInOrder) out.push(def)

  // Pass 2 — resolve each proposed rollup now that every relation (existing + same-batch)
  // is known: relation NAME → relationId, then the rolled property NAME → its id. Any
  // unresolved link stays unset (D7).
  for (const { def, relationName, rollupPropName } of pendingRollups) {
    const rel = relationName ? relationsByName.get(norm(relationName)) : undefined
    if (!rel) {
      // #52 fix 1 — the rollup's relation doesn't resolve to a relation physically on
      // this collection (reverse/backlink count, or a typo'd name). It stays inert and
      // renders "—" (D7), but surface it so the caller can be honest about the no-op.
      inertRollups?.push(def.name)
      continue
    }
    def.relationId = rel.id
    if (rollupPropName) {
      // `out` now holds the MERGED schema, so this single lookup covers the whole
      // precedence chain: same-batch (a property (re)defined in this proposal) AND the
      // existing tier (a property already on the collection the proposal left untouched)
      // both live in `out`. The external resolver is the final fallback for a genuine
      // cross-collection rollup (rolled property in a different, pre-existing collection).
      const key = norm(rollupPropName)
      const local = out.find((d) => d.type !== 'rollup' && norm(d.name) === key)?.id
      const propId =
        local ??
        (rel.target && resolveTargetProperty
          ? resolveTargetProperty(rel.target, rollupPropName)
          : undefined)
      if (propId) def.rollupProperty = propId
    }
  }

  return out
}

/** A define_schema proposal after the user has (optionally) corrected its target. */
export interface DefineSchemaProposal {
  /** The page the schema is applied to — makes it a collection (#18). */
  pageId: string
  /** The id-less property schema the AI proposed. */
  schema: AiPropertyDef[]
}

/**
 * Write an accepted define_schema proposal. Confirms the target page exists
 * (throws otherwise, so the card can revert rather than silently no-op), then
 * ADDITIVELY merges the proposal into the target's current schema by name (#36):
 * a matched property reuses its id (rows stay live) and adopts the proposed
 * type/options, a new name is appended, and unmentioned properties are preserved.
 * The write goes through the merge-safe `defineSchema`, so row values alongside the
 * schema are never clobbered. Returns the merged schema so the caller can seed its
 * page cache optimistically, plus `inertRollups` (#52 fix 1) — the NAMES of any
 * proposed rollup whose relation didn't resolve to a local relation, so the accept
 * path can be honest about the no-op on the card receipt, the model stamp, and the
 * envelope. An empty array is the ordinary (all-linked) case.
 */
export async function defineSchemaFromProposal(
  supabase: SupabaseClient<Database>,
  proposal: DefineSchemaProposal,
  mintId: () => string,
  resolveCollectionName?: (name: string) => string | undefined,
  resolveTargetProperty?: (collectionId: string, propertyName: string) => string | undefined
): Promise<{ schema: PropertySchema; inertRollups: string[] }> {
  const page = await getPage(supabase, proposal.pageId)
  if (!page) throw new Error(`Cannot define a schema: page ${proposal.pageId} was not found`)
  // #36 — additive merge: hydrate the proposal against the target's CURRENT schema so a
  // matched name reuses its property id (rows stay live) and unmentioned properties are
  // preserved. A page that isn't yet a collection has no schema → merge base is empty.
  const existing = readSchema(page.props) ?? []
  const inertRollups: string[] = []
  const schema = hydratePropertySchema(
    proposal.schema,
    mintId,
    resolveCollectionName,
    resolveTargetProperty,
    existing,
    inertRollups
  )
  await defineSchema(supabase, proposal.pageId, schema)
  return { schema, inertRollups }
}

/** A minimal page shape for resolving a relation target NAME→id at the accept site. */
export interface CollectionCandidate {
  id: string
  title: string
  props?: Record<string, unknown> | null
}

/**
 * Build the `resolveCollectionName` resolver `hydratePropertySchema` takes (#20
 * slice 2b). Given the workspace's pages (the accept site feeds the full
 * `['pages', workspace, 'full']` cache — the one that carries `props`), returns a
 * closure mapping a relation's proposed target NAME to the id of the first
 * COLLECTION whose title matches case-insensitively. A relation target IS a
 * collection (spec decision 1), so non-collections are excluded — including rows,
 * which never carry a `_schema`. A blank/unknown name, or one matching only a
 * non-collection page, returns undefined → the relation stays untargeted (lenient).
 */
export function collectionNameResolver(
  pages: CollectionCandidate[]
): (name: string) => string | undefined {
  const collections = pages.filter((p) => isCollection(p.props))
  return (name: string) => {
    const key = name.trim().toLowerCase()
    if (!key) return undefined
    return collections.find((p) => p.title.trim().toLowerCase() === key)?.id
  }
}

/**
 * Preview-side companion to {@link collectionNameResolver} (#37, relation spec
 * decision 8): resolve a relation's proposed target NAME to the matching
 * collection's CANONICAL title, so the define_schema proposal card can preview
 * which collection the relation will actually link into before accept. Same
 * resolution rules (collections only, case-insensitive, first match wins);
 * undefined means the accept path would leave the relation untargeted, and the
 * card flags the unmatched name instead.
 */
export function collectionTitleResolver(
  pages: CollectionCandidate[]
): (name: string) => string | undefined {
  const resolve = collectionNameResolver(pages)
  const titleById = new Map(pages.map((p) => [p.id, p.title]))
  return (name: string) => {
    const id = resolve(name)
    return id ? titleById.get(id) : undefined
  }
}

/**
 * Build the `resolveTargetProperty` resolver `hydratePropertySchema` takes for
 * rollups (#20). Given the workspace's pages (same `['pages', workspace, 'full']`
 * cache that carries `props`), returns a closure mapping a (target collection id,
 * property NAME) pair to that property's stable id within the target collection's
 * `_schema`. Case-insensitive; first match wins. Returns undefined when the
 * collection is unknown / not a collection, or the name matches no property — the
 * rollup's rolled property stays unset (renders "—"), never a hard fail.
 */
export function collectionPropertyResolver(
  pages: CollectionCandidate[]
): (collectionId: string, propertyName: string) => string | undefined {
  const byId = new Map(pages.map((p) => [p.id, p]))
  return (collectionId: string, propertyName: string) => {
    const key = propertyName.trim().toLowerCase()
    if (!key) return undefined
    const page = byId.get(collectionId)
    const schema = page ? readSchema(page.props) : null
    if (!schema) return undefined
    return schema.find((d) => d.name.trim().toLowerCase() === key)?.id
  }
}

/**
 * #52 fix 1 — preview-side companion to the pass-2 inert detection in
 * hydratePropertySchema. Given a define_schema proposal's ordered props and the
 * TARGET collection's CURRENT schema, return the set of rollup NAMES whose `relation`
 * won't resolve to a relation PHYSICALLY on the resulting collection — the same test
 * the accept path applies, so the card can flag "count via Books · no such relation
 * here" BEFORE accept and the two never disagree.
 *
 * A rollup's relation resolves when a `relation` property of that (case-insensitive)
 * NAME exists among the EXISTING schema OR the proposal's own props (the accept path
 * seeds relationsByName from both). A rollup with no `relation` at all is inert too.
 * Detection is relation-only — a resolvable relation with a bad rollupProperty/type is
 * lenient and NOT flagged here (out of scope).
 */
export function unresolvableRollupNames(
  proposed: AiPropertyDef[],
  targetSchema: PropertySchema
): Set<string> {
  const norm = (s: string) => s.trim().toLowerCase()
  const relationNames = new Set<string>()
  for (const d of targetSchema) if (d.type === 'relation') relationNames.add(norm(d.name))
  for (const d of proposed) if (d.type === 'relation' && d.name) relationNames.add(norm(d.name))

  const inert = new Set<string>()
  for (const d of proposed) {
    if (d.type !== 'rollup') continue
    const rel = typeof d.relation === 'string' ? norm(d.relation) : ''
    if (!rel || !relationNames.has(rel)) inert.add(d.name)
  }
  return inert
}

// ── add_row accept path (#18) ────────────────────────────────────────────────
//
// An `add_row` tool call is client-resolved (no execute), exactly like
// define_schema: the model proposes ONE new row for an EXISTING collection — its
// values keyed by property NAME (the model never mints the stable property/option
// ids) — the user reviews it on a proposal card, and ONLY on accept do we write.
// This mirror owns that write:
//
//   1. resolveRowValues — map each proposed { name: value } onto the collection's
//      schema: match the property by name (case-insensitive), coerce the value to
//      its type (coerceValue — lenient, a bad value collapses to empty), and key
//      it by the property's stable id. Names not in the schema are dropped.
//   2. addRowFromProposal — confirm the target exists AND is a collection, then
//      create a `type='row'` child page carrying the resolved value map as its
//      props (NEVER a _schema — a row is not itself a collection).

/**
 * Resolve an AI-proposed name→value map into a persistable { propertyId: value }
 * row-value map, against a collection's schema. Matches each proposed key to a
 * property by name (case-insensitive, first def wins on a duplicate name) and
 * coerces the value to that property's type. Unknown names are dropped and bad
 * values collapse to empty — conversational authoring must never hard-fail
 * (#18 decision 9). The result carries values only, never the reserved _schema.
 */
export function resolveRowValues(
  schema: PropertySchema,
  proposed: Record<string, unknown>
): Record<string, PropertyValue> {
  const byName = new Map<string, PropertyDef>()
  for (const def of schema) {
    const key = def.name.trim().toLowerCase()
    if (!byName.has(key)) byName.set(key, def)
  }
  const values: Record<string, PropertyValue> = {}
  for (const [name, raw] of Object.entries(proposed)) {
    const def = byName.get(name.trim().toLowerCase())
    if (!def) continue // property name not in the schema — dropped (lenient)
    // select/status store the option *id* (rename-safe); the model proposes the
    // label, so resolve label→id here — mirroring the name→id resolution above.
    values[def.id] =
      def.type === 'select' || def.type === 'status'
        ? resolveOptionValue(def, raw)
        : coerceValue(def, raw)
  }
  return values
}

/** An add_row proposal after the user has (optionally) corrected its target. */
export interface AddRowProposal {
  /** The collection the row is added to (a page carrying a `_schema`). */
  collectionId: string
  /** The new row's title (its page title). */
  title?: string
  /** The proposed values, keyed by property NAME (resolved to ids on accept). */
  props: Record<string, unknown>
}

/**
 * Write an accepted add_row proposal. Confirms the target page exists AND is a
 * collection (throws otherwise, so the card can revert rather than silently
 * no-op), resolves the proposed name→value map against the collection's schema,
 * and creates a `type='row'` child page carrying those coerced values. The row's
 * props hold ONLY values — never a `_schema` (a row is not itself a collection).
 */
export async function addRowFromProposal(
  supabase: SupabaseClient<Database>,
  proposal: AddRowProposal,
  /** #312: the pond to write into. See `CreatePageInput.pondId`. */
  pondId: string | null
): Promise<CreatedPage> {
  const collection = await getPage(supabase, proposal.collectionId)
  if (!collection) {
    throw new Error(`Cannot add a row: collection ${proposal.collectionId} was not found`)
  }
  const schema = readSchema(collection.props)
  if (!schema) {
    throw new Error(
      `Cannot add a row: page ${proposal.collectionId} is not a collection (it has no schema)`
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const values = resolveRowValues(schema, proposal.props)

  // #40 slice C — relation values arrive as target-row TITLES (the model never
  // sees row ids), but the z.array(z.string()) coercion above keeps them
  // verbatim, which would store dangling fake ids. Resolve each entry against
  // the relation's target candidates (its target collection's rows, or the
  // workspace's non-row pages when untargeted — shared with link_records):
  // a resolved title (or an entry that already IS a candidate id) becomes the
  // row id; an unresolvable or duplicate-titled entry is DROPPED (lenient, #18
  // decision 9 — but NEVER written raw). The kept ids fold through `addLink` so
  // dedupe + the `single` radio cap hold here exactly as in the picker.
  for (const def of schema) {
    if (def.type !== 'relation') continue
    const raw = values[def.id]
    if (!Array.isArray(raw) || raw.length === 0) continue
    const candidates = await relationCandidates(supabase, user.id, def.target, pondId)
    values[def.id] = raw
      .map((ref) => resolveRowRef(candidates, ref))
      .flatMap((res) => (res.kind === 'resolved' ? [res.id] : []))
      .reduce((acc, id) => addLink(acc, id, def.single), [] as string[])
  }

  const page = await createPage(supabase, user.id, {
    parentId: proposal.collectionId,
    type: ROW_TYPE,
    title: proposal.title ?? '',
    props: values,
    pondId,
  })
  return { id: page.id }
}
