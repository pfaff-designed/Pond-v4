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
 *     deliberately NOT the lean `pagesKey()` tree: that shape strips
 *     `props` and excludes `row` types entirely (fetchPages), so reusing it would
 *     make every collection read as empty (the #18 live-verify gotcha).
 *
 * Writes bypass the AI (decision 17): a cell edit / card drag calls `setValue`,
 * which reflects the change in the `['rows']` cache at once (and the row's own
 * `['page', rowId]` cache if it's been opened) then persists via the merge-safe
 * `setProperty`. Never the propose→accept path.
 *
 * They are the person's own edits, so each pause of them is one `accepted`
 * record in the change log (`add_row` / `edit_row`, filed against the
 * collection). Writes land per keystroke; the log groups them per record once
 * they settle (`groupByPause`) and closes any open group when the view unmounts.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
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
import { usePondId } from '@/lib/pond/context'
import {
  readSchema,
  readValues,
  withSchema,
  withValue,
  ROW_TYPE,
  type PropertySchema,
  type PropertyValue,
} from '@/lib/properties/schema'
import { recordOwnRowEdit } from '@/lib/change-log/own-edit'
import { groupByPause, type PauseGroups } from '@/lib/change-log/pause'
import { changeLogKey } from '@/lib/change-log/keys'
import type { RowSnapshot } from '@/lib/change-log/types'
import { displayValue, type CollectionRow } from './apply'

export interface CollectionData {
  /** The collection's property schema, or null when the page isn't a collection. */
  schema: PropertySchema | null
  /** The row children reduced to id + title + value map, in `order`. */
  rows: CollectionRow[]
  /** The collection page's own title — `9w`'s head row names the database. */
  collectionName: string
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
  /**
   * Optimistically delete a row, then persist.
   *
   * **Deliberately unconsumed since #223.** The per-row `×` was deleted because no
   * board draws one, which left this with no caller. It stays because it is
   * persistence, not an affordance — AGENTS.md keeps "engine logic the boards
   * assume but do not draw" through a surface gut — and because durable trash
   * (#199) and the deleted-record restore diff (#201) are the surfaces that will
   * call it. Do not re-expose it as a `×`; that is the defect #223 removed.
   */
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

/** One change to a record, as the change log folds it into a {@link RowSnapshot}. */
type RowChange =
  | { kind: 'create'; record: RowSnapshot }
  | { kind: 'value'; fieldId: string; value: PropertyValue; shown: string | null }
  | { kind: 'title'; title: string }

const cachedRow = (
  queryClient: QueryClient,
  collectionId: string,
  rowId: string
): PondPage | undefined =>
  queryClient.getQueryData<PondPage[]>(ROWS_KEY(collectionId))?.find((p) => p.id === rowId)

const cachedFields = (queryClient: QueryClient, collectionId: string): PropertySchema =>
  readSchema(queryClient.getQueryData<PondPage | null>(['page', collectionId])?.props) ?? []

/** A record as the change log keeps it, each field also as the field shows it. */
const snapshotOf = (row: PondPage, fields: PropertySchema): RowSnapshot => {
  const values = readValues(row.props)
  const shown = Object.fromEntries(fields.map((def) => [def.id, displayValue(def, values[def.id])]))
  return { id: row.id, title: row.title, values, shown }
}

const applyRowChange = (record: RowSnapshot | null, change: RowChange): RowSnapshot | null => {
  if (change.kind === 'create') return change.record
  if (record === null) return null
  if (change.kind === 'title') return { ...record, title: change.title }
  return {
    ...record,
    values: readValues(withValue(record.values, change.fieldId, change.value)),
    shown:
      change.shown === null ? record.shown : { ...record.shown, [change.fieldId]: change.shown },
  }
}

/**
 * Resolve an inline view's schema + rows for the collection page hosting it.
 * `collectionId` is the host page id (from `useSiblingBlocks().pageId`); when it's
 * undefined (a view rendered outside a page host — Storybook, the AI-terminal
 * reference render) both queries stay disabled and the hook returns an empty,
 * not-loading result so the renderer can show its "needs a collection" state.
 */
export function useCollectionRows(collectionId: string | undefined): CollectionData {
  const pondId = usePondId()
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
      return getCollectionRows(supabase, user.id, collectionId)
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

  // The pond is read when a group closes, not when the grouper is made: a pond
  // that resolves mid-pause must not close the open groups under the old one.
  const pondRef = useRef(pondId)
  useEffect(() => {
    pondRef.current = pondId
  }, [pondId])

  // One record per record per pause, of what the database kept (`groupByPause`).
  // Made in an effect so leaving — or switching collection — closes the open
  // groups: leaving mid-pause still logs what was done.
  const rowEdits = useRef<PauseGroups<RowSnapshot, RowChange, string> | null>(null)
  useEffect(() => {
    if (!collectionId) return
    const groups = groupByPause<RowSnapshot, RowChange, string>({
      apply: applyRowChange,
      onPause: (before, after, origin) => {
        void recordOwnRowEdit(getSupabase(), {
          pondId: origin ?? pondRef.current,
          collectionId,
          before,
          after,
        }).then(() => queryClient.invalidateQueries({ queryKey: changeLogKey() }))
      },
    })
    rowEdits.current = groups
    return () => {
      groups.flush()
      if (rowEdits.current === groups) rowEdits.current = null
    }
  }, [collectionId, getSupabase, queryClient])

  const setValue = useMemo(
    () => (rowId: string, key: string, value: PropertyValue) => {
      if (!collectionId) return
      const row = cachedRow(queryClient, collectionId, rowId)
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
      const write = setProperty(getSupabase(), rowId, key, value)
      write.catch(() => {
        void queryClient.invalidateQueries({ queryKey: ROWS_KEY(collectionId) })
        void queryClient.invalidateQueries({ queryKey: ['page', rowId] })
      })
      if (!row) return
      const fields = cachedFields(queryClient, collectionId)
      const field = fields.find((def) => def.id === key)
      rowEdits.current?.change({
        key: rowId,
        current: snapshotOf(row, fields),
        patch: {
          kind: 'value',
          fieldId: key,
          value,
          shown: field ? displayValue(field, value) : null,
        },
        write,
        origin: pondId,
      })
    },
    [collectionId, queryClient, getSupabase, pondId]
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
          pondId,
        })
        queryClient.setQueryData<PondPage[]>(ROWS_KEY(collectionId), (prev) =>
          prev ? [...prev, created] : [created]
        )
        // Opens the record's group with no `before`: naming it in the same pause
        // folds into one "added …" record.
        rowEdits.current?.change({
          key: created.id,
          current: null,
          patch: {
            kind: 'create',
            record: snapshotOf(created, cachedFields(queryClient, collectionId)),
          },
          write: Promise.resolve(),
          origin: pondId,
        })
        return created.id
      },
    [collectionId, queryClient, getSupabase, pondId]
  )

  // Optimistically drop the row from the cache, then persist. Reconcile from server
  // truth on failure (invalidate) rather than hand-rolling a rollback — mirrors setValue.
  const removeRow = useMemo(
    () => (rowId: string) => {
      if (!collectionId) return
      // An edit to a record that is gone has nothing left to name.
      rowEdits.current?.drop(rowId)
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
      const row = cachedRow(queryClient, collectionId, rowId)
      queryClient.setQueryData<PondPage[]>(ROWS_KEY(collectionId), (prev) =>
        prev ? prev.map((p) => (p.id === rowId ? { ...p, title } : p)) : prev
      )
      queryClient.setQueryData<PondPage | null>(['page', rowId], (prev) =>
        prev ? { ...prev, title } : prev
      )
      const write = updateTitle(getSupabase(), rowId, title)
      write.catch(() => {
        void queryClient.invalidateQueries({ queryKey: ROWS_KEY(collectionId) })
      })
      if (!row) return
      rowEdits.current?.change({
        key: rowId,
        current: snapshotOf(row, cachedFields(queryClient, collectionId)),
        patch: { kind: 'title', title },
        write,
        origin: pondId,
      })
    },
    [collectionId, queryClient, getSupabase, pondId]
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
    /** The collection page's own title — `9w`'s head row names the database. */
    collectionName: page?.title ?? '',
    isLoading: !!collectionId && (pagePending || rowsPending),
    isError: !!collectionId && (pageError || rowsError),
    setValue,
    addRow,
    removeRow,
    renameRow,
    updateSchema,
  }
}
