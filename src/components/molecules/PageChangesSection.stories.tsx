import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { PageChangesSection } from './PageChangesSection'
import { buildPageChangeRows } from '@/lib/change-log/page-change-rows'
import type { ChangeLogRecord } from '@/lib/change-log/types'

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
    before: [{ id: 'a', type: 'text', content: 'electrician, second fix — w/c 29 sep' }],
    after: [{ id: 'a', type: 'text', content: 'electrician, second fix — w/c 6 oct' }],
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
  parameters: { layout: 'fullscreen' },
  args: {
    rows: buildPageChangeRows([record()], []),
    onOpenRecord: fn(),
    onOpenChangeLog: fn(),
    shortcutLabel: '⌥⌘H',
  },
} satisfies Meta<typeof PageChangesSection>

export default meta
type Story = StoryObj<typeof meta>

/** An accepted change: plain mono status, row opens its record. */
export const AcceptedChange: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('changes to this page')).toBeInTheDocument()
    await expect(canvas.getByText('⌥⌘H')).toBeInTheDocument()
    await expect(canvas.getByText('accepted')).toBeInTheDocument()

    const row = canvas.getByRole('button', {
      name: /electrician, second fix — w\/c 29 sep → electrician, second fix — w\/c 6 oct/,
    })
    await expect(row.className).toMatch(/\bw-full\b/)
    await expect(row.className).toMatch(/rounded-\[8px\]/)

    await userEvent.click(row)
    await expect(args.onOpenRecord).toHaveBeenCalledWith('rec-1')
  },
}

/** A proposed record reads as the pill, not plain mono text. */
export const Proposed: Story = {
  args: {
    rows: buildPageChangeRows([record({ id: 'rec-2', status: 'proposed' })], []),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pill = canvas.getByText('proposed')
    await expect(pill).toBeInTheDocument()
    await expect(pill.className).toMatch(/rounded-full/)
  },
}

/** An outdated revert also reads as a pill. */
export const Outdated: Story = {
  args: {
    rows: buildPageChangeRows(
      [record({ id: 'rec-3', action: 'revert', status: 'outdated', links: { revertOf: 'rec-1' } })],
      []
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pill = canvas.getByText('outdated')
    await expect(pill.className).toMatch(/rounded-full/)
  },
}

/** No records for this page: one quiet line, no rows. */
export const Empty: Story = {
  args: { rows: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('no changes to this page yet')).toBeInTheDocument()
  },
}

/** A label long enough to truncate still carries its full text in `title`. */
export const LongLabel: Story = {
  args: {
    rows: buildPageChangeRows(
      [
        record({
          id: 'rec-4',
          before: null,
          after: [{ id: 'a', type: 'text', content: 'a'.repeat(80) }],
        }),
      ],
      []
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const label = canvas.getByText(`${'a'.repeat(60)}…`)
    await expect(label).toHaveAttribute('title', 'a'.repeat(80))
  },
}

/** The pinned foot link navigates to the change log filtered to this page. */
export const OpenInChangeLog: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('open in change log'))
    await expect(args.onOpenChangeLog).toHaveBeenCalled()
  },
}
