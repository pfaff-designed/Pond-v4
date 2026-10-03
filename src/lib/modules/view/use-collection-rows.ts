'use client'

/**
 * Client read/write seam for an inline view (#19 slice 3) — the CLIENT counterpart
 * of the server-side `hydrateViewBlocks` (assemble.ts). A view block carries only
 * config; its rows are the collection page's `type='row'` children, which this hook
 * fetches and keeps live, and whose values it writes back OPTIMISTICALLY.
 *
 * Two caches, both shared with the rest of the app so existing invalidations keep
 * this fresh with no extra wiring:
 *   - `['page', collectionId]` — the collection page itself, for its `_schema` (the
 *     SAME cache DocumentPanel primes for the open page, so no refetch on mount).
 *   - `['rows', collectionId]` — the row children WITH full props. A DEDICATED key,
 *     deliberately NOT the lean `['pages', workspace]` tree: that shape strips
 *     `props` and excludes `row` types entirely (fetchPages), so reusing it would
 *     make every collection read as empty (the #18 live-verify gotcha).
 *
 * Writes bypass the AI (decision 17): a cell edit / card drag calls `setValue`,
 * which reflects the change in the `['rows']` cache at once (and the row's own
 * `['page', rowId]` cache if it's been opened) then persists via the merge-safe
 * `setProperty`. Never the propose→accept path.
 */
import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import {
  createPage,
  defineSchema,
  deletePage,
  getCollectionRows,
  getPage,
  setProperty,
  updateTitle,
  type PondPage,
} from '@/lib/pages/client'
import { useWorkspace } from '@/lib/workspace/context'
import {
  readSchema,
  readValues,
  withSchema,
  withValue,
  ROW_TYPE,
  type PropertySchema,
  type PropertyValue,
} from '@/lib/properties/schema'
import type { CollectionRow } from './apply'

export interface CollectionData {
  /** The collection's property schema, or null when the page isn't a collection. */
  schema: PropertySchema | null
  /** The row children reduced to id + title + value map, in `order`. */
  rows: CollectionRow[]
  /** True until BOTH the schema page and the rows have first resolved. */
  isLoading: boolean
  /**
   * Either read failed. Distinct from "no rows": a surface that cannot tell them
   * apart reports `no rows yet` over a collection it never managed to read, which
   * is a false statement about the data and, where an insert is offered, a live
   * button on a collection that is not there (#227 review; the #239 ruling).
   */
  isError: boolean
  /** Optimistically set one row's property value, then persist (bypasses the AI). */
  setValue: (rowId: string, key: string, value: PropertyValue) => void
  /**
   * Create a new row (a `type='row'` child of the collection) with optional initial
   * property values — e.g. a board's "+ Add card" seeds the group-by status. Resolves
   * to the new row id (for focusing its title), or null off a collection / when logged out.
   */
  addRow: (values?: Record<string, PropertyValue>) => Promise<string | null>
  /** Optimistically delete a row, then persist. */
  removeRow: (rowId: string) => void
  /** Optimistically rename a row (its page title), then persist. */
  renameRow: (rowId: string, title: string) => void
  /**
   * Optimistically replace the collection's property schema, then persist
   * (board-authoring Slice 4 — manual column/property editing). Patches the
   * `['page', collectionId]` cache so new columns / properties reflect at once;
   * on failure it reconciles from server truth (invalidate), mirroring `setValue`.
   */
  updateSchema: (next: PropertySchema) => void
}

const ROWS_KEY = (collectionId: string) => ['rows', collectionId] as const

/**
 * Resolve an inline view's schema + rows for the collection page hosting it.
 * `collectionId` is the host page id (from `useSiblingBlocks().pageId`); when it's
 * undefined (a view rendered outside a page host — Storybook, the AI-terminal
 * reference render) both queries stay disabled and the hook returns an empty,
 * not-loading result so the renderer can show its "needs a collection" state.
 */
