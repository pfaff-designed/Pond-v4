'use client'

/**
 * PropertyInspector (#17) — the minimal manual surface for a page's typed
 * properties. Given a page's `_schema` and its stored values, it renders one
 * labeled control per property so a human can inspect and tweak values without
 * going through Pond. This is the manual half of the property primitive; the AI
 * half is the `define_schema`/`set_property` tools.
 *
 * Purely presentational: it reads values leniently (`coerceValue`) and raises
 * `onChange(key, value)` per edit. The host (DocumentPanel) owns persistence and
 * routes each edit through the *optimistic* `setProperty` path — never a proposal
 * card (decision 17: direct user manipulation bypasses the AI gate).
 *
 * `relation` is defined this pass but not yet authorable (#20): its values render
 * as inert id chips with a quiet note. Press aesthetics — kicker header, hairline
 * rows, serif body, sage accent — no bespoke widgets.
 */

import { cn } from '@/lib/utils'
import { pressKickerClass } from '@/components/atoms/press-kicker'
import {
  coerceValue,
  type PropertyDef,
  type PropertySchema,
  type PropertyValue,
} from '@/lib/properties/schema'

export interface PropertyInspectorProps {
  /** The page's property schema (its `props._schema`). */
  schema: PropertySchema
  /** The page's stored values, keyed by property id (its `props`, sans `_schema`). */
  values: Record<string, unknown>
  /** Raised with the property id and its new value on each edit. */
  onChange: (key: string, value: PropertyValue) => void
  /** When false, controls render read-only. Defaults to true. */
  editable?: boolean
  className?: string
}

const inputClass =
  'w-full border-0 border-b border-press-line bg-transparent px-0 py-1 font-serif text-sm text-press-body outline-none transition-colors placeholder:text-press-faint focus:border-press-accent disabled:opacity-60'

export function PropertyInspector({
  schema,
  values,
  onChange,
  editable = true,
  className,
}: PropertyInspectorProps) {
  if (schema.length === 0) {
    return (
      <p className={cn('font-serif text-xs italic text-press-muted', className)}>
        No properties on this page yet.
      </p>
    )
  }

  return (
    <dl
      role="group"
      aria-label="Page properties"
      className={cn('grid grid-cols-[8rem_1fr] items-baseline gap-x-4 gap-y-2.5', className)}
    >
      {schema.map((def) => (
        <div key={def.id} className="contents">
          <dt className={cn(pressKickerClass, 'pt-1 text-press-muted')}>{def.name}</dt>
          <dd>
            <PropertyField
              def={def}
              value={coerceValue(def, values[def.id])}
              editable={editable}
              onChange={onChange}
            />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function PropertyField({
  def,
  value,
  editable,
  onChange,
}: {
  def: PropertyDef
  value: PropertyValue
  editable: boolean
  onChange: (key: string, value: PropertyValue) => void
}) {
  const label = `${def.name} value`

  switch (def.type) {
    case 'number':
      return (
        <input
          type="number"
          className={inputClass}
          aria-label={label}
          disabled={!editable}
          value={typeof value === 'number' ? value : ''}
          placeholder="—"
          onChange={(e) => onChange(def.id, e.target.value === '' ? null : Number(e.target.value))}
        />
      )

    case 'date':
      return (
        <input
          type="date"
          className={inputClass}
          aria-label={label}
          disabled={!editable}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(def.id, e.target.value === '' ? null : e.target.value)}
        />
      )

    case 'checkbox':
      return (
        <input
          type="checkbox"
          className="h-4 w-4 accent-press-accent"
          aria-label={label}
          disabled={!editable}
          checked={value === true}
          onChange={(e) => onChange(def.id, e.target.checked)}
        />
      )

    case 'select':
    case 'status':
      return (
        <select
          className={inputClass}
          aria-label={label}
          disabled={!editable}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(def.id, e.target.value === '' ? null : e.target.value)}
        >
          <option value="">—</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      )

    case 'relation': {
      // Defined but not yet authorable (#20): show current links as inert chips.
      const ids = Array.isArray(value) ? value : []
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {ids.map((id) => (
            <span
              key={id}
              className="rounded-sm border border-press-line px-1.5 py-0.5 font-mono text-[0.7rem] text-press-muted"
            >
              {id}
            </span>
          ))}
          <span className="font-serif text-xs italic text-press-faint">
            {ids.length === 0 ? 'No links' : ''} · editable in a later pass
          </span>
        </div>
      )
    }

    case 'text':
    default:
      return (
        <input
          type="text"
          className={inputClass}
          aria-label={label}
          disabled={!editable}
          value={typeof value === 'string' ? value : ''}
          placeholder="—"
          onChange={(e) => onChange(def.id, e.target.value === '' ? null : e.target.value)}
        />
      )
  }
}
