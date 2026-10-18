'use client'

/**
 * Session marks an accept leaves on a page's rows/blocks (KAN-143).
 *
 * "seen" is tracked per mark, not per page: a mark is born seen if its page is
 * mounted right now (it's already visible live, no reopen needed), otherwise
 * unseen until the page's first open after the accept. `consumeOnOpen` is the
 * one place that reads+clears: it drops every already-seen mark (this is their
 * following open) and returns the unseen ones, marking them seen so the NEXT
 * open drops them too. Per-mark state means one page's older, already-shown
 * mark and a newer, not-yet-shown mark (from an accept elsewhere while the
 * page was closed) clear independently — see `DocumentPanel`'s StrictMode
 * hazard: a mount's cleanup+remount must not count as a second open.
 *
 * Session-scoped like `session-undo.ts`: in memory only, gone on reload.
 */

import { useSyncExternalStore } from 'react'

export interface AcceptMark {
  target: string
  /** Null when the accept had no undoable change-log record (KAN-93's
   *  BLOCK_ACTIONS gate) — the mark still shows, it just never clears via
   *  `removeByRecordId` since there is nothing `sessionUndo` can undo. */
  recordId: string | null
  acceptedAt: string
}

interface StoredMark extends AcceptMark {
  seen: boolean
}

const toPublic = ({ target, recordId, acceptedAt }: StoredMark): AcceptMark => ({
  target,
  recordId,
  acceptedAt,
})

const pages = new Map<string, StoredMark[]>()
const mountedPages = new Set<string>()
const listeners = new Set<() => void>()
const EMPTY: AcceptMark[] = []

/** `useSyncExternalStore` requires `getSnapshot` to return a cached array when
 *  nothing changed, or it loops forever re-rendering. Cache the public-shape
 *  list per stored-marks array reference, so it's only rebuilt when the
 *  stored marks actually change (a fresh array is set into `pages`). */
const publicCache = new WeakMap<StoredMark[], AcceptMark[]>()

const toPublicList = (marks: StoredMark[]): AcceptMark[] => {
  const cached = publicCache.get(marks)
  if (cached) return cached
  const built = marks.map(toPublic)
  publicCache.set(marks, built)
  return built
}

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
  recordId: string | null,
  acceptedAt: string
): void => {
  if (targets.length === 0) return
  const seen = mountedPages.has(pageId)
  const existing = pages.get(pageId) ?? []
  const byTarget = new Map(existing.map((mark) => [mark.target, mark]))
  for (const target of targets) byTarget.set(target, { target, recordId, acceptedAt, seen })
  pages.set(pageId, [...byTarget.values()])
  notify()
}

/** Call once per mount, after `registerPageOpen`. Returns this open's marks: drops every mark already seen (their following open), keeps and marks seen every mark not yet seen (their first display). */
export const consumeOnOpen = (pageId: string): AcceptMark[] => {
  const marks = pages.get(pageId)
  if (!marks) return EMPTY
  const unseen = marks.filter((mark) => !mark.seen)
  if (unseen.length === 0) {
    pages.delete(pageId)
    notify()
    return EMPTY
  }
  const updated = unseen.map((mark) => ({ ...mark, seen: true }))
  pages.set(pageId, updated)
  notify()
  return toPublicList(updated)
}

export const removeByRecordId = (recordId: string): void => {
  let changed = false
  for (const [pageId, marks] of pages) {
    const kept = marks.filter((mark) => mark.recordId !== recordId)
    if (kept.length === marks.length) continue
    changed = true
    if (kept.length === 0) pages.delete(pageId)
    else pages.set(pageId, kept)
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
export const getSnapshot = (pageId: string): AcceptMark[] => {
  const marks = pages.get(pageId)
  return marks ? toPublicList(marks) : EMPTY
}

export const useAcceptMarks = (pageId: string): AcceptMark[] =>
  useSyncExternalStore(
    subscribe,
    () => getSnapshot(pageId),
    () => EMPTY
  )
