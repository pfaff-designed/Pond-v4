'use client'

/**
 * The "you are here" trail in a surface header (Life › Health › Workout
 * Routines). Every ancestor crumb is a click target that navigates to that
 * page; Life leads back to the root overview. The current node is either a
 * quiet non-clickable tail (`current`) — used on overview surfaces where it
 * replaces the bare title label — or omitted entirely on the editor, where the
 * title stays an editable input and the breadcrumb shows only the ANCESTOR path.
 *
 * On a root page (no ancestors, no current) it reads just "Life", still
 * clickable so it stays a consistent home affordance.
 *
 * An area crumb whose title maps to a default glyph leads with that glyph in
 * the area hue (#91); page crumbs carry no mark.
 */

import { Fragment } from 'react'
import type { Crumb } from '@/lib/pages/overview'
import { pageAccent } from '@/lib/pages/accent'
import { areaGlyph } from '@/lib/rail/area-glyph'
import { AreaMark } from '@/components/atoms/AreaMark'

export interface BreadcrumbProps {
  /** Ancestor pages from root→parent; the current node is NOT included here. */
  crumbs: Crumb[]
  /** Navigate to a crumb (or, for Life, to the root when `crumb` is null). */
  onNavigate: (crumb: Crumb | null) => void
  /**
   * The current node's title, rendered as a non-clickable tail. Omit on the
   * editor surface, where the title input is the tail instead.
   */
  current?: string
  /** Label for the root crumb. Defaults to "Life". */
  rootLabel?: string
}

const sep = <span className="text-mn-text-meta/80 px-1.5 select-none">›</span>

export function Breadcrumb({ crumbs, onNavigate, current, rootLabel = 'Life' }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center flex-wrap font-mono text-mn-11 tracking-wider lowercase text-mn-text-faint min-w-0"
    >
      <button
        onClick={() => onNavigate(null)}
        className="hover:text-foreground transition-colors whitespace-nowrap"
      >
        {rootLabel}
      </button>
      {crumbs.map((c) => {
        const glyph = c.type === 'area' ? areaGlyph(c.title) : undefined
        // A whole area reads as one hue: colour by the top-level ancestor (the
        // first crumb), the rule accent.ts documents and the kicker square uses.
        const topId = crumbs[0].id
        return (
          <Fragment key={c.id}>
            {sep}
            <button
              onClick={() => onNavigate(c)}
              className="hover:text-foreground transition-colors inline-flex items-center gap-1 max-w-[180px] min-w-0"
              title={c.title}
            >
              {glyph && <AreaMark glyph={glyph} color={pageAccent(topId)} size={11} />}
              <span className="truncate">{c.title}</span>
            </button>
          </Fragment>
        )
      })}
      {current !== undefined && (
        <>
          {sep}
          <span
            aria-current="page"
            className="text-foreground truncate max-w-[220px]"
            title={current}
          >
            {current}
          </span>
        </>
      )}
    </nav>
  )
}
