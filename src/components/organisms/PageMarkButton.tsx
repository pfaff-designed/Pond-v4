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
 * A PAGE WITH NO GLYPH IS STILL CLICKABLE, and it shows its `KindDot` — which is
 * its mark, just the other register (a shape-and-colour code rather than a
 * silhouette; see `KindDot`'s header). An earlier build returned null here and
 * live verification showed why that was wrong: only the six SEEDED areas have a
 * title-derived glyph, so every other page — including every area a person makes
 * themselves — would have had no icon to click and therefore no way to ever get
 * one. "Any page" has to mean any page.
 *
 * THE POPOVER IS PORTALLED, and has to be. Every `Rise` wrapper on an overview
 * surface carries `animation: … both`, so it keeps its final transform and is
 * permanently its own STACKING CONTEXT. A child of an earlier Rise therefore
 * cannot paint above a later sibling Rise whatever z-index it is given: an
 * absolutely-positioned popover rendered in place sat UNDER the focal numeral's
 * caption, which silently swallowed every click on the glyph grid. Found by
 * clicking it, not by reading it.
 *
 * CRITICAL: the Supabase client is built lazily INSIDE the callback, never at
 * render, so an envless mount (Storybook, CI) never constructs a real client and
 * throws — the convention `use-backlinks` and `DocumentPanel` follow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AreaMark } from '@/components/atoms/AreaMark'
import { KindDot } from '@/components/atoms/KindDot'
import { MarkPicker } from '@/components/molecules/MarkPicker'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { useWorkspace } from '@/lib/workspace/context'
import { setPageMark } from '@/lib/pages/client'
import { areaRoleColor, type AreaRole } from '@/lib/rail/glyph-library'
import { markIndex, resolveMark, type PageMark } from '@/lib/pages/mark'

/** The row shape `markIndex` consumes — named so callers stop re-declaring it. */
export type MarkRow = {
  id: string
  parent_id: string | null
  title: string
  glyph?: string | null
  area_role?: string | null
}
import { cn } from '@/lib/utils'

export interface PageMarkButtonProps {
  pageId: string
  /**
   * The page this mark belongs to, for the button's label.
   *
   * An overview carries TWO of these at once — the kicker's, for the open page,
   * and the breadcrumb's, for the area the trail starts in — and they edit
   * different pages. Both said "Change this page's mark", which is ambiguous to
   * a screen reader and was outright wrong on the breadcrumb.
   */
  pageTitle: string
  /** The resolved mark, from `resolveMark`. */
  mark: PageMark
  /** Glyph size in px, matching whatever the host surface used. @default 13 */
  size?: number
  className?: string
}

export function PageMarkButton({
  pageId,
  pageTitle,
  mark,
  size = 13,
  className,
}: PageMarkButtonProps) {
  const getSupabase = useLazySupabase()
  const workspace = useWorkspace()
  const queryClient = useQueryClient()
  const trigger = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const open = at !== null
  const popover = useRef<HTMLDivElement>(null)

  /** Close and leave focus alone — for a close the person did not ask for. */
  const close = useCallback(() => setAt(null), [])

  /**
   * Close AND hand focus back to the trigger — for Escape, click-away, or a second
   * click on the mark.
   *
   * Split from {@link close} because `close` is also the scroll and resize
   * handler. Round two restored focus unconditionally there, so SCROLLING while
   * focus sat in the editor closed the popover and yanked the caret onto the mark
   * mid-keystroke — and the next Space re-opened it. Only reclaim focus the
   * popover actually holds; `preventScroll` so returning to a trigger that has
   * scrolled out of view does not jump the page back.
   */
  const dismiss = useCallback(() => {
    const active = document.activeElement
    const held = active !== null && popover.current?.contains(active) === true
    setAt(null)
    if (held) trigger.current?.focus({ preventScroll: true })
  }, [])

  // The popover lives in a portal, so it has no layout relationship to its
  // trigger — it is anchored to the trigger's viewport rect instead. A scroll or
  // resize would strand it, so it closes rather than drifting.
  //
  // Escape is bound to the DOCUMENT, not to the popup. A React portal bubbles
  // through the REACT tree, but focus stays on the trigger, which is a SIBLING of
  // the portal and not a descendant — so an `onKeyDown` on the dialog never fired
  // unless the person had already clicked inside it. Probed, and it did nothing.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        dismiss()
      }
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close, dismiss])

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

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        ref={trigger}
        type="button"
        aria-label={`Change the mark for ${pageTitle}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          // The breadcrumb crumb is itself a navigation button; without this a
          // click on the mark would also navigate.
          e.stopPropagation()
          e.preventDefault()
          if (open) return dismiss()
          const r = trigger.current?.getBoundingClientRect()
          setAt(r ? { left: r.left, top: r.bottom + 4 } : { left: 0, top: 0 })
        }}
        className="inline-flex items-center rounded-mn-hair hover:bg-mn-hover-fill"
      >
        {mark.glyph === null ? (
          <KindDot accent={areaRoleColor(mark.role)} />
        ) : (
          <AreaMark glyph={mark.glyph} color={areaRoleColor(mark.role)} size={size} />
        )}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* Click-away. Pointer only — Escape is handled on the popup. */}
            <div aria-hidden="true" className="fixed inset-0 z-[90]" onClick={dismiss} />
            {/* Paper, not frames: it floats on shadow alone (AGENTS.md). */}
            <div
              ref={popover}
              role="dialog"
              aria-modal="false"
              aria-label={`Mark for ${pageTitle}`}
              style={{ left: at.left, top: at.top }}
              className="mn-glass fixed z-[100] rounded-mn-card p-3"
            >
              <MarkPicker
                autoFocus
                glyph={mark.glyph}
                role={mark.role}
                glyphIsOwn={mark.glyphIsOwn}
                roleIsOwn={mark.roleIsOwn}
                onSelectGlyph={(glyph) => void write({ glyph })}
                onSelectRole={(areaRole: AreaRole | null) => void write({ areaRole })}
              />
            </div>
          </>,
          document.body
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
  rows: readonly MarkRow[]
  crumbs: readonly { id: string; title: string }[]
  size?: number
}) {
  const first = crumbs[0]
  const mark = useMemo(() => (first ? resolveMark(first.id, markIndex(rows)) : null), [first, rows])
  if (!first || !mark) return null
  return <PageMarkButton pageId={first.id} pageTitle={first.title} mark={mark} size={size} />
}
