'use client'

/**
 * The mark picker (issue #134) — choose a page's glyph and its area colour.
 *
 * Purely presentational: the current mark and both intents are injected, and the
 * host (`NewPondSheet`) owns the write. Press aesthetics — kicker
 * headings, mono meta, hairline rules — matching `BacklinksSection` and
 * `PageChangesSection`.
 *
 * COLOURS ARE ROLES, NOT VALUES. Each swatch renders `var(--mn-area-*)`, so it
 * shows whatever the ACTIVE theme assigns the role — the picker never names a
 * colour and never bakes a hex. "Raw palette values never move — only roles
 * reassign" (AGENTS.md §Design language).
 *
 * Both halves are independently clearable: a page can take a glyph while still
 * inheriting its area's colour, which is the common case for a child page.
 */

import { useMemo, useState } from 'react'
import { Icon } from '@/components/atoms/Icon'
import { kickerClass } from '@/components/atoms/kicker'
import { cn } from '@/lib/utils'
import { AREA_ROLES, areaRoleColor, markAccent, searchGlyphs, type AreaRole } from '@/lib/rail/glyph-library'

export interface MarkPickerProps {
  /** The glyph showing now, derived or explicit. Null when the page has none. */
  glyph: string | null
  /** The role tinting the mark now, inherited or explicit; null when it is ink. */
  role: AreaRole | null
  /** True when the glyph is the page's own rather than derived from its title. */
  glyphIsOwn: boolean
  /** True when the role is the page's own rather than inherited. */
  roleIsOwn: boolean
  /** Choose a glyph, or null to go back to deriving it from the title. */
  onSelectGlyph: (glyph: string | null) => void
  /** Choose a role, or null to go back to inheriting the area's. */
  onSelectRole: (role: AreaRole | null) => void
  /** Focus the search field on mount — the connected popover's way in by keyboard. */
  autoFocus?: boolean
  className?: string
}

export function MarkPicker({
  glyph,
  role,
  glyphIsOwn,
  roleIsOwn,
  onSelectGlyph,
  onSelectRole,
  autoFocus = false,
  className,
}: MarkPickerProps) {
  const [query, setQuery] = useState('')
  const families = useMemo(() => searchGlyphs(query), [query])

  return (
    <div className={cn('flex w-[268px] flex-col gap-3', className)}>
      {/* ── Glyph ──────────────────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={cn(kickerClass, 'text-mn-text-secondary')}>Glyph</h2>
        {glyphIsOwn && (
          <button
            type="button"
            onClick={() => onSelectGlyph(null)}
            className="font-mono text-[0.65rem] lowercase text-mn-text-secondary hover:text-mn-text"
          >
            reset
          </button>
        )}
      </div>

      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search"
        aria-label="Search glyphs"
        className="w-full rounded-mn-inner bg-mn-wash px-2 py-1 font-mono text-xs lowercase text-foreground outline-none placeholder:text-mn-text-secondary"
      />

      <div className="max-h-[220px] overflow-y-auto">
        {families.length === 0 && (
          <p className="font-mono text-xs text-mn-text-secondary">no glyph by that name</p>
        )}
        {families.map((family) => (
          <div key={family.name} className="mb-2">
            <p className="mb-1 font-mono text-[0.65rem] lowercase text-mn-text-secondary">
              {family.name}
            </p>
            <div className="flex flex-wrap gap-1">
              {family.glyphs.map((name) => {
                const selected = glyph === name
                return (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    aria-pressed={selected}
                    onClick={() => onSelectGlyph(name)}
                    // The swatch carries the CURRENT role, so the person sees the
                    // mark they would actually get, not a neutral silhouette.
                    style={{ color: markAccent(role) }}
                    className={cn(
                      'inline-flex size-7 flex-none items-center justify-center rounded-mn-inner',
                      selected ? 'bg-mn-selected-fill' : 'hover:bg-mn-hover-fill'
                    )}
                  >
                    <Icon name={name} size={15} />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Colour ─────────────────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-2 border-t border-mn-hair pt-3">
        <h2 className={cn(kickerClass, 'text-mn-text-secondary')}>Colour</h2>
        {roleIsOwn && (
          <button
            type="button"
            onClick={() => onSelectRole(null)}
            className="font-mono text-[0.65rem] lowercase text-mn-text-secondary hover:text-mn-text"
          >
            inherit
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {AREA_ROLES.map((r, i) => {
          const selected = role === r
          return (
            <button
              key={r}
              type="button"
              // NOT the token id: `area-a` is a build term, and §Vocabulary keeps
              // those out of product surfaces. Not a colour name either — naming
              // it "sage" would pin it to one theme, which is the whole reason
              // the column stores a role. A number is true under every theme.
              aria-label={`Area colour ${i + 1}`}
              aria-pressed={selected}
              onClick={() => onSelectRole(r)}
              className={cn(
                'inline-flex size-7 flex-none items-center justify-center rounded-mn-pill',
                selected ? 'bg-mn-selected-fill' : 'hover:bg-mn-hover-fill'
              )}
            >
              <span
                aria-hidden="true"
                className="size-[13px] rounded-mn-pill"
                style={{ background: areaRoleColor(r) }}
              />
            </button>
          )
        })}
        {!roleIsOwn && (
          // Says WHY the colour is what it is, so "inherit" is a state the person
          // can see rather than infer from the absence of a reset link.
          <span className="ml-1 font-mono text-[0.65rem] lowercase text-mn-text-secondary">
            {role === null ? 'no colour' : 'from its area'}
          </span>
        )}
      </div>
    </div>
  )
}
