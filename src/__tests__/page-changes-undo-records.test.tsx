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
  it('lists the undo and redo rows carrying the original record\'s own label', () => {
    const original = record({ status: 'undone' })
    const undo = record({
      id: 'undo-1',
      action: 'undo',
      status: 'accepted',
      links: { undoOf: 'rec-1' },
      createdAt: '2026-09-30T09:32:00.000Z',
      statusAt: '2026-09-30T09:32:00.000Z',
    })
    // redoOf names the redone record directly (0021).
    const redo = record({
      id: 'redo-1',
      action: 'redo',
      status: 'accepted',
      links: { redoOf: 'rec-1' },
      createdAt: '2026-09-30T09:33:00.000Z',
      statusAt: '2026-09-30T09:33:00.000Z',
    })

    const rows = buildPageChanges([redo, undo, original])

    render(
      <PageChangesSection
        rows={rows}
        onRevert={jest.fn()}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        onOpenRecord={jest.fn()}
      />
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('undo · wrote 1 paragraph')).toBeInTheDocument()
    expect(screen.getByText('redo · wrote 1 paragraph')).toBeInTheDocument()
    expect(screen.getByText('undone')).toBeInTheDocument()
  })

  it('resolves to the original label through a redo-then-undo cycle, never nesting a second undo·/redo·', () => {
    const original = record({ action: 'edit_glyph', after: 'flower-02', status: 'undone' })
    const undo = record({
      id: 'undo-1',
      action: 'undo',
      status: 'undone',
      links: { undoOf: 'rec-1' },
      createdAt: '2026-09-30T09:32:00.000Z',
      statusAt: '2026-09-30T09:32:00.000Z',
    })
    const redo = record({
      id: 'redo-1',
      action: 'redo',
      status: 'undone',
      links: { redoOf: 'rec-1' },
      createdAt: '2026-09-30T09:33:00.000Z',
      statusAt: '2026-09-30T09:33:00.000Z',
    })
    const undoOfRedo = record({
      id: 'undo-2',
      action: 'undo',
      status: 'accepted',
      links: { undoOf: 'redo-1' },
      createdAt: '2026-09-30T09:34:00.000Z',
      statusAt: '2026-09-30T09:34:00.000Z',
    })

    const rows = buildPageChanges([undoOfRedo, redo, undo, original])

    render(
      <PageChangesSection
        rows={rows}
        onRevert={jest.fn()}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        onOpenRecord={jest.fn()}
      />
    )

    expect(screen.getByText('mark → flower-02')).toBeInTheDocument()
    expect(screen.getAllByText('undo · mark → flower-02')).toHaveLength(2)
    expect(screen.getByText('redo · mark → flower-02')).toBeInTheDocument()
  })

  it('falls back to the plain word when the undone/redone record is off this page', () => {
    const undo = record({
      id: 'undo-1',
      action: 'undo',
      status: 'accepted',
      links: { undoOf: 'elsewhere' },
    })
    const redo = record({
      id: 'redo-1',
      action: 'redo',
      status: 'accepted',
      links: { redoOf: 'elsewhere' },
    })

    const rows = buildPageChanges([redo, undo])

    render(
      <PageChangesSection
        rows={rows}
        onRevert={jest.fn()}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        onOpenRecord={jest.fn()}
      />
    )

    expect(screen.getByText('undo')).toBeInTheDocument()
    expect(screen.getByText('redo')).toBeInTheDocument()
  })
})
