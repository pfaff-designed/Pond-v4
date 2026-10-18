'use client'

/**
 * Session marks an accept leaves on a page's rows/blocks (KAN-143).
 *
 * "shown" is tracked per page, not per mark: a mark is shown on the view the
 * accept happened on (or the first open after it, if elsewhere), and clears on
 * the following open. `consumeOnOpen` is the one place that reads+clears, so
 * callers never roll their own open-count bookkeeping — see `DocumentPanel`'s
 * StrictMode hazard: a mount's cleanup+remount must not count as a second open.
 *
 * Session-scoped like `session-undo.ts`: in memory only, gone on reload.
 */

import { useSyncExternalStore } from 'react'

export interface AcceptMark {
  target: string
  recordId: string
  acceptedAt: string
}

interface PageMarks {
  marks: AcceptMark[]
  shown: boolean
}

const pages = new Map<string, PageMarks>()
const mountedPages = new Set<string>()
const listeners = new Set<() => void>()
const EMPTY: AcceptMark[] = []

const notify = () => {
  for (const listener of listeners) listener()
}

/** Tracks whether `pageId`'s view is currently mounted. Call on mount, release on unmount. */
export const registerPageOpen = (pageId: string): (() => void) => {
  mountedPages.add(pageId)
  return () => {
    mountedPages.delete(pageId)
  }
}

export const recordAccept = (
  pageId: string,
  targets: string[],
  recordId: string,
  acceptedAt: string
): void => {
  if (targets.length === 0) return
  const existing = pages.get(pageId) ?? { marks: [], shown: false }
  const byTarget = new Map(existing.marks.map((mark) => [mark.target, mark]))
  for (const target of targets) byTarget.set(target, { target, recordId, acceptedAt })
  pages.set(pageId, { marks: [...byTarget.values()], shown: mountedPages.has(pageId) })
  notify()
}

/** Call once per mount, after `registerPageOpen`. Returns this open's marks, clearing them if this is the second-or-later open since they were set. */
export const consumeOnOpen = (pageId: string): AcceptMark[] => {
  const page = pages.get(pageId)
  if (!page) return EMPTY
  if (page.shown) {
    pages.delete(pageId)
    notify()
    return EMPTY
  }
  page.shown = true
  notify()
  return page.marks
}

export const removeByRecordId = (recordId: string): void => {
  let changed = false
  for (const [pageId, page] of pages) {
    const kept = page.marks.filter((mark) => mark.recordId !== recordId)
    if (kept.length === page.marks.length) continue
    changed = true
    if (kept.length === 0) pages.delete(pageId)
    else pages.set(pageId, { ...page, marks: kept })
  }
  if (changed) notify()
}

export const clear = (): void => {
  pages.clear()
  mountedPages.clear()
  notify()
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The page's current marks, live — reactive via `useAcceptMarks`, or read directly in tests. */
export const getSnapshot = (pageId: string): AcceptMark[] => pages.get(pageId)?.marks ?? EMPTY

export const useAcceptMarks = (pageId: string): AcceptMark[] =>
  useSyncExternalStore(
    subscribe,
    () => getSnapshot(pageId),
    () => EMPTY
  )
