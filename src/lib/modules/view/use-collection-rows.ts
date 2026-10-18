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
 * A schema rename/delete (`logSchemaEdit`, KAN-380) is the one exception: it is
 * a single committed action, not a run of keystrokes, so it writes its
 * `edit_schema` record at once via `appendOwnEdit` rather than through a pause
 * group.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
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
import { sessionUndo } from '@/lib/change-log/session-undo'
import { changeLogKey } from '@/lib/change-log/keys'
import { appendOwnEdit } from '@/lib/change-log/store'
import type { ChangeLogRecord, RowSnapshot } from '@/lib/change-log/types'
import { jsonEqual } from '@/lib/json-equal'
import { displayValue, type CollectionRow } from './apply'
import { rowsKey } from './rows-key'

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
   * Optimistically set one row's property value, then persist — same write as
   * {@link setValue}, but for a gesture (a calendar drag) that is already its
   * own complete edit, not a keystroke in a run. Closes that row's open
   * typed-edit group first (so its record logs ahead, in order), then runs as
   * its own one-change pause group, closed at once rather than on a timer — so
   * two of these calls back to back are still two groups, two records.
   */
  setValueAsStep: (rowId: string, key: string, value: PropertyValue) => void
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
  /**
   * Log one rename/delete of the schema as an own `edit_schema` record
   * (KAN-380: the table header menu's commit). Written at once via
   * `appendOwnEdit` directly — a schema edit is one atomic action, never a
   * run of keystrokes, so it skips the `groupByPause` grouping `setValue`/
   * `renameRow` use. `before`/`after` are each the whole schema; a no-op
   * diff writes nothing.
   */
  logSchemaEdit: (before: PropertySchema, after: PropertySchema) => void
}

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
  queryClient.getQueryData<PondPage[]>(rowsKey(collectionId))?.find((p) => p.id === rowId)

const cachedFields = (queryClient: QueryClient, collectionId: string): PropertySchema =>
  readSchema(queryClient.getQueryData<PondPage | null>(['page', collectionId])?.props) ?? []

/** A record as the change log keeps it, each field also as the field shows it. */
const snapshotOf = (row: PondPage, fields: PropertySchema): RowSnapshot => {
  const values = readValues(row.props)
  const shown = Object.fromEntries(fields.map((def) => [def.id, displayValue(def, values[def.id])]))
  return { id: row.id, title: row.title, values, shown }
}

/**
 * Patch a row's value into both caches (the `['rows']` list and its own
 * `['page']`, if it's ever been opened), then persist via `setProperty`,
 * reconciling from server truth on failure. Shared by `setValue` and
 * `setValueAsStep` — what differs between them is how the write is grouped
 * into a change-log record, not the write itself.
 */
