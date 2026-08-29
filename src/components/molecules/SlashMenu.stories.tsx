import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SlashMenu } from './SlashMenu'

const items = [
  { id: 'text', name: 'Text', description: 'A prose block written in markdown.' },
  { id: 'todo', name: 'Todo', description: 'A checklist of items, each toggleable done/undone.' },
  { id: 'metric', name: 'Metric', description: 'A single labelled figure.' },
  { id: 'table', name: 'Table', description: 'A structured table of rows and columns.' },
]

const meta: Meta<typeof SlashMenu> = {
  title: 'Molecules/SlashMenu',
  component: SlashMenu,
}
export default meta
type Story = StoryObj<typeof SlashMenu>

export const Default: Story = {
  args: { items, onSelect: () => {}, onClose: () => {} },
}
export const WithFilter: Story = {
  args: { items, onSelect: () => {}, onClose: () => {} },
  // user would type "t" to filter
}
export const Empty: Story = {
  args: { items: [], onSelect: () => {}, onClose: () => {} },
}