export function useCollectionRows(collectionId: string | undefined): CollectionData {
  const workspace = useWorkspace()
  // Lazily created on first fetch, not at render — so seeded/disabled queries
  // never construct a real client and throw (envless CI/Storybook, #38).
  const getSupabase = useLazySupabase()
  const queryClient = useQueryClient()

  const {
    data: page,
    isPending: pagePending,
    isError: pageError,
  } = useQuery({
    queryKey: ['page', collectionId],
    queryFn: () => (collectionId ? getPage(getSupabase(), collectionId) : Promise.resolve(null)),
    enabled: !!collectionId,
  })

  const {
    data: rowPages,
    isPending: rowsPending,
    isError: rowsError,
  } = useQuery({
    queryKey: collectionId ? ROWS_KEY(collectionId) : ['rows', 'none'],
    queryFn: async () => {
      if (!collectionId) return [] as PondPage[]
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return [] as PondPage[]
      return getCollectionRows(supabase, user.id, collectionId, workspace)
    },
    enabled: !!collectionId,
  })

  const schema = useMemo(() => readSchema(page?.props), [page])

  const rows = useMemo<CollectionRow[]>(
    () =>
      (rowPages ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        values: readValues(p.props),
      })),
    [rowPages]
  )

  const setValue = useMemo(
    () => (rowId: string, key: string, value: PropertyValue) => {
      if (!collectionId) return
      // Optimistic: patch the row's props in the ['rows'] cache so the cell/card
      // reflects the edit before the write lands.
      queryClient.setQueryData<PondPage[]>(ROWS_KEY(collectionId), (prev) =>
        prev
          ? prev.map((p) => (p.id === rowId ? { ...p, props: withValue(p.props, key, value) } : p))
          : prev
      )
      // Keep the row's own ['page'] cache coherent if it's ever been opened.
      queryClient.setQueryData<PondPage | null>(['page', rowId], (prev) =>
        prev ? { ...prev, props: withValue(prev.props, key, value) } : prev
      )
      // Persist. On failure, reconcile from server truth (invalidate rather than
      // hand-roll a rollback) so a rejected write can't leave the optimistic cache
      // permanently diverged from the DB.
      setProperty(getSupabase(), rowId, key, value).catch(() => {
        void queryClient.invalidateQueries({ queryKey: ROWS_KEY(collectionId) })
        void queryClient.invalidateQueries({ queryKey: ['page', rowId] })
      })
    },
    [collectionId, queryClient, getSupabase]
  )

  // Create a row child, seeded with any initial values (e.g. the board column's
  // status). Awaits the insert for the server id, then appends to the ['rows']
  // cache so the card appears. Returns the id so the UI can focus its title.
  const addRow = useMemo(
    () =>
      async (values: Record<string, PropertyValue> = {}): Promise<string | null> => {
        if (!collectionId) return null
        const supabase = getSupabase()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return null
        const created = await createPage(supabase, user.id, {
          parentId: collectionId,
          type: ROW_TYPE,
          title: '',
          props: values,
          workspace,
        })
        queryClient.setQueryData<PondPage[]>(ROWS_KEY(collectionId), (prev) =>
          prev ? [...prev, created] : [created]
        )
        return created.id
      },
    [collectionId, queryClient, getSupabase, workspace]
  )

  // Optimistically drop the row from the cache, then persist. Reconcile from server
  // truth on failure (invalidate) rather than hand-rolling a rollback — mirrors setValue.
  const removeRow = useMemo(
    () => (rowId: string) => {
      if (!collectionId) return
      queryClient.setQueryData<PondPage[]>(ROWS_KEY(collectionId), (prev) =>
        prev ? prev.filter((p) => p.id !== rowId) : prev
      )
      deletePage(getSupabase(), rowId).catch(() => {
        void queryClient.invalidateQueries({ queryKey: ROWS_KEY(collectionId) })
      })
    },
    [collectionId, queryClient, getSupabase]
  )

  // Optimistically rename in both the ['rows'] cache and the row's own ['page']
  // cache (kept coherent if it's ever been opened), then persist.
  const renameRow = useMemo(
    () => (rowId: string, title: string) => {
      if (!collectionId) return
      queryClient.setQueryData<PondPage[]>(ROWS_KEY(collectionId), (prev) =>
        prev ? prev.map((p) => (p.id === rowId ? { ...p, title } : p)) : prev
      )
      queryClient.setQueryData<PondPage | null>(['page', rowId], (prev) =>
        prev ? { ...prev, title } : prev
      )
      updateTitle(getSupabase(), rowId, title).catch(() => {
        void queryClient.invalidateQueries({ queryKey: ROWS_KEY(collectionId) })
      })
    },
    [collectionId, queryClient, getSupabase]
  )

  // Optimistically write the new schema into the collection page's ['page'] cache
  // (from which `schema` is derived, so the board/table re-render immediately), then
  // persist through the merge-safe `defineSchema`. Reconcile on failure.
  const updateSchema = useMemo(
    () => (next: PropertySchema) => {
      if (!collectionId) return
      queryClient.setQueryData<PondPage | null>(['page', collectionId], (prev) =>
        prev ? { ...prev, props: withSchema(prev.props, next) } : prev
      )
      defineSchema(getSupabase(), collectionId, next).catch(() => {
        void queryClient.invalidateQueries({ queryKey: ['page', collectionId] })
      })
    },
    [collectionId, queryClient, getSupabase]
  )

  return {
    schema,
    rows,
    isLoading: !!collectionId && (pagePending || rowsPending),
    isError: !!collectionId && (pageError || rowsError),
    setValue,
    addRow,
    removeRow,
    renameRow,
    updateSchema,
  }
}
