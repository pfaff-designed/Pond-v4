'use client'

/**
 * The shared answer row for a settled-but-open record (KAN-96, s6o2; lifted
 * for KAN-152 so the change log record page can answer a card the same way
 * the proposed view's own cards do, through one implementation): accept ·
 * request changes · reject, or revise · reject once a card has gone
 * `outdated`. Owns the accept/reject/revise/request-changes writes and their
 * G9 busy-guards; the caller only supplies the record, the pond and a place
 * to put an error line.
 */
import { useCallback, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { changeLogKey } from '@/lib/change-log/keys'
import { canAccept } from '@/lib/change-log/status'
import {
  acceptRecordFromLog,
  canAcceptAction,
  rejectRecordFromLog,
  REVISE_NOTE,
} from '@/lib/change-log/answer'
import { sessionUndo } from '@/lib/change-log/session-undo'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { NoteBox } from '@/components/molecules/diff-card-parts'
import { personFacingMessage } from '@/lib/change-log/errors'
import { requestChanges, type RequestChangesDetail } from '@/lib/terminal-focus'
import { PondControl } from '@/components/atoms/PondControl'
import { pagesKey } from '@/lib/pages/keys'

export function ChangeLogAnswerActions({
  record,
  pondId,
  onError,
}: {
  record: ChangeLogRecord
  pondId: string | null
  onError: (message: string | null) => void
}) {
  const getSupabase = useLazySupabase()
  const queryClient = useQueryClient()

  // Refetches the whole change-log root + the pages key — the same pair
  // `ChangeLogPage`'s own answer path invalidates, since an answer here can
  // settle a record another view (the "all" table, a page's changes panel)
  // is also showing.
  const invalidateAfterAnswer = useCallback(
    async (targetPageId: string | null) => {
      queryClient.invalidateQueries({ queryKey: pagesKey(pondId) })
      await queryClient.invalidateQueries({ queryKey: changeLogKey() })
      if (targetPageId !== null) {
        await queryClient.invalidateQueries({ queryKey: ['page', targetPageId] })
      }
    },
    [queryClient, pondId]
  )

  const acceptMutation = useMutation({
    mutationFn: async (toAccept: ChangeLogRecord) => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return { refused: true, reason: 'not signed in' } as const
      return acceptRecordFromLog(supabase, { userId: user.id, pondId, record: toAccept })
    },
    onSuccess: async (outcome, toAccept) => {
      if (outcome.refused) {
        onError(outcome.reason)
        return
      }
      onError(null)
      // Mirrors AITerminal's own accept: only a step the write actually
      // reported undoable goes on the stack.
      if (pondId && outcome.undoRecordId) {
        sessionUndo.remember({ pondId, recordIds: [outcome.undoRecordId] })
      }
      await invalidateAfterAnswer(toAccept.targetPageId)
    },
    onError: (err) => onError(personFacingMessage(err)),
  })

  const rejectMutation = useMutation({
    mutationFn: (toReject: ChangeLogRecord) => rejectRecordFromLog(getSupabase(), toReject),
    onSuccess: async (_record, toReject) => {
      onError(null)
      await invalidateAfterAnswer(toReject.targetPageId)
    },
    onError: (err) => onError(personFacingMessage(err)),
  })

  // G9: a ref, not state — the second click of a double-click can land
  // before a state update guarding on a render would have committed. Shared
  // across accept/reject/request-changes: only one of the three can be
  // in flight for this record at a time.
  const busyRef = useRef(false)

  const handleAccept = useCallback(() => {
    if (busyRef.current) return
    busyRef.current = true
    acceptMutation.mutate(record, {
      onSettled: () => {
        busyRef.current = false
      },
    })
  }, [acceptMutation, record])

  const handleReject = useCallback(() => {
    if (busyRef.current) return
    busyRef.current = true
    rejectMutation.mutate(record, {
      onSettled: () => {
        busyRef.current = false
      },
    })
  }, [rejectMutation, record])

  // G9: the note box's send dispatches REQUEST_CHANGES_EVENT fire-and-forget
  // — synchronous, with nothing to await — so two clicks landing in the same
  // tick would otherwise fire the event twice. A microtask-deferred release
  // is enough here because `onSend` closes the note box synchronously first,
  // so a second REAL click has nothing left to land on.
  const handleRequestChanges = useCallback((detail: RequestChangesDetail) => {
    if (busyRef.current) return
    busyRef.current = true
    requestChanges(detail)
    queueMicrotask(() => {
      busyRef.current = false
    })
  }, [])

  // G9: revise's button, unlike the note box's send, stays mounted and
  // enabled after a click, so a microtask-released guard misses a REAL
  // double-click — two separate browser tasks, with a React re-render
  // between them, drain the microtask queue before the second task starts.
  // Held in state instead, so the button itself goes `disabled` for the
  // card's remaining lifetime (it leaves 'outdated' only via a refetch
  // elsewhere, at which point this component unmounts).
  const [revised, setRevised] = useState(false)

  const handleRevise = useCallback((detail: RequestChangesDetail) => {
    setRevised((already) => {
      if (already) return already
      requestChanges(detail)
      return true
    })
  }, [])

  // The open note box for this record, at most one at a time — "request
  // changes" dispatches REQUEST_CHANGES_EVENT through AITerminal (no thread
  // mounted here), which settles the record to `changes_requested` on its
  // own; the caller finds out on its next refetch, same as a reject leaving
  // its view.
  const [requestingNote, setRequestingNote] = useState(false)

  const toolCallId = record.toolCallId
  const busy = acceptMutation.isPending || rejectMutation.isPending

  return (
    <>
      <div className="flex items-center gap-2">
        {/* `canAccept` (open) × `canAcceptAction` (this action has a write
          adapter) — crossed, not the old binary "accept or revise": an open
          record whose action `answer.ts` can't write (KAN-313) gets neither,
          only request changes + reject. */}
        {canAccept(record.status) && canAcceptAction(record.action) && (
          <PondControl
            kind="button"
            variant="primary"
            state={busy ? 'loading' : 'rest'}
            disabled={busy}
            onClick={handleAccept}
          >
            accept
          </PondControl>
        )}
        {!canAccept(record.status) && (
          <PondControl
            kind="button"
            variant="primary"
            disabled={toolCallId === null || revised}
            onClick={() =>
              toolCallId !== null &&
              handleRevise({
                toolCallId,
                note: REVISE_NOTE,
                reason: 'outdated',
                targetPageId: record.targetPageId,
              })
            }
          >
            revise
          </PondControl>
        )}
        {/* Request changes is offered on every open record, not only an
          acceptable one — an open record always carries the toolCallId
          AITerminal's sendRequestChanges keys off; the guard covers the
          type's wider `string | null`. */}
        {canAccept(record.status) && toolCallId !== null && (
          <PondControl
            kind="button"
            variant="ghost"
            disabled={requestingNote}
            onClick={() => setRequestingNote(true)}
          >
            request changes
          </PondControl>
        )}
        <PondControl kind="button" variant="ghost" disabled={busy} onClick={handleReject}>
          reject
        </PondControl>
      </div>
      {requestingNote && toolCallId !== null && (
        <NoteBox
          onCancel={() => setRequestingNote(false)}
          onSend={(note) => {
            setRequestingNote(false)
            handleRequestChanges({
              toolCallId,
              note,
              reason: 'note',
              targetPageId: record.targetPageId,
            })
          }}
        />
      )}
    </>
  )
}
