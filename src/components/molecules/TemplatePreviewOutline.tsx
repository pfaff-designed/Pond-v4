'use client'

/**
 * TemplatePreviewOutline (KAN-131, `Pond 06.06 Blank page to recipe.dc.html` frame
 * 3) — the flat outline stack a template preview draws over the blank page:
 * "Moving onto a template draws its blocks on the page as flat outlines, named in
 * mono." Purely presentational — `templateOutlineRows()`
 * (`src/lib/templates/preview.ts`) turns a template's blocks into the `rows` this
 * draws; the caller decides WHEN to show it.
 *
 * Every value is read inline from the frame: stack gap 10 · each row radius 14,
 * background the net chart's own ink-.045 fill (`--chart-fill-band`, the only
 * existing token at that value and already dark-aware — no new class invented),
 * padding 0 16, gap 9, label mono 11 at ink .68, a 12px hand-drawn mark (stroke
 * 1.4, round caps) from each row's own `icon`, height per `row.height`. Fades in
 * on the quick tier (150ms, the house curve), honouring `prefers-reduced-motion`.
 */

import type { TemplateOutlineRow } from '@/lib/templates/preview'

export interface TemplatePreviewOutlineProps {
  rows: TemplateOutlineRow[]
}

export function TemplatePreviewOutline({ rows }: TemplatePreviewOutlineProps) {
  return (
    <div data-part="template-preview" className="flex flex-col gap-[10px]">
      {rows.map((row, index) => (
        <div
          key={index}
          data-part="outline-row"
          style={{ height: row.height, backgroundColor: 'var(--chart-fill-band)' }}
          className="flex items-center gap-[9px] rounded-[14px] px-4 font-mono text-[11px] text-mn-text-secondary transition-opacity duration-[var(--motion-quick)] ease-[var(--ease-mn)] starting:opacity-0 motion-reduce:transition-none"
        >
          <OutlineMark d={row.icon.d} filled={row.icon.filled} />
          <span data-part="label">{row.label ? `${row.kind} — ${row.label}` : row.kind}</span>
        </div>
      ))}
    </div>
  )
}

/** The frame's mark at its own 12px size — `slash-row.tsx`'s `Mark` is fixed at 13px, the picker row's own size, not this one. */
function OutlineMark({ d, filled }: { d: string; filled?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
      aria-hidden
    >
      <path d={d} />
    </svg>
  )
}
