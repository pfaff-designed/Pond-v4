/**
 * KAN-152 — `PageChangesSection`'s rows open the record page (`changeLogRecordUrl`,
 * wired by the connected `PageChangesPanel`). Clicking a row's own controls
 * (revert) must not also raise the row's click.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PageChangesSection } from '@/components/molecules/PageChangesSection'
import { buildPageChanges } from '@/lib/change-log/page-changes'
import type { ChangeLogRecord } from '@/lib/change-log/types'

const ACCEPTED_RECORD: ChangeLogRecord = {
  id: 'rec-1',
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'accepted',
  action: 'edit',
  actor: 'pond',
  targetPageId: 'page-1',
  targetBlockId: 'block-1',
  before: [{ id: 'block-1', type: 'text', content: 'kiwi' }],
  after: [{ id: 'block-1', type: 'text', content: 'fig' }],
  sourceThreadId: null,
  toolCallId: null,
  read: null,
  links: {},
  transitions: [],
  createdAt: '2026-09-30T09:31:00.000Z',
  statusAt: '2026-09-30T09:31:00.000Z',
}

test('clicking a row opens its record; clicking revert does not', async () => {
  const onOpenRecord = jest.fn()
  const onRevert = jest.fn()
  const user = userEvent.setup()
  render(
    <PageChangesSection
      rows={buildPageChanges([ACCEPTED_RECORD])}
      onRevert={onRevert}
      onAccept={jest.fn()}
      onReject={jest.fn()}
      onOpenRecord={onOpenRecord}
    />
  )

  await user.click(screen.getByRole('button', { name: 'Revert' }))
  expect(onRevert).toHaveBeenCalledWith('rec-1')
  expect(onOpenRecord).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: /wrote 1 paragraph/ }))
  expect(onOpenRecord).toHaveBeenCalledWith('rec-1')
})
