'use client'

/**
 * `ViewNotice` — the calm placeholder every non-drawing view state shares: loading,
 * "this isn't a collection", a board with no group-by, a chart kind with no renderer
 * yet. Its own module so both `view.tsx` and `figures.tsx` can use it without one
 * importing the other.
 */

/** A calm placeholder — the shared shell for every non-drawing state. */
export function ViewNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-mn-inner bg-mn-wash px-4 py-6 text-center text-sm text-mn-text-secondary">
      {children}
    </div>
  )
}
