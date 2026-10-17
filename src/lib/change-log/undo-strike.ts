/**
 * The row (or block) a `done` undo/redo just removed from the page now open —
 * kept struck through while the notice shows (board `s6o5`: "the row the
 * undo removed stays visible struck through ... while the notice shows").
 * Lifetime is borrowed from {@link useUndoNotice}, not tracked separately, so
 * the strike and the notice always clear together.
 *
 * `rememberStruckRow` reads the undo/redo record's OWN `before`/`after` —
 * migration 0021 writes an undo/redo record as the reverse diff of the
 * original, so `before` is what was shown right before the step ran and
 * `after` is what it left — rather than the original record, so a caller
 * already holding the step's result needs no extra fetch.
 */
import { useMemo } from 'react'

import { readRowSnapshot } from './summary'
import { getUndoNoticeSnapshot, subscribeUndoNotice, useUndoNotice } from '@/lib/terminal-focus'
import type { ChangeLogRecord } from './types'

export interface StruckRow {
  id: string
  collectionId: string
  title: string
  values: Record<string, unknown>
}

const struckById = new Map<string, StruckRow>()
const EMPTY_STRUCK_ROWS: StruckRow[] = []

// A cleared notice closes the strike's lifetime (see the file comment) — without
// this, a row struck by an earlier step stayed struck forever, since nothing else
// ever emptied the map. Subscribed at module scope, not inside a component, so a
// clear is caught even with no `useStruckRows` reader mounted.
subscribeUndoNotice(() => {
  if (getUndoNoticeSnapshot() === null) struckById.clear()
})

/** A no-op unless `record` is a row's `add_row`/`edit_row` undo or redo whose
 *  `after` no longer holds that row — i.e. the step just removed it. */
export function rememberStruckRow(record: ChangeLogRecord): void {
  if (record.targetPageId === null) return
  const removed = readRowSnapshot(record.before)
  if (removed === null) return
  const stillThere = readRowSnapshot(record.after)
  if (stillThere?.id === removed.id) return
  struckById.set(removed.id, {
    id: removed.id,
    collectionId: record.targetPageId,
    title: removed.title,
    values: removed.values,
  })
}

/** Every struck row filed against `collectionId`, while the undo notice still
 *  shows — empty once {@link clearUndoNotice} fires, or off a collection.
 *  Memoized on `notice`/`collectionId` so the array is referentially stable
 *  across renders that change neither, matching view.tsx's own `useMemo`s. */
export function useStruckRows(collectionId: string | undefined): StruckRow[] {
  const notice = useUndoNotice()
  return useMemo(() => {
    if (!notice || !collectionId) return EMPTY_STRUCK_ROWS
    return [...struckById.values()].filter((row) => row.collectionId === collectionId)
  }, [notice, collectionId])
}
