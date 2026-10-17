'use client'

/**
 * Value cells and chips shared by the view's table, board, calendar and record peek:
 * one editor per property type when editable, a resolved read display otherwise.
 */

import { PondControl } from '@/components/atoms/PondControl'
import { AtomEditor } from '@/components/molecules/AtomEditor'
import { TagValueEditor } from '@/components/molecules/TagValueEditor'
import { RelationValueField } from '@/components/organisms/RelationValueField'
import { RollupValueField } from '@/components/organisms/RollupValueField'
import { formatAtomDate, localToday, parseDateInput } from '@/lib/properties/date-input'
import { propertyAtom } from '@/lib/properties/property-atom'
import {
  coerceValue,
  optionForValue,
  type PropertyDef,
  type PropertySchema,
  type PropertyValue,
} from '@/lib/properties/schema'
import { displayValue } from './apply'
import { DraftInput } from '@/components/atoms/draft-input'

/** One table cell — an inline editor when editable, a resolved read display otherwise. */
export function Cell({
  def,
  value,
  editable,
  onChange,
  schema,
  rowValues,
  inputClassName,
  onAddOption,
}: {
  def: PropertyDef
  value: PropertyValue
  editable: boolean
  onChange: (value: PropertyValue) => void
  /** The row's collection schema — a rollup reads its sibling relation def from here. */
  schema?: PropertySchema
  /** The row's values — a rollup reads its sibling relation's linked ids from here. */
  rowValues?: Record<string, unknown>
  /** Replaces the editor's type recipe — the record peek sets its own 13.5px ink. */
  inputClassName?: string
  /** select/status "+ new tag": the host turns the picked label into one schema
   *  write plus the value set. Omit where the host can't write the schema — the
   *  tag editor's "+ new tag" row then never appears. */
  onAddOption?: (label: string) => void
}) {
  const label = `${def.name} value`

  // A rollup is derived + never stored: resolve its sibling relation (by
  // relationId) from the row's schema + values and let the connected field fetch +
  // compute. Always read-only, regardless of `editable`.
  if (def.type === 'rollup') {
    const relationDef = schema?.find((d) => d.id === def.relationId)
    const relationValue = relationDef ? coerceValue(relationDef, rowValues?.[relationDef.id]) : []
    return <RollupValueField def={def} relationDef={relationDef} relationValue={relationValue} />
  }

  if (!editable) {
    if (def.type === 'select' || def.type === 'status') {
      const opt = optionForValue(def, value)
      return opt ? <OptionChip label={opt.label} color={opt.color} /> : <Dash />
    }
    if (def.type === 'checkbox') {
      return value === true ? (
        <span aria-label="checked" className="inline-grid place-items-center">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M2.5 6.5l2.5 2.5 4.5-6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : (
        <Dash />
      )
    }
    if (def.type === 'relation') {
      // Read-only host: chips (clickable), no picker.
      return <RelationValueField def={def} value={value} editable={false} onChange={onChange} />
    }
    const text = displayValue(def, value)
    return text ? <span>{text}</span> : <Dash />
  }

  const cellInput =
    inputClassName ??
    'w-full border-0 bg-transparent px-0 py-0.5 text-sm text-mn-text-meta outline-none placeholder:text-mn-text-secondary'

  switch (def.type) {
    case 'number':
      return (
        <DraftInput
          type="number"
          className={cellInput}
          aria-label={label}
          value={typeof value === 'number' ? String(value) : ''}
          placeholder="—"
          onCommit={(draft) => onChange(draft === '' ? null : Number(draft))}
        />
      )
    case 'date': {
      // The date editor (KAN-350): the atom's `editing` state, free text parsed
      // through `parseDateInput` with a resolved-day preview. No native date
      // picker — the board draws none.
      const atom = propertyAtom(def, value)
      const today = localToday()
      return (
        <AtomEditor
          kind={atom.kind}
          value={atom.value}
          empty={atom.empty}
          aria-label={label}
          errorNote="not a date"
          parse={(text) => parseDateInput(text, today)}
          preview={(text) => {
            const parsed = parseDateInput(text, today)
            return parsed === null || parsed === 'empty' ? null : formatAtomDate(parsed)
          }}
          onCommit={(next) => onChange(next)}
        />
      )
    }
    case 'checkbox':
      // `PondControl kind="checkbox"` — the standalone control of
      // `PondControl.dc.html` (14 / 4 / .68), alone in a table cell; not the
      // check-row's `PondAtom` box, not `PondTemplate`'s row box.
      return (
        <PondControl
          kind="checkbox"
          label={null}
          aria-label={label}
          on={value === true}
          onCheckedChange={(next) => onChange(next)}
        />
      )
    case 'select':
    case 'status': {
      // The tag editor (KAN-350): the value reads as a `tag` chip, clicking opens
      // the option menu. "+ new tag" only appears when the host passes
      // `onAddOption` — it owns the schema write a new option needs.
      const atom = propertyAtom(def, value)
      return (
        <TagValueEditor
          options={def.options ?? []}
          value={typeof value === 'string' ? value : null}
          label={atom.value}
          empty={atom.empty}
          aria-label={label}
          onChange={(next) => onChange(next)}
          onAddOption={onAddOption}
        />
      )
    }
    case 'relation':
      // Editable host: chips + a scoped picker.
      return <RelationValueField def={def} value={value} editable onChange={onChange} />
    case 'text':
    default:
      return (
        <DraftInput
          type="text"
          className={cellInput}
          aria-label={label}
          value={typeof value === 'string' ? value : ''}
          placeholder="—"
          onCommit={(draft) => onChange(draft === '' ? null : draft)}
        />
      )
  }
}

export function Dash() {
  return <span className="text-mn-text-secondary">—</span>
}

/** A select/status value chip: a colored dot + the option label. */
export function OptionChip({ label, color }: { label: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-mn-chrome border border-mn-line bg-mn-surface px-1.5 py-0.5 text-xs text-mn-text-meta">
      <OptionDot color={color} />
      {label}
    </span>
  )
}

// Legacy option colours arrive as raw Tailwind palette names (a rainbow outside
// the Make Noise system). Each maps to the nearest MN house hue, all --raw-* tokens
// Since the three signals are spoken for, the warm half of that
// rainbow collapses: red / rose / rust / pink / orange / amber all land on rose, and
// yellow / lime join the greens on sage. So these twenty-two names resolve to FIVE
// swatches — olive-mid, rose, sage, mist, navy — plus ink for `accent`. Two option
// colours can therefore draw the same dot; the label beside it is what distinguishes
// them. A hex/rgb/hsl value still renders verbatim; unknown names fall back to a hairline.
const TOKEN_DOT: Record<string, string> = {
  // neutrals → the house neutral-400
  zinc: 'var(--raw-olive-mid)',
  gray: 'var(--raw-olive-mid)',
  slate: 'var(--raw-olive-mid)',
  stone: 'var(--raw-olive-mid)',
  // reds + warms → the dusty-rose swatch, the one warm the palette sanctions for
  // option dots. Red is diff removals, burnt orange the ONE dated thing per screen
  // and wheat highlighted passages only (PROJECT_RULES § Colors), so none of the
  // three signals may tint a dot. Six names share this one swatch.
  red: 'var(--raw-rose)',
  rose: 'var(--raw-rose)',
  rust: 'var(--raw-rose)',
  pink: 'var(--raw-rose)',
  orange: 'var(--raw-rose)',
  amber: 'var(--raw-rose)',
  // yellows → sage (the nearest area mark to lime / yellow-green)
  yellow: 'var(--raw-sage)',
  lime: 'var(--raw-sage)',
  // greens → sage
  green: 'var(--raw-sage)',
  emerald: 'var(--raw-sage)',
  teal: 'var(--raw-sage)',
  // pale cools → mist
  cyan: 'var(--raw-mist)',
  sky: 'var(--raw-mist)',
  blue: 'var(--raw-mist)',
  // deep cools → navy
  indigo: 'var(--raw-navy)',
  violet: 'var(--raw-navy)',
  purple: 'var(--raw-navy)',
  // the sanctioned accent role
  accent: 'var(--mn-text)',
}

function OptionDot({ color }: { color?: string }) {
  let background = 'var(--mn-line)'
  if (color) {
    if (/^(#|rgb|hsl)/i.test(color)) background = color
    else background = TOKEN_DOT[color.toLowerCase()] ?? 'var(--mn-line)'
  }
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: background }}
    />
  )
}

/** The repeat tag's mark (`Pond 02` 2u): hand-drawn, 11px, stroke 1.4, round caps. */
export function RepeatMark() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
      aria-hidden
    >
      <path d="M2.2 6a3.8 3.8 0 0 1 6.6-2.6" />
      <path d="M9 1.6v2.2H6.8" />
      <path d="M9.8 6a3.8 3.8 0 0 1-6.6 2.6" />
      <path d="M3 10.4V8.2h2.2" />
    </svg>
  )
}
