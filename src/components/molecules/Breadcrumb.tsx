'use client'

/**
 * The "you are here" trail (life › creativity › recipes) — a floating
 * glass PILL over the canvas, per `Pond 02` 2t: the pond's mark, the ancestor
 * crumbs at the 68 tier, › separators at 80, the current node in full ink, then
 * a hairline divider and the ⌘K chip. PP Neue Montreal 500 at 11, .04em.
 * Measured in `Pond 05 Shell`: 40px tall, padding 8px 8px 8px 14px, gap 10,
 * radius 999; the chip 4px 9px on a 16px line. Where the pill SITS is the
 * shell's business (lib/layout/breadcrumb-slot), not this molecule's.
 *
 * Every crumb is a click target that navigates to that page; the root crumb
 * leads back to the root page. The current node is either a quiet
 * non-clickable tail (`current`), a caller-supplied `tail`, or omitted on the
 * page surface, where the title input is the tail and the pill shows only the
 * ANCESTOR path.
 *
 * On a root page (no ancestors, no current) it reads just "life", still
 * clickable so it stays a consistent home affordance. Every segment is written
 * lowercase on the board (`Pond 06.10`, measured), and a crumb's own text is its
 * page title verbatim — nothing here title-cases anything.
 *
 * #101 review / ADR 0003: WHICH root the pill starts at is the page's own
 * business, not this molecule's. `root` carries it when that root is a real page
 * — the `databases` root, 3c's second root, which a click can then open — and
 * otherwise the root is life's synthetic workspace root: `rootLabel`, and a
 * `null` navigate. `lib/pages/crumbs`' `crumbTrail` resolves it, and its
 * `CrumbTrail` is exactly `{ root, crumbs }` so a caller can spread one trail.
 *
 * The top-level crumb — the area the trail starts in — leads with that area's
 * mark; deeper crumbs carry none. (#108: there is no `type = 'area'` to test;
 * the first crumb IS the top-level ancestor, which is where a person's areas
 * live.)
 *
 * #134: the mark is INJECTED as `leadMark`, not derived here. It became a
 * clickable control that writes to the database, and a presentational molecule
 * has no business owning that — the connected `CrumbMark` supplies it.
 *
 * #96 / ADR 0002: the ⌘K affordance is single-user and stays; presence and
 * access states ("only you", "ana here") are M2 and are not drawn.
 */

import { Fragment, type ReactNode } from 'react'
import { PondMark } from '@/components/atoms/PondMark'
import type { Crumb } from '@/lib/pages/crumbs'

export interface BreadcrumbProps {
  /** Ancestor pages from root→parent; the current node is NOT included here. */
  crumbs: Crumb[]
  /** Navigate to a crumb (or, for life, to the root page when `crumb` is null). */
  onNavigate: (crumb: Crumb | null) => void
  /**
   * The current node's title, rendered as a non-clickable tail. Omit on the
   * editor surface, where the title input is the tail instead.
   */
  current?: string
  /** A custom tail rendered inside the pill in place of `current`. */
  tail?: ReactNode
  /** Label for the root crumb when it is life's synthetic root. Lowercase, as drawn. */
  rootLabel?: string
  /**
   * The trail's root as a real page — the `databases` root (3c). Given, the root
   * reads its title and a click OPENS it; omitted (or null), the root is life's.
   */
  root?: Crumb | null
  /** The top-level crumb's mark (#134). Omit and the trail carries none. */
  leadMark?: ReactNode
  /** Opens the command palette. When given, the pill ends in the ⌘K chip (2t). */
  onCommandK?: () => void
}

const sep = (
  <span className="text-mn-text-meta select-none" aria-hidden>
    ›
  </span>
)

export function Breadcrumb({
  crumbs,
  onNavigate,
  current,
  tail,
  rootLabel = 'life',
  root,
  leadMark,
  onCommandK,
}: BreadcrumbProps) {
  const hasTail = tail !== undefined || current !== undefined
  return (
    <nav
      aria-label="Breadcrumb"
      className="mn-glass rounded-mn-pill inline-flex h-10 max-w-full min-w-0 items-center gap-2.5 py-2 pr-2 pl-3.5 font-sans text-mn-11 font-medium tracking-[0.04em] whitespace-nowrap text-foreground"
    >
      {/* The pond's mark leads the trail (2t) at 12 — the same mark the rail
          head draws at 13. Not an AreaMark: the pond is not an area, and #134's
          lead mark stays the only one. */}
      <PondMark size={12} />
      <button
        onClick={() => onNavigate(root ?? null)}
        className="text-mn-text-secondary hover:text-foreground transition-colors whitespace-nowrap"
        title={root?.title}
      >
        {root ? root.title : rootLabel}
      </button>
      {crumbs.map((c, i) => {
        return (
          <Fragment key={c.id}>
            {sep}
            {/* The mark sits BESIDE the crumb, never inside it: a crumb is a
                <button> and the mark is a <button>, and a nested button is
                invalid HTML that React reports as a hydration error. Caught
                live, in the console, not by any test. */}
            <span className="inline-flex min-w-0 max-w-[180px] items-center gap-1">
              {i === 0 && leadMark}
              <button
                onClick={() => onNavigate(c)}
                className="text-mn-text-secondary hover:text-foreground transition-colors min-w-0 truncate"
                title={c.title}
              >
                {c.title}
              </button>
            </span>
          </Fragment>
        )
      })}
      {hasTail && (
        <>
          {sep}
          {tail !== undefined ? (
            tail
          ) : (
            <span
              aria-current="page"
              className="text-foreground truncate max-w-[220px]"
              title={current}
            >
              {current}
            </span>
          )}
        </>
      )}
      {onCommandK && (
        <>
          <span className="h-3.5 w-px flex-none bg-mn-line" aria-hidden />
          <button
            type="button"
            onClick={onCommandK}
            title="Command palette (⌘K)"
            aria-label="Command palette (⌘K)"
            className="rounded-mn-pill bg-mn-hover-fill px-[9px] py-1 leading-4 text-mn-text-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            ⌘K
          </button>
        </>
      )}
    </nav>
  )
}
