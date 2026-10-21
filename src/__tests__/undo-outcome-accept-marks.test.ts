/**
 * `applyUndoOutcome`'s `done` branch clearing accept marks (KAN-143) — shared
 * by `ShellCommands`' ⌘Z and the composer's own undo chip.
 *
 * `result.records` are the NEW undo/redo records the 0021 RPC logs for a step
 * (`undo.ts`: "each gains an `undo`/`redo` record") — never the original
 * accept's record id a mark was stored under. The original ids live in
 * `result.step.recordIds`. Every case below gives `records` a DIFFERENT id
 * from `step.recordIds`, as the real RPC does.
 */

import type { QueryClient } from '@tanstack/react-query'
import { applyUndoOutcome } from '@/lib/change-log/undo-outcome'
import { clear, getSnapshot, recordAccept, registerPageOpen } from '@/lib/change-log/accept-marks'
import { createSessionUndo } from '@/lib/change-log/session-undo'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import type { HistoryStep, StepResult } from '@/lib/change-log/undo'

const fakeQueryClient = {
  invalidateQueries: jest.fn(),
} as unknown as QueryClient

const record = (overrides: Partial<ChangeLogRecord>): ChangeLogRecord => ({
  id: 'rec1',
  userId: 'u1',
  pondId: 'pond1',
  status: 'accepted',
  action: 'edit',
  actor: 'pond',
  targetPageId: 'p1',
  targetBlockId: null,
  before: null,
  after: null,
  sourceThreadId: null,
  toolCallId: null,
  read: null,
  links: {},
  transitions: [],
  createdAt: '2026-10-17T07:13:00.000Z',
  statusAt: '2026-10-17T07:13:00.000Z',
  ...overrides,
})

describe('applyUndoOutcome clears accept marks', () => {
  afterEach(() => {
    clear()
    jest.clearAllMocks()
  })

  it("a 'done' UNDO clears the original record's marks and leaves another page's marks alone", () => {
    registerPageOpen('p1')
    registerPageOpen('p2')
    recordAccept('p1', ['block:a'], 'accept-rec1', '2026-10-17T07:13:00.000Z')
    recordAccept('p2', ['block:b'], 'accept-rec2', '2026-10-17T07:14:00.000Z')

    applyUndoOutcome(
      'undo',
      {
        outcome: 'done',
        // The RPC's own new undo record — a different id from the accept it undoes.
        records: [record({ id: 'undo-rec1', targetPageId: 'p1' })],
        step: { pondId: 'pond1', recordIds: ['accept-rec1'] },
      },
      fakeQueryClient
    )

    expect(getSnapshot('p1')).toEqual([])
    expect(getSnapshot('p2')).toEqual([
      { target: 'block:b', recordId: 'accept-rec2', acceptedAt: '2026-10-17T07:14:00.000Z' },
    ])
  })

  it("a 'done' REDO leaves marks alone — the redone change is not re-marked", () => {
    registerPageOpen('p1')
    recordAccept('p1', ['block:a'], 'accept-rec1', '2026-10-17T07:13:00.000Z')

    applyUndoOutcome(
      'redo',
      {
        outcome: 'done',
        records: [record({ id: 'redo-rec1', targetPageId: 'p1' })],
        step: { pondId: 'pond1', recordIds: ['accept-rec1'] },
      },
      fakeQueryClient
    )

    expect(getSnapshot('p1')).toEqual([
      { target: 'block:a', recordId: 'accept-rec1', acceptedAt: '2026-10-17T07:13:00.000Z' },
    ])
  })
})

/**
 * Path-level: a real `sessionUndo` stack, remembering the recordId an accept
 * returns (as `AITerminal` does), undoing it through a stubbed RPC that
 * returns a fresh undo record (never the accept's own id), and feeding the
 * real outcome to `applyUndoOutcome`.
 */
describe('⌘Z undoes an accept and its page mark goes with it (path)', () => {
  afterEach(() => clear())

  it("clears the page's marks when sessionUndo.undo's outcome reaches applyUndoOutcome", async () => {
    const pondId = 'pond-7'
    const pageId = 'page-b'
    const acceptRecordId = 'accept-rec-9'

    // What `writeAcceptedChanges` leaves behind: the mark, keyed by the
    // accept's own record id, and the pond's undo stack remembering that id.
    registerPageOpen(pageId)
    recordAccept(pageId, ['block:row-1'], acceptRecordId, '2026-10-17T07:13:00.000Z')

    const run = {
      undo: jest.fn<Promise<StepResult>, [HistoryStep]>().mockResolvedValue({
        outcome: 'done',
        records: [record({ id: 'undo-rec-fresh', targetPageId: pageId })],
      }),
      redo: jest.fn<Promise<StepResult>, [HistoryStep]>(),
    }
    const undo = createSessionUndo(run)
    undo.remember({ pondId, recordIds: [acceptRecordId] })

    const outcome = await undo.undo(pondId)

    expect(run.undo).toHaveBeenCalledWith({ pondId, recordIds: [acceptRecordId] })
    expect(getSnapshot(pageId)).not.toEqual([])

    applyUndoOutcome('undo', outcome, fakeQueryClient)

    expect(getSnapshot(pageId)).toEqual([])
  })
})
