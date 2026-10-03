/**
 * Typed page properties — the foundation of the Database Primitive (#17).
 *
 * A page carries structured metadata beyond its `blocks`: typed *properties*
 * stored in the (previously dormant) `props` jsonb column. Two things live in
 * that one object and must never collide:
 *   - the **schema** at the reserved key `props._schema` — the ordered list of
 *     property definitions. A page that carries a `_schema` IS a collection (#18);
 *     its `type='row'` children validate against it.
 *   - the **values**, one per property, keyed by the property's `id`.
 *
 * Zod is the single source of truth (t12): TS types, runtime validation, and the
 * AI tool-input schema (`define_schema`, #17 slice 5) all derive from here. The
 * `_schema` key is reserved — the merge helpers below are the ONE place that keeps
 * a value write from clobbering the schema (and vice-versa).
 *
 * Pure data, no React, no Supabase — server-safe and unit-tested directly.
 */
import { z } from 'zod'

/** The reserved key inside `props` that holds a collection's property schema. */
export const SCHEMA_KEY = '_schema' as const

/**
 * The NodeType of a collection's schema-bound child (#18 decision 8). A `row` is a
 * real, openable page (own blocks + props) but is filtered out of the ['pages']
 * tree the rail and page surface read (`fetchPages`), so it never appears as a
 * rail child or a children-grid card — it is surfaced only through a view (#19).
 */
export const ROW_TYPE = 'row' as const

/**
 * The 8 property types. `relation` links to pages in another collection (#20 first
 * half); `rollup` is a *derived* property that aggregates a value over a relation
 * (#20 rollups) — it is never stored, only computed on read (see valueSchemaFor).
 * Deliberately no url/formula/multi-select this pass.
 */
export const PROPERTY_TYPES = [
  'text',
  'number',
  'date',
  'select',
  'status',
  'checkbox',
  'relation',
  'rollup',
] as const

export const propertyTypeSchema = z.enum(PROPERTY_TYPES)
export type PropertyType = z.infer<typeof propertyTypeSchema>

/**
 * The aggregations a `rollup` may apply over its relation's linked rows (#20).
 * `count` needs no target property; the rest read `rollupProperty` off each linked
 * row — `sum`/`average` require a number, `min`/`max` a number or date. Applicability
 * is validated at compute time (a mismatch renders "—"), never a hard fail.
 */
export const ROLLUP_AGGREGATES = ['count', 'sum', 'average', 'min', 'max'] as const
export const rollupAggregateSchema = z.enum(ROLLUP_AGGREGATES)
export type RollupAggregate = z.infer<typeof rollupAggregateSchema>

/** A single choice for a `select`/`status` property. Carries a stable id so a
 *  rename never orphans the rows already pointing at it. */
export const propertyOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Optional token/hex for the chip; the renderer falls back to a neutral swatch. */
  color: z.string().optional(),
})
export type PropertyOption = z.infer<typeof propertyOptionSchema>

/** One typed property definition in a collection's `_schema`. */
export const propertyDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: propertyTypeSchema,
  /** `select`/`status` only: the allowed choices. */
  options: z.array(propertyOptionSchema).optional(),
  /** `relation` only: cap the link to a single page (#20). */
  single: z.boolean().optional(),
  /** `relation` only: the collection page-id this relation points at (#20). Optional —
   *  unset means an unscoped "link any page". Resolved from a NAME on accept; a stored
   *  id outside the target is tolerated (leniency), never rejected. */
  target: z.string().optional(),
  /** `rollup` only: id of the relation PropertyDef on THIS collection to aggregate over
   *  (#20). A dangling/untargeted relation renders "—", never throws. */
  relationId: z.string().optional(),
  /** `rollup` only: id of the property on the TARGET collection to aggregate. Omitted for
   *  `count`. Resolved from a NAME on accept; a stale/wrong-type id renders "—". */
  rollupProperty: z.string().optional(),
  /** `rollup` only: the aggregation function applied over the linked rows. */
  aggregate: rollupAggregateSchema.optional(),
})
export type PropertyDef = z.infer<typeof propertyDefSchema>

