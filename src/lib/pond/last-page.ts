/**
 * Deciding whether a `?nodeId=` change is this pond's own remembered page, to
 * write to `ponds.last_page_id` (`s6m6`). Pure — no React, no Supabase; the
 * provider (`context.tsx`) calls this from an effect on every render and
 * writes only when told to.
 */

import { isPageId } from '@/lib/pages/page-id'

/** One render's `?pond=` / `?nodeId=` pair, as the provider reads them. */
export interface LastPageRender {
  pondId: string | null
  nodeId: string | null
}

/**
 * `write: false` for no write. `write: true` carries the value to persist as
 * `last_page_id` — a page uuid, or `null` for a same-pond move back to the
 * root (distinct from "no write": the two need separate shapes, since a
 * legitimate write value is itself sometimes `null`).
 */
export type LastPageWrite = { write: false } | { write: true; lastPageId: string | null }

const NO_WRITE: LastPageWrite = { write: false }

/**
 * `previous` is the render before this one, or `null` on the first render (no
 * snapshot yet to compare against). `storedLastPageId` is the active pond's
 * current `last_page_id`, read off the pond list.
 *
 * No write: on the first render; on the render right after `pondId` itself
 * changed (its `nodeId` is the OLD pond's page, stale for the new one); when
 * `nodeId` did not change from `previous`; when `nodeId` is some other
 * non-page string (`CHANGE_LOG_NODE_ID` — the change log rides in `?nodeId=`
 * but is not a page the `last_page_id` FK can reference, so it is neither
 * written nor used to clear a remembered page); and when `nodeId` already
 * equals what is stored (covers null-equals-null too — nothing to clear).
 *
 * A same-pond move to the root (`nodeId` goes from a page to `null` — the
 * rail's "life" row, the breadcrumb home, or trashing the open page) writes
 * `null`, clearing the remembered page rather than leaving the old one.
 */
export function nextLastPageWrite(
  previous: LastPageRender | null,
  current: LastPageRender,
  storedLastPageId: string | null | undefined
): LastPageWrite {
  if (previous === null) return NO_WRITE
  if (previous.pondId !== current.pondId) return NO_WRITE
  if (current.nodeId === previous.nodeId) return NO_WRITE
  if (current.nodeId !== null && !isPageId(current.nodeId)) return NO_WRITE
  if (current.nodeId === (storedLastPageId ?? null)) return NO_WRITE
  return { write: true, lastPageId: current.nodeId }
}
