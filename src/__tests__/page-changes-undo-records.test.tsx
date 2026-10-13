/**
 * Path test A3 (KAN-93) — the "Changes to this page" panel after a ⌘Z/⇧⌘Z step.
 *
 * `buildPageChanges`/`describeChange` already carry `undo`/`redo` cases
 * (page-changes.ts), and `Status` renders every status generically via
 * `labelForStatus` — this proves the real `PageChangesSection` draws an undone
 * original beside its own undo and redo records with no new production code.
 */

import { render, screen } from '@testing-library/react'
import { PageChangesSection } from '@/components/molecules/PageChangesSection'
import { buildPageChanges } from '@/lib/change-log/page-changes'
import type { ChangeLogRecord } from '@/lib/change-log/types'

const BEFORE = [{ id: 'a', type: 'text', content: 'one' }]
const AFTER = [{ id: 'a', type: 'text', content: 'ONE' }]

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'edit',
    actor: 'you',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: BEFORE,
    after: AFTER,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-30T09:31:00.000Z',
    statusAt: '2026-09-30T09:31:00.000Z',
    ...over,
  }
}

describe('PageChangesSection — an undo/redo step', () => {
  it('lists the undo and redo as their own rows, and shows the original as undone', () => {
    const original = record({ status: 'undone' })
    // `redo_of` names the undo record that is being put back (0021's own comment:
    // "after X.before, after X.after, redo_of X" where X is the standing undo) —
    // never the original.
    const undo = record({
      id: 'undo-1',
      action: 'undo',
      status: 'accepted',
      links: { undoOf: 'rec-1' },
      createdAt: '2026-09-30T09:32:00.000Z',
      statusAt: '2026-09-30T09:32:00.000Z',
    })
    const redo = record({
      id: 'redo-1',
      action: 'redo',
      status: 'accepted',
      links: { redoOf: 'undo-1' },
      createdAt: '2026-09-30T09:33:00.000Z',
      statusAt: '2026-09-30T09:33:00.000Z',
    })

    const rows = buildPageChanges([redo, undo, original])

    render(
      <PageChangesSection rows={rows} onRevert={jest.fn()} onAccept={jest.fn()} onReject={jest.fn()} />
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('undo')).toBeInTheDocument()
    expect(screen.getByText('redo')).toBeInTheDocument()
    expect(screen.getByText('undone')).toBeInTheDocument()
  })
})