/** The ordered schema persisted at `props._schema` on a collection page. */
export const propertySchemaSchema = z.array(propertyDefSchema)
export type PropertySchema = z.infer<typeof propertySchemaSchema>

// ── AI-authored variant (#17 slice 5) ────────────────────────────────────────
// The `define_schema` tool lets the model PROPOSE a schema, but — exactly like
// block ids in create_page — the model must NEVER mint the stable ids that a
// rename relies on. So the AI-facing schema makes every `id` optional; the
// accept path (`hydratePropertySchema` in pages/create-page) mints any missing
// property/option id before the schema is validated against the strict
// `propertyDefSchema` and written. Same 7 types, same option/relation shape.

/** A `select`/`status` option as the model proposes it — `id` minted on accept. */
export const aiPropertyOptionSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  color: z.string().optional(),
})

/** One property definition as the model proposes it — `id` minted on accept. */
export const aiPropertyDefSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: propertyTypeSchema,
  options: z.array(aiPropertyOptionSchema).optional(),
  single: z.boolean().optional(),
  /** `relation` only: the target collection named by NAME (resolved to an id on accept). */
  target: z.string().optional(),
  /** `rollup` only: the relation property named by NAME (resolved to relationId on accept). */
  relation: z.string().optional(),
  /** `rollup` only: the target-collection property to aggregate, by NAME (resolved to an id
   *  on accept). Omit for `count`. */
  rollupProperty: z.string().optional(),
  /** `rollup` only: the aggregation function. */
  aggregate: rollupAggregateSchema.optional(),
})
export type AiPropertyDef = z.infer<typeof aiPropertyDefSchema>

/** The ordered schema the `define_schema` tool accepts (ids optional). */
export const aiPropertySchemaSchema = z.array(aiPropertyDefSchema)
export type AiPropertySchema = z.infer<typeof aiPropertySchemaSchema>

/**
 * A stored property value. The canonical empty is `null` for scalar/choice types,
 * `false` for checkbox, `[]` for relation (see {@link emptyValue}).
 */
export type PropertyValue = string | number | boolean | string[] | null

/**
 * The ONE property a collection buckets by: the first `status` or `select` in schema
 * order. Both callers assert they pick the same one — `ensureBoardGroupBy` columns a
 * board by it, and `ganttRowDone` reads a gantt bar's done-ink off it, so a gantt's
 * done bars are exactly the cards in the board's `done` lane. That claim was written
 * twice and enforced nowhere (#260 review): changing the preference in one would have
 * silently diverged the two. `undefined` → the page has nothing to group by.
 */
export function firstGroupingDef(schema: PropertySchema): PropertyDef | undefined {
  return schema.find((d) => d.type === 'status' || d.type === 'select')
}

// ── Per-type value validation ────────────────────────────────────────────────

/** The Zod validator for a property's *value*, derived from its definition. */
export function valueSchemaFor(def: PropertyDef): z.ZodTypeAny {
  switch (def.type) {
    case 'text':
      return z.string()
    case 'number':
      return z.number()
    case 'date':
      // Stored as an ISO date/datetime string; the UI owns display formatting.
      return z.string()
    case 'checkbox':
      return z.boolean()
    case 'select':
    case 'status':
      // The value is an option *id*; membership in `options` is a lenient concern
      // (a stale id is tolerated, not rejected — #18 decision 9).
      return z.string()
    case 'relation':
      return z.array(z.string())
    case 'rollup':
      // Derived / never-stored (#20): a rollup has no stored value — it is computed on
      // read. Rejecting every raw value makes coerceValue collapse any stray write to
      // emptyValue (null), so a rollup key can never masquerade as data.
      return z.never()
  }
}

/** The canonical "no value set" for a property type. */
export function emptyValue(def: PropertyDef): PropertyValue {
  switch (def.type) {
    case 'checkbox':
      return false
    case 'relation':
      return []
    default:
      return null
  }
}

