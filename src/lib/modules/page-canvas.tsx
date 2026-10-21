'use client'

/**
 * The page canvas: the one element every view block on a page draws against, and the
 * owner of what is true of the page as a whole rather than of any one view.
 *
 *  - **The orange `today` pill is the screen's one dated mark.** Each view offers the
 *    record it would paint; the canvas awards the pill to the first offer in document
 *    order, so two views holding records due today still show exactly one orange.
 *  - **One record peek per page.** Selecting in one view releases the peek of another.
 *  - **The peek's surface.** It portals into the canvas element and positions against
 *    it, so no block's overflow can clip it.
 *
 * Outside a canvas (a diff card, a story) a view owns its own pill and peek.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { composerScrollPadding } from '@/lib/layout/composer-clearance'

interface TodayClaim {
  el: HTMLElement
  rowId: string
}

interface PageCanvasValue {
  element: HTMLElement | null
  /** The key of the view whose peek is open, or null. */
  activePeek: string | null
  setActivePeek: (update: (current: string | null) => string | null) => void
  claimToday: (viewKey: string, claim: TodayClaim | null) => void
  todayWinner: { viewKey: string; rowId: string } | null
}

const PageCanvasContext = createContext<PageCanvasValue | null>(null)

export const usePageCanvas = () => useContext(PageCanvasContext)

const inDocumentOrder = (a: TodayClaim, b: TodayClaim) =>
  a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1

export function PageCanvas({ className, children }: { className?: string; children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const [activePeek, setActivePeek] = useState<string | null>(null)
  const [claims, setClaims] = useState<ReadonlyMap<string, TodayClaim>>(new Map())

  const claimToday = useCallback((viewKey: string, claim: TodayClaim | null) => {
    setClaims((current) => {
      const next = new Map(current)
      if (claim) next.set(viewKey, claim)
      else next.delete(viewKey)
      return next
    })
  }, [])

  const todayWinner = useMemo(() => {
    const first = [...claims].sort(([, a], [, b]) => inDocumentOrder(a, b))[0]
    return first ? { viewKey: first[0], rowId: first[1].rowId } : null
  }, [claims])

  const value = useMemo(
    () => ({ element, activePeek, setActivePeek, claimToday, todayWinner }),
    [element, activePeek, claimToday, todayWinner]
  )

  return (
    <div
      ref={setElement}
      data-part="page-canvas"
      className={['relative', className].filter(Boolean).join(' ')}
      style={composerScrollPadding()}
    >
      <PageCanvasContext.Provider value={value}>{children}</PageCanvasContext.Provider>
    </div>
  )
}

/**
 * The record that wears the orange pill in this view, if any. `candidateId` is the
 * record the view would paint (its own first open one due today); on a page canvas the
 * pill goes to the first view in document order that offers one.
 */
export function useOrangeToday(
  viewKey: string,
  rootRef: RefObject<HTMLElement | null>,
  candidateId: string | undefined
): string | undefined {
  const canvas = usePageCanvas()
  const claimToday = canvas?.claimToday
  useEffect(() => {
    const el = rootRef.current
    if (!claimToday || !el || !candidateId) return
    claimToday(viewKey, { el, rowId: candidateId })
    return () => claimToday(viewKey, null)
  }, [claimToday, viewKey, rootRef, candidateId])

  if (!canvas) return candidateId
  return canvas.todayWinner?.viewKey === viewKey ? canvas.todayWinner.rowId : undefined
}
