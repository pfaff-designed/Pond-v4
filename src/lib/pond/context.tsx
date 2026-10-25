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
  patchPond: (pondId: string, patch: Partial<Pick<Pond, 'name' | 'glyph'>>) => void
}

/** Exported so a story can stand a pond list in without a Supabase round trip. */
export const PondContext = createContext<PondContextValue>({
  pond: null,
  ponds: [],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
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
    setPonds((rows) => (rows.some((r) => r.id === pond.id) ? rows : [...rows, pond]))
  }, [])

  const patchPond = useCallback((pondId: string, patch: Partial<Pick<Pond, 'name' | 'glyph'>>) => {
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

  // Applies the new pond's theme only when `pond.id` actually changed from a
  // previously resolved (non-null) id — an in-session switch, never the first
  // pond a mount resolves to. `applyPondTheme` itself is the no-op for every
  // theme but `'ink'`.
  useEffect(() => {
    const currentId = pond?.id ?? null
    const currentTheme = pond?.theme ?? null
    const previousId = previousPondIdRef.current
    previousPondIdRef.current = currentId
    if (previousId !== null && currentId !== null && previousId !== currentId && currentTheme !== null) {
      applyPondTheme(currentTheme)
    }
  }, [pond?.id, pond?.theme])

  const value = useMemo(
    () => ({ pond, ponds, loading, reload, addPond, patchPond }),
    [pond, ponds, loading, reload, addPond, patchPond]
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
