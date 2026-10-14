import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { PageChangesSection } from './PageChangesSection'
import { buildPageChanges } from '@/lib/change-log/page-changes'
import type { ChangeLogRecord } from '@/lib/change-log/types'

const BEFORE = [{ id: 'a', type: 'text', content: 'electrician, second fix — w/c 29 sep' }]
const AFTER = [{ id: 'a', type: 'text', content: 'electrician, second fix — w/c 6 oct' }]

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: BEFORE,
    after: AFTER,
    sourceThreadId: null,
    toolCallId: 'call-1',
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-30T09:31:00.000Z',
    statusAt: '2026-09-30T09:31:00.000Z',
    ...over,
  }
}

const meta = {
  title: 'Molecules/PageChangesSection',
  component: PageChangesSection,
  parameters: { layout: 'padded' },
  args: {
    rows: buildPageChanges([record()]),
    onRevert: fn(),
    onAccept: fn(),
    onReject: fn(),
    onOpenRecord: fn(),
  },
} satisfies Meta<typeof PageChangesSection>

export default meta
type Story = StoryObj<typeof meta>

/** An accepted change offers a revert, and nothing else. Records are read-only. */
export const AcceptedChange: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('wrote 1 paragraph')).toBeInTheDocument()
    await expect(canvas.getByText('accepted')).toBeInTheDocument()

    const revert = canvas.getByRole('button', { name: 'Revert' })
    await userEvent.click(revert)
    await expect(args.onRevert).toHaveBeenCalledWith('rec-1')

    // "Revert goes through accept like any change" — so an accepted record has no
    // accept/reject of its own to answer.
    await expect(canvas.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
  },
}

/** A raised revert is answerable, and the change it reverts stops offering one. */
export const RevertWaiting: Story = {
  args: {
    rows: buildPageChanges([
      record({
        id: 'rev-1',
        action: 'revert',
        status: 'proposed',
        actor: 'you',
        before: AFTER,
        after: BEFORE,
        links: { revertOf: 'rec-1' },
        createdAt: '2026-09-30T10:02:00.000Z',
      }),
      record(),
    ]),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('proposed')).toBeInTheDocument()
    // The original still reads `accepted` while its revert is only proposed —
    // storyboard frame 4's `reverted by` is a field, not a status.
    await expect(canvas.getByText('accepted')).toBeInTheDocument()
    await expect(canvas.getByText('revert waiting')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Revert' })).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'accept' }))
    await expect(args.onAccept).toHaveBeenCalledWith('rev-1')
    await userEvent.click(canvas.getByRole('button', { name: 'reject' }))
    await expect(args.onReject).toHaveBeenCalledWith('rev-1')
  },
}

/** An outdated revert: accept is withdrawn, per spec #110 criterion 5. */
export const OutdatedRevert: Story = {
  args: {
    rows: buildPageChanges([
      record({
        id: 'rev-1',
        action: 'revert',
        status: 'outdated',
        actor: 'you',
        links: { revertOf: 'rec-1' },
      }),
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('outdated')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
  },
}

/** Most pages have never been changed by Pond — say so, don't show a blank frame. */
export const Empty: Story = {
  args: { rows: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('nothing logged for this page yet')).toBeInTheDocument()
  },
}

/** A failed write says what went wrong instead of silently doing nothing. */
export const WithError: Story = {
  args: { error: 'those blocks have changed since — ask Pond to revise this revert' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toBeInTheDocument()
  },
}
