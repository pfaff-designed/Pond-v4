/**
 * `applyUndoOutcome`'s `done` branch clearing accept marks (KAN-143) — shared
 * by `ShellCommands`' ⌘Z and the composer's own undo chip.
 */

import type { QueryClient } from '@tanstack/react-query'
import { applyUndoOutcome } from '@/lib/change-log/undo-outcome'
import { clear, getSnapshot, recordAccept, registerPageOpen } from '@/lib/change-log/accept-marks'
import type { ChangeLogRecord } from '@/lib/change-log/types'

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

  it("a 'done' outcome with one record clears that record's marks and leaves another page's marks alone", () => {
    registerPageOpen('p1')
    registerPageOpen('p2')
    recordAccept('p1', ['block:a'], 'rec1', '2026-10-17T07:13:00.000Z')
    recordAccept('p2', ['block:b'], 'rec2', '2026-10-17T07:14:00.000Z')

    applyUndoOutcome(
      'undo',
      {
        outcome: 'done',
        records: [record({ id: 'rec1', targetPageId: 'p1' })],
        step: { pondId: 'pond1', recordIds: ['rec1'] },
      },
      fakeQueryClient
    )

    expect(getSnapshot('p1')).toEqual([])
    expect(getSnapshot('p2')).toEqual([
      { target: 'block:b', recordId: 'rec2', acceptedAt: '2026-10-17T07:14:00.000Z' },
    ])
  })
})
