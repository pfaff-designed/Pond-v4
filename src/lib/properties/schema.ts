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
 * order. `ganttRowDone` reads a gantt bar's done-ink off it, and a board's lanes
 * must column by the same one, so a gantt's done bars are exactly the cards in the
 * board's `done` lane. That claim was once written twice and enforced nowhere (#260
 * review): changing the preference in one would have silently diverged the two. The
 * `/board` row that seeded a board's `groupBy` left with #278 (the board draws no
 * such row); when the view's board-mode switch seeds one, it reads this function.
 * `undefined` → the page has nothing to group by.
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

/**
 * Append a `date`-typed property to `schema` (KAN-292: the remedy a dateless view
 * offers from its own empty state). Named `date`, or `date 2` if `date` already
 * names another field — a single fallback, not an open-ended counter (unlike the
 * picker's own `field`/`field 2`: a second collision is new scope). `mintId`
 * follows the injected convention used across the codebase (`hydratePropertySchema`,
 * `instantiate.ts`) so callers can supply a deterministic id in tests.
 */
export function addDateField(
  schema: PropertySchema,
  mintId: () => string = () => crypto.randomUUID()
): PropertySchema {
  const name = schema.some((d) => d.name === 'date') ? 'date 2' : 'date'
  return [...schema, { id: mintId(), name, type: 'date' }]
}

/** Text fields an event page adds beside its date: location, then guests. */
export const EVENT_TEXT_FIELDS = ['location', 'guests'] as const

function fieldNameIs(def: PropertyDef, name: string): boolean {
  return def.name.trim().toLowerCase() === name
}

function hasRepeatField(schema: PropertySchema): boolean {
  return schema.some(
    (def) => (def.type === 'text' || def.type === 'select') && /^repeats?$/i.test(def.name.trim())
  )
}

/**
 * The event page: a date, then location, guests, and repeats.
 * Reuses a date the collection already has (that is what places the event).
 * A field named `repeat` or `repeats` is the one the calendar projects.
 * Returns null when those fields are already present, so a second event does
 * not rewrite the schema.
 */
export function ensureEventFields(
  schema: PropertySchema,
  mintId: () => string = () => crypto.randomUUID()
): PropertySchema | null {
  let next = schema
  let changed = false
  if (!next.some((def) => def.type === 'date')) {
    next = [...next, { id: mintId(), name: 'Date', type: 'date' }]
    changed = true
  }
  for (const name of EVENT_TEXT_FIELDS) {
    if (next.some((def) => fieldNameIs(def, name))) continue
    next = [...next, { id: mintId(), name, type: 'text' }]
    changed = true
  }
  if (!hasRepeatField(next)) {
    next = [...next, { id: mintId(), name: 'repeats', type: 'text' }]
    changed = true
  }
  return changed ? next : null
}

/** The three lanes a board never ships without (KAN-351): `addStatusField`'s
 *  default options, and the board's own `add a status field` remedy. */
export const DEFAULT_STATUS_OPTIONS = ['to do', 'doing', 'done'] as const

/**
 * Append a `status`-typed property to `schema` (KAN-351: the group-by-less board's
 * own remedy, mirroring {@link addDateField}). Named `status`, or `status 2` on a
 * name collision — same single-fallback convention as `addDateField`. Carries
 * {@link DEFAULT_STATUS_OPTIONS} as minted `{id, label}` pairs so the board never
 * lands laneless. `mintId` mints both the field's id and each option's id.
 */
export function addStatusField(
  schema: PropertySchema,
  mintId: () => string = () => crypto.randomUUID()
): PropertySchema {
  const name = schema.some((d) => d.name === 'status') ? 'status 2' : 'status'
  const id = mintId()
  const options = DEFAULT_STATUS_OPTIONS.map((label) => ({ id: mintId(), label }))
  return [...schema, { id, name, type: 'status', options }]
}

/**
 * Remove one property by id (KAN-292: `addDateField`'s undo). Undoing must drop
 * only the field it added, read fresh off the CURRENT schema at undo time — not
 * restore the whole schema captured at click, which would also wipe any other
 * schema edit made while the undo toast was open.
 */
