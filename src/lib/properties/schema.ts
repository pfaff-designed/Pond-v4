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
 * The 7 property types (#17 decision 3). `relation` is *defined* here — its value
 * shape (an array of page-ids) round-trips — but its authoring/render surface is
 * built in #20. Deliberately no url/formula/multi-select this pass.
 */
export const PROPERTY_TYPES = [
  'text',
  'number',
  'date',
  'select',
  'status',
  'checkbox',
  'relation',
] as const

export const propertyTypeSchema = z.enum(PROPERTY_TYPES)
export type PropertyType = z.infer<typeof propertyTypeSchema>

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
 * value. The single write path for `set_property` / manual edits — it can never
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
