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
 */

import { Fragment } from 'react'
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
}

const sep = <span className="text-press-faint/60 px-1.5 select-none">›</span>

export function Breadcrumb({ crumbs, onNavigate, current, rootLabel = 'Life' }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center flex-wrap font-mono text-[11px] tracking-[0.14em] uppercase text-press-faint min-w-0"
    >
      <button
        onClick={() => onNavigate(null)}
        className="hover:text-foreground transition-colors whitespace-nowrap"
      >
        {rootLabel}
      </button>
      {crumbs.map((c) => (
        <Fragment key={c.id}>
          {sep}
          <button
            onClick={() => onNavigate(c)}
            className="hover:text-foreground transition-colors truncate max-w-[180px]"
            title={c.title}
          >
            {c.title}
          </button>
        </Fragment>
      ))}
      {current !== undefined && (
        <>
          {sep}
          <span
            aria-current="page"
            className="text-press-body truncate max-w-[220px]"
            title={current}
          >
            {current}
          </span>
        </>
      )}
    </nav>
  )
}
