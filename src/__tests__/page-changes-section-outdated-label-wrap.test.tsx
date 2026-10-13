/**
 * KAN-303 item 5 — the outdated row's "out of date — revert it again" label was
 * a `shrink-0` single-line sibling in a non-wrapping flex row, so at the panel's
 * actual 320px width it clipped at the right edge instead of wrapping. It must
 * sit on its own full-width line within the `<li>` instead.
 */

import { render, screen } from '@testing-library/react'

import { PageChangesSection } from '@/components/molecules/PageChangesSection'
import { buildPageChanges } from '@/lib/change-log/page-changes'
import type { ChangeLogRecord } from '@/lib/change-log/types'

const OUTDATED_RECORD: ChangeLogRecord = {
  id: 'rev-1',
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'outdated',
  action: 'revert',
  actor: 'you',
  targetPageId: 'page-1',
  targetBlockId: null,
  before: [],
  after: [],
  sourceThreadId: null,
  toolCallId: 'call-1',
  read: null,
  links: { revertOf: 'rec-1' },
  transitions: [],
  createdAt: '2026-09-30T09:31:00.000Z',
  statusAt: '2026-09-30T09:31:00.000Z',
}

test('the outdated label wraps on its own line, not clipped, at the panel width', () => {
  const { container } = render(
    <div style={{ width: 320 }}>
      <PageChangesSection
        rows={buildPageChanges([OUTDATED_RECORD])}
        onRevert={jest.fn()}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />
    </div>,
  )

  const label = screen.getByText('out of date — revert it again')

  // Still a single line, no mid-word truncation.
  expect(label.closest('.truncate')).toBeNull()

  // The label sits on a row of its own after a flex-wrap, not squeezed in as a
  // same-line `shrink-0` sibling that would clip against the 320px edge.
  expect(label.className).not.toMatch(/\bshrink-0\b/)
  expect(label.className).toMatch(/\bw-full\b|\bbasis-full\b/)

  const row = label.closest('li')
  expect(row).not.toBeNull()
  expect(row?.className).toMatch(/\bflex-wrap\b/)

  expect(container).not.toBeNull()
})
