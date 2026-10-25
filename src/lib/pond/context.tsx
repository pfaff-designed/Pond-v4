'use client'

/**
 * Who supplies the active pond (#312, #313).
 *
 * One place resolves it — from `?pond=`, falling back to the first pond in
 * switcher order — and every surface reads it from here instead of re-deriving.
 * The switcher reads the same list, so the shell fetches ponds once.
 *
 * `usePondId()` returns `null` when there is no provider, which is deliberate:
 * four test suites and several stories render the rail outside the shell, and a
 * context that threw there would make this change far wider than it needs to be.
 * Callers treat null as "not scoped yet" and keep their previous behaviour.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { listPonds, setPondLastPage, type Pond } from './client'
import { resolveActivePond, useActivePondId } from './active'
import { nextLastPageWrite, type LastPageRender } from './last-page'
import { applyPondTheme } from '@/lib/theme/mode'

export interface PondContextValue {
  /** The active pond, or null before the list has loaded. */
  pond: Pond | null
  ponds: Pond[]
  /** True until the first load settles — surfaces wait rather than query unscoped. */
  loading: boolean
  reload: () => void
  /**
   * Put a just-created pond into the list immediately, so navigating to it never
   * races the refetch. Without this the URL names a pond the list does not have
   * yet and `resolveActivePond` returns null — the shell would flash unscoped.
   */
  addPond: (pond: Pond) => void
  /**
   * Update a pond's `name`/`glyph` in the in-memory list only — no network
   * call (KAN-492). The write itself is the caller's job (`updatePond`); this
   * is the local half, so every reader of `usePond()` sees the change the
   * instant it is called, same as `addPond`.
   */
  patchPond: (pondId: string, patch: Partial<Pick<Pond, 'name' | 'glyph' | 'favouritePageIds'>>) => void
  /**
   * Drop a just-deleted pond from the in-memory list only — no network call
   * (KAN-493). The write itself is the caller's job (`softDeletePond`); this
   * is the local half, so the switcher never shows a soft-deleted pond while
   * waiting on a refetch, same as `addPond`/`patchPond`.
   */
  removePond: (pondId: string) => void
}

/** Exported so a story can stand a pond list in without a Supabase round trip. */
export const PondContext = createContext<PondContextValue>({
  pond: null,
  ponds: [],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
  removePond: () => {},
})