/**
 * Coerce a raw stored value to the property's type, leniently (#18 decision 9):
 * a value that validates is returned as-is; anything missing or non-conforming
 * collapses to {@link emptyValue}. Never throws — conversational authoring must
 * not be able to hard-fail a read.
 */
export function coerceValue(def: PropertyDef, raw: unknown): PropertyValue {
  if (raw === null || raw === undefined) return emptyValue(def)
  const parsed = valueSchemaFor(def).safeParse(raw)
  return parsed.success ? (parsed.data as PropertyValue) : emptyValue(def)
}

// ── select/status option resolution (the value-is-an-id contract) ─────────────
// The stored value of a select/status property is the option's *stable id*, never
// its label (line 51: options carry ids so a rename never orphans a row). But the
// AI proposes values by label ("High"), exactly as it proposes property keys by
// name — so the write seam must resolve label→id, mirroring the name→id resolution
// in resolveRowValues. Resolution is lenient (#18 decision 9): a value already an
// id is kept idempotently; a label matches its option; anything unmatched is kept
// raw so an off-schema value is never silently dropped.

/**
 * Resolve a proposed select/status value to its option **id**. Matches an existing
 * id first (idempotent re-writes), then a label case-insensitively; an unmatched
 * value is returned verbatim (lenient raw fallback). Empty/blank → `null`.
 */
export function resolveOptionValue(def: PropertyDef, raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (s === '') return null
  const opts = def.options ?? []
  if (opts.some((o) => o.id === s)) return s
  const byLabel = opts.find((o) => o.label.trim().toLowerCase() === s.toLowerCase())
  return byLabel ? byLabel.id : s
}

/**
 * The read-side inverse: the option a stored select/status value points at, for
 * chip label + color (#19 views). Resolves by id first, then falls back to a
 * label match so a legacy row that stored a label (pre-resolution #18 rows) still
 * renders. Returns `undefined` for non-choice props or an unmatched/empty value —
 * the caller renders the raw string as a plain chip.
 */
export function optionForValue(def: PropertyDef, value: PropertyValue): PropertyOption | undefined {
  if (def.type !== 'select' && def.type !== 'status') return undefined
  if (typeof value !== 'string' || value === '') return undefined
  const opts = def.options ?? []
  return (
    opts.find((o) => o.id === value) ??
    opts.find((o) => o.label.trim().toLowerCase() === value.trim().toLowerCase())
  )
}

// ── Reserved-key merge helpers (the only place `_schema` and values coexist) ───

type Props = Record<string, unknown>

/** Read+validate a page's property schema, or `null` when it isn't a collection. */
export function readSchema(props: Props | null | undefined): PropertySchema | null {
  if (!props || !(SCHEMA_KEY in props)) return null
  const parsed = propertySchemaSchema.safeParse(props[SCHEMA_KEY])
  return parsed.success ? parsed.data : null
}

/** A page is a collection iff it carries a well-formed `_schema` (#18 decision 6). */
export function isCollection(props: Props | null | undefined): boolean {
  return readSchema(props) !== null
}

/** The value map — every key in `props` EXCEPT the reserved `_schema`. */
export function readValues(props: Props | null | undefined): Props {
  if (!props) return {}
  const { [SCHEMA_KEY]: _schema, ...values } = props
  void _schema
  return values
}

/**
 * Merge a schema into `props`, preserving every existing value. The single write
 * path for `define_schema` — it can never drop the row values that sit alongside.
 */
export function withSchema(props: Props | null | undefined, schema: PropertySchema): Props {
  return { ...(props ?? {}), [SCHEMA_KEY]: schema }
}

/**
 * Merge one property value into `props`, preserving `_schema` and every sibling
 * value. The single write path for `set_property` (planned, #19) / manual edits — it can never
 * clobber the collection's schema. Clearing a value writes `emptyValue`, never a
 * key delete (removing a value is not the same gesture as removing a property).
 */
export function withValue(
  props: Props | null | undefined,
  key: string,
  value: PropertyValue
): Props {
  if (key === SCHEMA_KEY) {
    throw new Error('withValue cannot write the reserved _schema key; use withSchema')
  }
  return { ...(props ?? {}), [key]: value }
}
