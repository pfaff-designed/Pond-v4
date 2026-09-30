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
 * The top-level crumb — the area the trail starts in — leads with that area's
 * mark; deeper crumbs carry none. (#108: there is no `type = 'area'` to test;
 * the first crumb IS the top-level ancestor, which is where a person's areas
 * live.)
 *
 * #134: the mark is INJECTED as `leadMark`, not derived here. It became a
 * clickable control that writes to the database, and a presentational molecule
 * has no business owning that — the connected `CrumbMark` supplies it.
 */

import { Fragment, type ReactNode } from 'react'
import type { Crumb } from '@/lib/pages/overview'

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
  /** The top-level crumb's mark (#134). Omit and the trail carries none. */
  leadMark?: ReactNode
}

const sep = <span className="text-mn-text-meta/80 px-1.5 select-none">›</span>

export function Breadcrumb({
  crumbs,
  onNavigate,
  current,
  rootLabel = 'Life',
  leadMark,
}: BreadcrumbProps) {
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
      {crumbs.map((c, i) => {
        return (
          <Fragment key={c.id}>
            {sep}
            <button
              onClick={() => onNavigate(c)}
              className="hover:text-foreground transition-colors inline-flex items-center gap-1 max-w-[180px] min-w-0"
              title={c.title}
            >
              {i === 0 && leadMark}
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
