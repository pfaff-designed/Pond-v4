'use client'

/**
 * PropertyInspector (#17) — the manual surface for a page's typed properties. Given
 * a page's `_schema` and its stored values, it renders one labelled control per
 * property so a human can inspect and tweak values without going through Pond.
 * This is the manual half of the property primitive; the AI half is the
 * `define_schema` tool (and `set_property`).
 *
 * Purely presentational: it reads values leniently (`coerceValue`) and raises
 * `onChange(key, value)` per edit. The host (DocumentPanel) owns persistence and
 * routes each edit through the *optimistic* `setProperty` path — never a proposal
 * card (decision 17: direct user manipulation bypasses the AI gate). It holds no
 * copy of anything: the values are props, which is why ADR 0007 classes it as
 * already built rather than as a block.
 *
 * Its rows ARE `PondMolecule kind="field-row"` (#260). ADR 0004's level ladder
 * decides it: `PondBlock.dc.html`'s `properties` frame dc-imports the molecule for
 * every row (`kind: 'field-row', label, value, vk`), and the molecule's value atom
 * covers every property type the twelve templates' `props` need (`status`, `due`,
 * `date`, `with` → tag / date / text) — so, as list and check rows (#219), the
 * molecule wins and `PondTemplate`'s tighter inline row (`width 70` label at 12.5,
 * `min-height 22`) is the level-4 rendering, unreconciled. The molecule's geometry
 * — grid `140px minmax(0,1fr)` · gap 12 · min-height 34 · width 360 · the eyebrow
 * label — therefore comes from the molecule, never restated here; the live control
 * rides its value slot. `relation` renders the connected chip field (#20).
 *
 * No empty copy of its own: the `properties` card's empty state (`no fields yet`)
 * is the frame's (#239), and DocumentPanel sets it off the schema (`propertiesFrame`).
 */

import { PondMolecule } from '@/components/molecules/PondMolecule'
import { RelationValueField } from '@/components/organisms/RelationValueField'
import { RollupValueField } from '@/components/organisms/RollupValueField'
import { POND_BLOCK_ROW_GAP } from '@/lib/modules/block-frame'
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
  'w-full border-0 border-b border-mn-line bg-transparent px-0 py-1 font-sans text-[13.5px] text-mn-text outline-none transition-colors placeholder:text-mn-text-secondary focus:border-mn-text disabled:opacity-60'

export function PropertyInspector({
  schema,
  values,
  onChange,
  editable = true,
  className,
}: PropertyInspectorProps) {
  if (schema.length === 0) return null

  return (
    <div
      role="group"
      aria-label="Page properties"
      className={`flex flex-col ${POND_BLOCK_ROW_GAP.properties} ${className ?? ''}`}
    >
      {schema.map((def) => (
        // The fixed 360 clamps to a narrower column rather than overflow (ADR 0004 §7).
        <PondMolecule key={def.id} kind="field-row" label={def.name} className="max-w-full">
          <PropertyField
            def={def}
            value={coerceValue(def, values[def.id])}
            editable={editable}
            onChange={onChange}
            schema={schema}
            values={values}
          />
        </PondMolecule>
      ))}
    </div>
  )
}

function PropertyField({
  def,
  value,
  editable,
  onChange,
  schema,
  values,
}: {
  def: PropertyDef
  value: PropertyValue
  editable: boolean
  onChange: (key: string, value: PropertyValue) => void
  /** The page schema — a rollup reads its sibling relation def from here. */
  schema?: PropertySchema
  /** The page values — a rollup reads its sibling relation's linked ids from here. */
  values?: Record<string, unknown>
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
          className="h-4 w-4 accent-mn-text"
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

    case 'relation':
      // The page's own relation property: chips + scoped picker (#20 slice 6).
      // Writes the fresh id array back through the inspector's (key, value) onChange.
      return (
        <RelationValueField
          def={def}
          value={value}
          editable={editable}
          onChange={(next) => onChange(def.id, next)}
        />
      )

    case 'rollup': {
      // Derived + never stored (#20): resolve the sibling relation (by relationId)
      // from the page schema + values and let the connected field fetch + compute.
      // Always read-only — a rollup has no input.
      const relationDef = schema?.find((d) => d.id === def.relationId)
      const relationValue = relationDef ? coerceValue(relationDef, values?.[relationDef.id]) : []
      return <RollupValueField def={def} relationDef={relationDef} relationValue={relationValue} />
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