export function removeField(schema: PropertySchema, id: string): PropertySchema {
  return schema.filter((d) => d.id !== id)
}

/**
 * Append a new option, by label, to a `select`/`status` field (KAN-350: the tag
 * editor's "+ new tag"). Returns the updated schema AND the minted option id, so
 * the caller can set the field's value to it in the same gesture. A field whose
 * id doesn't match (or isn't `select`/`status`) returns the schema unchanged and
 * `optionId: null` — the caller's own write is conditioned on this, so an id that
 * no longer names a field in the schema (stale card, concurrent edit) writes
 * nothing rather than minting an option nobody's field will ever show.
 */
export function addOption(
  schema: PropertySchema,
  fieldId: string,
  label: string,
  mintId: () => string = () => crypto.randomUUID()
): { schema: PropertySchema; optionId: string | null } {
  const field = schema.find((d) => d.id === fieldId)
  if (!field || (field.type !== 'select' && field.type !== 'status')) {
    return { schema, optionId: null }
  }
  const optionId = mintId()
  const next = schema.map((d) =>
    d.id === fieldId ? { ...d, options: [...(d.options ?? []), { id: optionId, label }] } : d
  )
  return { schema: next, optionId }
}

/**
 * Drop one option, by id, off a `select`/`status` field (KAN-554: undoing the
 * `/board` project mint when no task still carries it). A field whose id
 * doesn't match (or isn't `select`/`status`) returns the schema unchanged.
 */
export function removeOption(
  schema: PropertySchema,
  fieldId: string,
  optionId: string
): PropertySchema {
  return schema.map((d) =>
    d.id === fieldId && (d.type === 'select' || d.type === 'status')
      ? { ...d, options: (d.options ?? []).filter((o) => o.id !== optionId) }
      : d
  )
}

/**
 * Rename one property by id (KAN-380: the table header's rename row). A missing
 * `id` leaves `schema` unchanged — the caller checks {@link isFieldNameTaken}
 * before writing, so this never needs to refuse a collision itself.
 */
export function renameField(schema: PropertySchema, id: string, name: string): PropertySchema {
  return schema.map((d) => (d.id === id ? { ...d, name } : d))
}

/** The table header's fixed title column (KAN-380) is not itself a `PropertyDef`,
 *  so no renamed/added field may claim its label — a second "Name" column would
 *  be indistinguishable from the title in the header row. */
const RESERVED_TITLE_LABEL = 'Name'

/**
 * The name `name` collides with — case-insensitively, trimmed — or `null` if
 * it's free (KAN-380: the rename row's collision guard, checked before every
 * commit, and the source of its note's wording). `excludeId` is the field
 * being renamed; it is never a collision with its own current name. An actual
 * field's own-cased name wins over the reserved {@link RESERVED_TITLE_LABEL}
 * fallback when both would match (there is no field literally named "Name").
 */
export function fieldNameClash(
  schema: PropertySchema,
  name: string,
  excludeId?: string
): string | null {
  const candidate = name.trim().toLowerCase()
  const existing = schema.find(
    (d) => d.id !== excludeId && d.name.trim().toLowerCase() === candidate
  )
  if (existing) return existing.name
  return candidate === RESERVED_TITLE_LABEL.toLowerCase() ? RESERVED_TITLE_LABEL : null
}

/** Whether `name` collides with another field's name or the reserved title — see {@link fieldNameClash}. */
export function isFieldNameTaken(
  schema: PropertySchema,
  name: string,
  excludeId?: string
): boolean {
  return fieldNameClash(schema, name, excludeId) !== null
}

/**
 * The first of `name`, `name 2`, `name 3`, … not claimed in `schema` (KAN-380:
 * `delete field`'s undo, when the name it's restoring under has since been
 * taken by another field). Unlike {@link addDateField}/{@link addStatusField}'s
 * single `<name> 2` fallback, undo must never give up on a clash — the def is
 * the only thing that hands the stored row values back, so it is restored
 * under SOME free name rather than dropped. `excludeId` is the field being
 * restored; it is never a collision with itself.
 */
export function freeFieldName(schema: PropertySchema, name: string, excludeId?: string): string {
  if (!fieldNameClash(schema, name, excludeId)) return name
  let n = 2
  while (fieldNameClash(schema, `${name} ${n}`, excludeId)) n++
  return `${name} ${n}`
}

