'use client'

/**
 * A page's mark, made clickable (issue #134) — the inline affordance the design
 * asks for: "the user simply clicks the icon and can change it and the hue."
 *
 * Mirrors `BacklinksPanel` / `PageChangesPanel`: this organism touches data, the
 * `MarkPicker` molecule stays presentational.
 *
 * WHERE THIS IS USED, AND WHERE IT IS NOT. The breadcrumb and the overview
 * kicker, both of which sit on the OPEN page, where "this page's mark" is
 * unambiguous. Not the rail: a rail row is a navigation target end to end, and a
 * click zone inside it either steals the navigation or needs a modifier — a
 * click 2px left of a page name doing something entirely different from a click
 * on it. The rail keeps rendering the plain `AreaMark`.
 *
 * A page with NO glyph renders nothing here and stays un-clickable, because there
 * is no mark to click: the surface shows its `KindDot` as it always has. Giving
 * a glyph to a page that has none is a job for the page menu, which does not
 * exist yet (the same gap #103's panel met).
 *
 * CRITICAL: the Supabase client is built lazily INSIDE the callback, never at
 * render, so an envless mount (Storybook, CI) never constructs a real client and
 * throws — the convention `use-backlinks` and `DocumentPanel` follow.
 */

import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AreaMark } from '@/components/atoms/AreaMark'
import { MarkPicker } from '@/components/molecules/MarkPicker'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { useWorkspace } from '@/lib/workspace/context'
import { setPageMark } from '@/lib/pages/client'
import { areaRoleColor, type AreaRole } from '@/lib/rail/glyph-library'
import { markIndex, resolveMark, type PageMark } from '@/lib/pages/mark'
import { cn } from '@/lib/utils'

export interface PageMarkButtonProps {
  pageId: string
  /** The resolved mark, from `resolveMark`. */
  mark: PageMark
  /** Glyph size in px, matching whatever the host surface used. @default 13 */
  size?: number
  className?: string
}

export function PageMarkButton({ pageId, mark, size = 13, className }: PageMarkButtonProps) {
  const getSupabase = useLazySupabase()
  const workspace = useWorkspace()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const write = useCallback(
    async (patch: { glyph?: string | null; areaRole?: string | null }) => {
      try {
        await setPageMark(getSupabase(), pageId, patch)
      } catch (err) {
        // Surfaced in the console rather than swallowed: this is what the person
        // just asked for, and the invalidation below will snap the mark back to
        // what the database actually holds, so the UI never lies about it.
        console.error('[mark] could not write the page mark', pageId, err)
      }
      // The mark rides the shared ['pages'] cache every surface reads, so one
      // invalidation moves the rail, the breadcrumb and the kicker together.
      await queryClient.invalidateQueries({ queryKey: ['pages', workspace] })
    },
    [getSupabase, pageId, queryClient, workspace]
  )

  // Nothing to click. The host surface falls back to its KindDot exactly as before.
  if (mark.glyph === null) return null

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label="Change this page’s mark"
        aria-expanded={open}
        onClick={(e) => {
          // The breadcrumb crumb is itself a navigation button; without this a
          // click on the mark would also navigate.
          e.stopPropagation()
          e.preventDefault()
          setOpen((v) => !v)
        }}
        className="inline-flex items-center rounded-mn-hair hover:bg-mn-hover-fill"
      >
        <AreaMark glyph={mark.glyph} color={areaRoleColor(mark.role)} size={size} />
      </button>

      {open && (
        <>
          {/* Click-away. Pointer only — Escape is handled on the popup. */}
          <span aria-hidden="true" className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Paper, not frames: it floats on shadow alone (AGENTS.md). */}
          <div
            role="dialog"
            aria-label="Page mark"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
            className="absolute left-0 top-full z-50 mt-1 rounded-mn-card bg-mn-surface p-3 shadow-mn-lg"
          >
            <MarkPicker
              glyph={mark.glyph}
              role={mark.role}
              glyphIsOwn={mark.glyphIsOwn}
              roleIsOwn={mark.roleIsOwn}
              onSelectGlyph={(glyph) => void write({ glyph })}
              onSelectRole={(areaRole: AreaRole | null) => void write({ areaRole })}
            />
          </div>
        </>
      )}
    </span>
  )
}

/**
 * The breadcrumb's lead mark — the top-level crumb's, since that is the area the
 * trail starts in and the mark the trail has always shown.
 *
 * Here rather than at each call site because both the editor and the area
 * overview render a `Breadcrumb`, and two copies of "resolve the first crumb's
 * mark" would be two places to get the inheritance walk wrong.
 */
export function CrumbMark({
  rows,
  crumbs,
  size = 11,
}: {
  rows: readonly {
    id: string
    parent_id: string | null
    title: string
    glyph?: string | null
    area_role?: string | null
  }[]
  crumbs: readonly { id: string }[]
  size?: number
}) {
  const first = crumbs[0]
  const mark = useMemo(() => (first ? resolveMark(first.id, markIndex(rows)) : null), [first, rows])
  if (!first || !mark) return null
  return <PageMarkButton pageId={first.id} mark={mark} size={size} />
}
