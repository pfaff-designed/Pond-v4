import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { BacklinksSection } from './BacklinksSection'
import type { BacklinkGroup } from '@/lib/modules/view/compute-backlinks'

/**
 * The read-only "Linked from" section (#39): a page's backlinks, grouped by the
 * source property that points at it.
 *
 * Deliberately read-only — backlinks are DERIVED, so there is nothing to unlink
 * here. The chips reuse `RelationChip` WITHOUT `onRemove`, so no × is drawn; the
 * unlink lives on the forward side (the source row's relation cell, covered in
 * Organisms/RelationValueField). Clicking a chip opens that source row.
 */
const GROUPS: BacklinkGroup[] = [
  {
    sourceCollectionId: 'col-tasks',
    sourceCollectionTitle: 'Tasks',
    propertyId: 'p-project',
    propertyName: 'Project',
    rows: [
      { id: 'row-bench', title: 'Sand the bench' },
      { id: 'row-oil', title: 'Oil the top' },
    ],
  },
  {
    sourceCollectionId: 'col-reading',
    sourceCollectionTitle: 'Reading list',
    propertyId: 'p-related',
    propertyName: 'Related',
    rows: [{ id: 'row-nakashima', title: 'The Soul of a Tree' }],
  },
]

const meta = {
  title: 'Molecules/BacklinksSection',
  component: BacklinksSection,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-xl bg-mn-surface p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    groups: GROUPS,
    onOpen: fn(),
  },
} satisfies Meta<typeof BacklinksSection>

export default meta
type Story = StoryObj<typeof meta>

/**
 * One labelled group per source property, its rows as read-only chips: every
 * chip opens its source row, and none of them carries a × (nothing to unlink
 * from the derived side).
 */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const section = within(
      canvasElement.querySelector<HTMLElement>('section[aria-label="Linked from"]')!
    )
    await expect(section.getByRole('heading', { name: 'Linked from' })).toBeInTheDocument()

    // A group label per source property, and a chip per inbound row.
    for (const group of GROUPS) {
      await expect(
        section.getByText(`${group.sourceCollectionTitle} · ${group.propertyName}`)
      ).toBeInTheDocument()
      for (const row of group.rows) {
        await expect(section.getByRole('button', { name: row.title })).toBeInTheDocument()
      }
    }

    // Read-only: derived links have no × to unlink them.
    await expect(section.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()

    // Each chip opens its OWN source row, by id.
    for (const row of GROUPS.flatMap((g) => g.rows)) {
      await userEvent.click(section.getByRole('button', { name: row.title }))
      await expect(args.onOpen).toHaveBeenLastCalledWith(row.id)
    }
  },
}

/**
 * Nothing links here — the section renders nothing at all, rather than a heading
 * over an empty box. Backlinks are quiet noise on the many pages nothing points at.
 */
export const Empty: Story = {
  args: { groups: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('section')).toBeNull()
    await expect(canvasElement).not.toHaveTextContent('Linked from')
  },
}