/**
 * Reinsert a removed property def at `index` (KAN-380: `delete field`'s undo,
 * the {@link removeField} inverse). Values are never stripped on delete, so the
 * restored column reads them straight back. `index` clamps into range so an
 * undo staged against a schema that has since shrunk still lands the def
 * somewhere sane rather than throwing.
 */
export function restoreFieldAt(
  schema: PropertySchema,
  index: number,
  def: PropertyDef
): PropertySchema {
  const at = Math.max(0, Math.min(index, schema.length))
  return [...schema.slice(0, at), def, ...schema.slice(at)]
}

// ── select/status option edits (a board's own columns, #521) ──────────────────
// A board's lanes ARE the options of its group-by property (`groupRows`, apply.ts):
// adding, renaming or removing a lane is editing that property's `options`, never
// the property itself. These mirror the field-level rename/delete/restore above,
// scoped to one field's option list instead of the whole schema.

/**
 * The label `label` collides with — case-insensitively, trimmed — among `options`,
 * or `null` if it's free (the board column menu's rename guard, same shape as
 * {@link fieldNameClash}). `excludeId` is the option being renamed; it is never a
 * collision with its own current label.
 */
export function optionNameClash(
  options: PropertyOption[],
  label: string,
  excludeId?: string
): string | null {
  const candidate = label.trim().toLowerCase()
  const existing = options.find(
    (o) => o.id !== excludeId && o.label.trim().toLowerCase() === candidate
  )
  return existing ? existing.label : null
}

/** Whether `label` collides with another option's label — see {@link optionNameClash}. */
export function isOptionNameTaken(
  options: PropertyOption[],
  label: string,
  excludeId?: string
): boolean {
  return optionNameClash(options, label, excludeId) !== null
}

/**
 * The first of `label`, `label 2`, `label 3`, … not claimed among `options` (the
 * "delete column" undo, when the label it's restoring under has since been taken
 * by another option — same fallback `freeFieldName` gives a restored field).
 */
export function freeOptionLabel(
  options: PropertyOption[],
  label: string,
  excludeId?: string
): string {
  if (!optionNameClash(options, label, excludeId)) return label
  let n = 2
  while (optionNameClash(options, `${label} ${n}`, excludeId)) n++
  return `${label} ${n}`
}

/**
 * Rename one option, on one `select`/`status` field, by id. A missing field or
 * option leaves `schema` unchanged — the caller checks {@link isOptionNameTaken}
 * before writing, mirroring {@link renameField}.
 */
export function renameOption(
  schema: PropertySchema,
  fieldId: string,
  optionId: string,
  label: string
): PropertySchema {
  return schema.map((d) =>
    d.id === fieldId
      ? { ...d, options: (d.options ?? []).map((o) => (o.id === optionId ? { ...o, label } : o)) }
      : d
  )
}

/**
 * Remove one option, on one `select`/`status` field, by id (a board's own
 * "delete column"). Row values pointing at the removed option are never
 * rewritten here — exactly like {@link removeField}, a stale id is a lenient
 * read-side concern (`optionForValue`), not this write's.
 */
export function removeOption(
  schema: PropertySchema,
  fieldId: string,
  optionId: string
): PropertySchema {
  return schema.map((d) =>
    d.id === fieldId ? { ...d, options: (d.options ?? []).filter((o) => o.id !== optionId) } : d
  )
}

/**
 * Reinsert a removed option at `index` on one field (the {@link removeOption}
 * inverse, "delete column"'s undo). `index` clamps into the field's current
 * option count so an undo staged against a schema whose options have since
 * shrunk still lands the option somewhere sane rather than throwing. A missing
 * field leaves `schema` unchanged.
 */
export function restoreOptionAt(
  schema: PropertySchema,
  fieldId: string,
  index: number,
  option: PropertyOption
): PropertySchema {
  return schema.map((d) => {
    if (d.id !== fieldId) return d
    const options = d.options ?? []
    const at = Math.max(0, Math.min(index, options.length))
    return { ...d, options: [...options.slice(0, at), option, ...options.slice(at)] }
  })
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
