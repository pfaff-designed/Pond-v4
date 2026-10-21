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
 * — grid `140px minmax(0,1fr)` · gap 12 · min-height 34, filling the card (KAN-350
 * dropped the molecule's own 360 clamp) · the eyebrow label — therefore comes from
 * the molecule, never restated here. At rest a value is a `PondAtom` (`propertyAtom`),
 * never a native `<input>`/`<select>` (KAN-350); `relation` renders the connected
 * chip field (#20).
 *
 * No empty copy of its own: the `properties` card's empty state (`no fields yet`)
 * is the frame's (#239), and DocumentPanel sets it off the schema (`propertiesFrame`).
 */

import { useState } from 'react'

import { PondControl } from '@/components/atoms/PondControl'
import { AtomEditor } from '@/components/molecules/AtomEditor'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import { TagValueEditor } from '@/components/molecules/TagValueEditor'
import { RelationValueField } from '@/components/organisms/RelationValueField'
import { RollupValueField } from '@/components/organisms/RollupValueField'
import { POND_BLOCK_ROW_GAP } from '@/lib/modules/block-frame'
import { formatAtomDate, localToday, parseDateInput } from '@/lib/properties/date-input'
import { propertyAtom } from '@/lib/properties/property-atom'
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
  /** select/status "+ new tag": the host turns the picked label into one schema
   *  write (adding the option, on the collection page that owns `_schema`) plus
   *  the value set. Omit where the host can't write the schema — the tag
   *  editor's "+ new tag" row then never appears. */
  onAddOption?: (key: string, label: string) => void
  /** When false, controls render read-only. Defaults to true. */
  editable?: boolean
  className?: string
}

export function PropertyInspector({
  schema,
  values,
  onChange,
  onAddOption,
  editable = true,
  className,
}: PropertyInspectorProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  if (schema.length === 0) return null

  return (
    <div
      role="group"
      aria-label="Page properties"
      className={`flex flex-col ${POND_BLOCK_ROW_GAP.properties} ${className ?? ''}`}
    >
      {schema.map((def) => (
        // `contents` carries the pointer listeners the presentational molecule
        // does not own, the same split `todo/view.tsx` uses for its rows.
        <div
          key={def.id}
          className="contents"
          onMouseEnter={() => setHoveredId(def.id)}
          onMouseLeave={() => setHoveredId((id) => (id === def.id ? null : id))}
        >
          <PondMolecule
            kind="field-row"
            label={def.name}
            state={hoveredId === def.id ? 'hover' : 'rest'}
            className="max-w-full"
          >
            <PropertyField
              def={def}
              value={coerceValue(def, values[def.id])}
              editable={editable}
              onChange={onChange}
              onAddOption={onAddOption}
              schema={schema}
              values={values}
            />
          </PondMolecule>
        </div>
      ))}
    </div>
  )
}

function PropertyField({
  def,
  value,
  editable,
  onChange,
  onAddOption,
  schema,
  values,
}: {
  def: PropertyDef
  value: PropertyValue
  editable: boolean
  onChange: (key: string, value: PropertyValue) => void
  onAddOption?: (key: string, label: string) => void
  /** The page schema — a rollup reads its sibling relation def from here. */
  schema?: PropertySchema
  /** The page values — a rollup reads its sibling relation's linked ids from here. */
  values?: Record<string, unknown>
}) {
  switch (def.type) {
    case 'checkbox':
      // `PondControl kind="checkbox"` (#221) — the STANDALONE control of
      // `PondControl.dc.html` (14 / radius 4 / inset .68): a property value sitting
      // alone in the field-row's value slot, not a list row (that is the check-row's
      // `PondAtom` box) and not a template row (`PondTemplate`'s 13 / 3 / .4).
      return (
        <PondControl
          kind="checkbox"
          label={null}
          aria-label={`${def.name} value`}
          disabled={!editable}
          on={value === true}
          onCheckedChange={(next) => onChange(def.id, next)}
        />
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

    // date — the same AtomEditor host, parsing free text through `parseDateInput`
    // and showing its resolved day as a mono preview line under the input while
    // typing (`formatAtomDate`).
    case 'date': {
      const atom = propertyAtom(def, value)
      const today = localToday()
      return (
        <AtomEditor
          kind={atom.kind}
          value={atom.value}
          empty={atom.empty}
          editable={editable}
          aria-label={`${def.name} value`}
          className="justify-self-start"
          errorNote="not a date"
          parse={(text) => parseDateInput(text, today)}
          preview={(text) => {
            const parsed = parseDateInput(text, today)
            return parsed === null || parsed === 'empty' ? null : formatAtomDate(parsed)
          }}
          onCommit={(next) => onChange(def.id, next)}
        />
      )
    }

    // number/text — click-to-edit via the shared AtomEditor host (KAN-350).
    case 'number':
    case 'text': {
      const atom = propertyAtom(def, value)
      const isNumber = def.type === 'number'
      return (
        <AtomEditor
          kind={atom.kind}
          value={atom.value}
          empty={atom.empty}
          editValue={
            isNumber
              ? typeof value === 'number'
                ? String(value)
                : ''
              : typeof value === 'string'
                ? value
                : ''
          }
          editable={editable}
          aria-label={`${def.name} value`}
          className="justify-self-start"
          parse={(text) => {
            const trimmed = text.trim()
            if (trimmed === '') return 'empty'
            if (!isNumber) return text
            const n = Number(trimmed)
            return Number.isFinite(n) ? n : null
          }}
          onCommit={(next) => onChange(def.id, next)}
        />
      )
    }

    // select, status — the tag editor: click opens the option menu, picking
    // writes the option's id. "+ new tag" raises `onAddOption`, which the host
    // (DocumentPanel) turns into one schema write plus the value set.
    case 'select':
    case 'status': {
      const atom = propertyAtom(def, value)
      return (
        <TagValueEditor
          options={def.options ?? []}
          value={typeof value === 'string' ? value : null}
          label={atom.value}
          empty={atom.empty}
          editable={editable}
          aria-label={`${def.name} value`}
          className="justify-self-start"
          onChange={(next) => onChange(def.id, next)}
          onAddOption={onAddOption ? (newLabel) => onAddOption(def.id, newLabel) : undefined}
        />
      )
    }
  }
}
