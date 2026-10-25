import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { PageTitleRow } from './PageTitleRow'

/**
 * `Pond 06.21` 6u.1 — the title row standalone. `LongTitleWraps`' play proves
 * the textarea grows past one line instead of clipping (KAN-464).
 */
const meta = {
  title: 'Organisms/6u · the page title row',
  component: PageTitleRow,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PageTitleRow>

export default meta
type Story = StoryObj<typeof meta>

export const LongTitleWraps: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 560 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    zen: null,
    value: 'KITCHEN RENOVATION PLAN FOR THE SPRING',
    placeholder: 'page name',
    eyebrow: 'saved',
    readOnly: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const title = await canvas.findByLabelText('Page title')
    // One line at 38px/1.15 is ~44px; a wrapped title clears that by a wide margin.
    await expect(title.getBoundingClientRect().height).toBeGreaterThan(60)
  },
}

export const Empty: Story = {
  args: {
    zen: null,
    value: '',
    placeholder: 'page name',
    eyebrow: 'new — in life',
    readOnly: true,
  },
}

export const Zen: Story = {
  args: {
    zen: { onInk: false },
    value: 'Kitchen renovation plan',
    placeholder: 'page name',
    eyebrow: 'saved',
    readOnly: true,
  },
}