const writeRowValue = (
  queryClient: QueryClient,
  supabase: SupabaseClient<Database>,
  collectionId: string,
  rowId: string,
  key: string,
  value: PropertyValue
): Promise<void> => {
  queryClient.setQueryData<PondPage[]>(rowsKey(collectionId), (prev) =>
    prev
      ? prev.map((p) => (p.id === rowId ? { ...p, props: withValue(p.props, key, value) } : p))
      : prev
  )
  queryClient.setQueryData<PondPage | null>(['page', rowId], (prev) =>
    prev ? { ...prev, props: withValue(prev.props, key, value) } : prev
  )
  const write = setProperty(supabase, rowId, key, value)
  write.catch(() => {
    void queryClient.invalidateQueries({ queryKey: rowsKey(collectionId) })
    void queryClient.invalidateQueries({ queryKey: ['page', rowId] })
  })
  return write
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
    queryKey: collectionId ? rowsKey(collectionId) : ['rows', 'none'],
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
  // groups: leaving mid-pause still logs what was done. `onPause` hands back the
  // appended record so `setValueAsStep` can learn it once its own group closes.
  const rowEdits = useRef<PauseGroups<RowSnapshot, RowChange, string, ChangeLogRecord | null> | null>(
    null
  )
  useEffect(() => {
    if (!collectionId) return
    const groups = groupByPause<RowSnapshot, RowChange, string, ChangeLogRecord | null>({
      apply: applyRowChange,
      onPause: (before, after, origin) =>
        recordOwnRowEdit(getSupabase(), {
          pondId: origin ?? pondRef.current,
          collectionId,
          before,
          after,
        }).then((record) => {
          void queryClient.invalidateQueries({ queryKey: changeLogKey() })
          return record
        }),
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
      const write = writeRowValue(queryClient, getSupabase(), collectionId, rowId, key, value)
      if (!row) return
      const fields = cachedFields(queryClient, collectionId)
      const field = fields.find((def) => def.id === key)
      void rowEdits.current?.change({
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

  // A drag's drop is already its own complete edit — not a keystroke in an
  // open pause — so it never waits out a pause: it closes this row's open
  // typed-edit group first (its record logs ahead, in order), then runs
  // through `rowEdits.current.change` as its own group, closed at once rather
  // than on a timer, so it still waits for ITS write to settle before logging
  // (a refused write is never logged, never remembered) and two of these calls
  // back to back are still two groups, two records.
  const setValueAsStep = useMemo(
    () => (rowId: string, key: string, value: PropertyValue) => {
      if (!collectionId) return
      const row = cachedRow(queryClient, collectionId, rowId)
      const write = writeRowValue(queryClient, getSupabase(), collectionId, rowId, key, value)
      const groups = rowEdits.current
      if (!row || !groups) return
      const fields = cachedFields(queryClient, collectionId)
      const field = fields.find((def) => def.id === key)
      const stepPondId = pondRef.current
      groups.closeKey(rowId)
      const logged = groups.change({
        key: rowId,
        current: snapshotOf(row, fields),
        patch: {
          kind: 'value',
          fieldId: key,
          value,
          shown: field ? displayValue(field, value) : null,
        },
        write,
        origin: stepPondId,
      })
      groups.closeKey(rowId)
      // Handed to session-undo BEFORE anything else awaits it — same ordering
      // as `commit.ts` — so a ⌘Z pressed mid-flight waits for THIS remember
      // rather than taking the previous step.
      if (stepPondId) sessionUndo.trackPending(stepPondId, logged)
      void logged.then((record) => {
        if (stepPondId && record) sessionUndo.remember({ pondId: stepPondId, recordIds: [record.id] })
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
          pondId,
        })
        queryClient.setQueryData<PondPage[]>(rowsKey(collectionId), (prev) =>
          prev ? [...prev, created] : [created]
        )
        // Opens the record's group with no `before`: naming it in the same pause
        // folds into one "added …" record.
        void rowEdits.current?.change({
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
      queryClient.setQueryData<PondPage[]>(rowsKey(collectionId), (prev) =>
        prev ? prev.filter((p) => p.id !== rowId) : prev
      )
      deletePage(getSupabase(), rowId).catch(() => {
        void queryClient.invalidateQueries({ queryKey: rowsKey(collectionId) })
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
      queryClient.setQueryData<PondPage[]>(rowsKey(collectionId), (prev) =>
        prev ? prev.map((p) => (p.id === rowId ? { ...p, title } : p)) : prev
      )
      queryClient.setQueryData<PondPage | null>(['page', rowId], (prev) =>
        prev ? { ...prev, title } : prev
      )
      const write = updateTitle(getSupabase(), rowId, title)
      write.catch(() => {
        void queryClient.invalidateQueries({ queryKey: rowsKey(collectionId) })
      })
      if (!row) return
      void rowEdits.current?.change({
        key: rowId,
        current: snapshotOf(row, cachedFields(queryClient, collectionId)),
        patch: { kind: 'title', title },
        write,
        origin: pondId,
      })
    },
    [collectionId, queryClient, getSupabase, pondId]
  )

  // `defineSchema` is a read-modify-write round trip (fetch the page, merge,
  // save) — two overlapping calls can land on the server out of order, and the
  // slower one's read (taken before the faster one's write landed) silently
  // overwrites it with a schema that predates it (KAN-380 live-verify: delete
  // a field, rename another, undo the delete — the rename's write landed,
  // then the delete's slower write reverted it). Chaining every call behind
  // the one before guarantees a write never starts until the previous write
  // has fully landed, so each call's own read always sees it.
  const schemaWriteChain = useRef<Promise<void>>(Promise.resolve())

  // Optimistically write the new schema into the collection page's ['page'] cache
  // (from which `schema` is derived, so the board/table re-render immediately), then
  // persist through the merge-safe `defineSchema`. Reconcile on failure.
  const updateSchema = useMemo(
    () => (next: PropertySchema) => {
      if (!collectionId) return
      queryClient.setQueryData<PondPage | null>(['page', collectionId], (prev) =>
        prev ? { ...prev, props: withSchema(prev.props, next) } : prev
      )
      schemaWriteChain.current = schemaWriteChain.current.then(() =>
        defineSchema(getSupabase(), collectionId, next).catch(() => {
          void queryClient.invalidateQueries({ queryKey: ['page', collectionId] })
        })
      )
    },
    [collectionId, queryClient, getSupabase]
  )

  // One atomic record per rename/delete commit — not grouped by pause, since a
  // schema edit is a single committed action rather than a run of keystrokes.
  const logSchemaEdit = useMemo(
    () => (before: PropertySchema, after: PropertySchema) => {
      if (!collectionId || jsonEqual(before, after)) return
      void (async () => {
        const supabase = getSupabase()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        try {
          await appendOwnEdit(supabase, {
            userId: user.id,
            pondId,
            action: 'edit_schema',
            targetPageId: collectionId,
            before,
            after,
          })
          void queryClient.invalidateQueries({ queryKey: changeLogKey() })
        } catch (err) {
          console.error('[change-log] schema edit not logged', collectionId, err)
        }
      })()
    },
    [collectionId, getSupabase, pondId, queryClient]
  )

  return {
    schema,
    rows,
    /** The collection page's own title — `9w`'s head row names the database. */
    collectionName: page?.title ?? '',
    isLoading: !!collectionId && (pagePending || rowsPending),
    isError: !!collectionId && (pageError || rowsError),
    setValue,
    setValueAsStep,
    addRow,
    removeRow,
    renameRow,
    updateSchema,
    logSchemaEdit,
  }
}