export function PondProvider({ children }: { children: React.ReactNode }) {
  const [ponds, setPonds] = useState<Pond[]>([])
  const [loading, setLoading] = useState(true)
  // A nonce rather than a function that sets state: `reload()` is called from an
  // effect, and setting state synchronously inside one triggers the cascading
  // render that `react-hooks/set-state-in-effect` exists to stop. Bumping a
  // dependency re-runs the fetch, and only its callbacks touch state.
  const [nonce, setNonce] = useState(0)
  const activeId = useActivePondId()
  const nodeId = useSearchParams().get('nodeId')
  // The render before this one, so `nextLastPageWrite` can tell a same-pond
  // `nodeId` change from the stale page name carried over right after a
  // pond switch. Null across remounts (tests, story swaps) is correct: that
  // reads as "no snapshot yet", never a write.
  const previousRenderRef = useRef<LastPageRender | null>(null)
  // The pond id from the render before this one, for telling an in-session
  // switch from the first resolved pond (mount / page load). Null across
  // remounts is correct here too: it reads as "no previous pond", never a
  // switch, so the first pond a fresh mount resolves to never applies its
  // theme — only a later change away from a non-null id does.
  const previousPondIdRef = useRef<string | null>(null)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const addPond = useCallback((pond: Pond) => {
    // Sorted insert, not append: a restore (KAN-493) hands back a pond whose
    // `order` sits BEFORE rows already in the list, and the switcher must show
    // it at that old position, not at the end — the same ascending-by-`order`
    // rule `listPonds`' own `.order('order')` already applies server-side. A
    // freshly created pond's `order` is already the list's max (`createPond`),
    // so for that caller a sorted insert and an append land in the same place.
    setPonds((rows) =>
      rows.some((r) => r.id === pond.id)
        ? rows
        : [...rows, pond].sort((a, b) => a.order - b.order)
    )
  }, [])

  const patchPond = useCallback((pondId: string, patch: Partial<Pick<Pond, 'name' | 'glyph' | 'favouritePageIds'>>) => {
    // A blank name is impossible here: every caller (the rename editor's
    // `handleSave`, its rejection rollback) already guards against one before
    // calling in. Crash early in dev; in production, drop the patch rather
    // than committing a pond with no name (AGENTS.md 'Crash early').
    if (patch.name !== undefined && !patch.name.trim()) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error('patchPond: a pond needs a name')
      }
      return
    }
    setPonds((rows) => rows.map((row) => (row.id === pondId ? { ...row, ...patch } : row)))
  }, [])

  const removePond = useCallback((pondId: string) => {
    setPonds((rows) => rows.filter((row) => row.id !== pondId))
  }, [])

  useEffect(() => {
    let cancelled = false
    listPonds()
      .then((rows) => {
        if (!cancelled) setPonds(rows)
      })
      // Before migration 0018 is applied `ponds` answers PGRST205 and listPonds
      // returns [] — the shell then behaves exactly as it did before ponds existed.
      .catch(() => {
        if (!cancelled) setPonds([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nonce])

  const pond = resolveActivePond(ponds, activeId)

  // `s6m6`'s write: a `?nodeId=` change within the SAME pond is remembered as
  // that pond's `last_page_id`. `nextLastPageWrite` is the pure decision;
  // this effect only carries the render snapshot and fires the write it
  // returns. The in-memory `ponds` row is updated too — `addPond`'s reasoning
  // — so switching away and back in one session reads the fresh value rather
  // than racing a refetch.
  useEffect(() => {
    const current: LastPageRender = { pondId: pond?.id ?? null, nodeId }
    const decision = nextLastPageWrite(previousRenderRef.current, current, pond?.lastPageId)
    previousRenderRef.current = current
    if (!decision.write || !current.pondId) return

    const targetPondId = current.pondId
    const toWrite = decision.lastPageId
    setPonds((rows) =>
      rows.map((row) => (row.id === targetPondId ? { ...row, lastPageId: toWrite } : row))
    )
    setPondLastPage(targetPondId, toWrite).catch((error) => {
      console.error('[pond/last-page] write not persisted', targetPondId, toWrite, error)
    })
  }, [pond?.id, pond?.lastPageId, nodeId])

  // Applies the pond's theme only when `pond.id` actually changed from a
  // previously resolved (non-null) id — an in-session switch, never the first
  // pond a mount resolves to. The ref only ever advances to a non-null id, so
  // a stale `?pond=` that resolves to null (between two real ponds) can't
  // erase the last real one and make the next real switch read as a first
  // load. `applyPondTheme` restores the person's own stored mode for a pond
  // with no chosen theme, and applies the explicit one otherwise.
  useEffect(() => {
    const currentId = pond?.id ?? null
    const currentTheme = pond?.theme ?? null
    const previousId = previousPondIdRef.current
    if (currentId !== null) previousPondIdRef.current = currentId
    if (previousId !== null && currentId !== null && previousId !== currentId && currentTheme !== null) {
      applyPondTheme(currentTheme)
    }
  }, [pond?.id, pond?.theme])

  const value = useMemo(
    () => ({ pond, ponds, loading, reload, addPond, patchPond, removePond }),
    [pond, ponds, loading, reload, addPond, patchPond, removePond]
  )

  return <PondContext.Provider value={value}>{children}</PondContext.Provider>
}

export function usePond(): PondContextValue {
  return useContext(PondContext)
}

/** The active pond's id, or null when unresolved or outside a provider. */
export function usePondId(): string | null {
  return useContext(PondContext).pond?.id ?? null
}
