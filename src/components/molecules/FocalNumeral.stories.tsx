import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { FocalNumeral } from './FocalNumeral'

const meta = {
  title: 'Molecules/FocalNumeral',
  component: FocalNumeral,
  parameters: { layout: 'centered' },
  args: { value: '12', caption: '12 pages within, 4 tucked deeper.' },
} satisfies Meta<typeof FocalNumeral>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('12')).toBeInTheDocument()
    await expect(canvas.getByText('12 pages within, 4 tucked deeper.')).toBeInTheDocument()
  },
}

export const Zero: Story = {
  args: { value: '0', caption: 'Nothing here yet.' },
}
