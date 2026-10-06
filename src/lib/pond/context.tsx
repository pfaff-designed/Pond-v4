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

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { listPonds, type Pond } from './client'
import { resolveActivePond, useActivePondId } from './active'

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
}

/** Exported so a story can stand a pond list in without a Supabase round trip. */
export const PondContext = createContext<PondContextValue>({
  pond: null,
  ponds: [],
  loading: false,
  reload: () => {},
  addPond: () => {},
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

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const addPond = useCallback((pond: Pond) => {
    setPonds((rows) => (rows.some((r) => r.id === pond.id) ? rows : [...rows, pond]))
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

  const value = useMemo(
    () => ({ pond: resolveActivePond(ponds, activeId), ponds, loading, reload, addPond }),
    [ponds, activeId, loading, reload, addPond]
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
