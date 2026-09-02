import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { PropertyInspector } from './PropertyInspector'
import type { PropertySchema } from '@/lib/properties/schema'

const schema: PropertySchema = [
  { id: 'title', name: 'Title', type: 'text' },
  { id: 'count', name: 'Count', type: 'number' },
  { id: 'due', name: 'Due', type: 'date' },
  {
    id: 'stage',
    name: 'Stage',
    type: 'status',
    options: [
      { id: 'todo', label: 'To do' },
      { id: 'doing', label: 'Doing' },
      { id: 'done', label: 'Done', color: '#5f7355' },
    ],
  },
  { id: 'done', name: 'Done', type: 'checkbox' },
  { id: 'links', name: 'Links', type: 'relation' },
]

const meta = {
  title: 'Molecules/PropertyInspector',
  component: PropertyInspector,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-[28rem] bg-press-paper p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    schema,
    values: { title: 'Build a workbench', count: 3, stage: 'doing', done: false },
    onChange: fn(),
  },
} satisfies Meta<typeof PropertyInspector>

export default meta
type Story = StoryObj<typeof meta>

/** One labeled control per property; edits raise onChange(key, value). */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)

    // A control per property, seeded with the stored value.
    const title = canvas.getByLabelText('Title value') as HTMLInputElement
    await expect(title).toHaveValue('Build a workbench')
    await expect(canvas.getByLabelText('Count value')).toHaveValue(3)
    await expect(canvas.getByLabelText('Stage value')).toHaveValue('doing')
    const done = canvas.getByLabelText('Done value') as HTMLInputElement
    await expect(done.checked).toBe(false)

    // Editing text raises onChange with the new string.
    await userEvent.type(title, '!')
    await expect(args.onChange).toHaveBeenLastCalledWith('title', 'Build a workbench!')

    // Toggling the checkbox raises a boolean.
    await userEvent.click(done)
    await expect(args.onChange).toHaveBeenLastCalledWith('done', true)

    // Picking a status option raises the option id.
    await userEvent.selectOptions(canvas.getByLabelText('Stage value'), 'done')
    await expect(args.onChange).toHaveBeenLastCalledWith('stage', 'done')
  },
}

/** Clearing a value sends null (the canonical empty), not an empty string. */
export const ClearsToNull: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByLabelText('Stage value'), '—')
    await expect(args.onChange).toHaveBeenLastCalledWith('stage', null)
  },
}

/** Read-only: every control is disabled, no edit escapes. */
export const ReadOnly: Story = {
  args: { editable: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Title value')).toBeDisabled()
    await expect(canvas.getByLabelText('Stage value')).toBeDisabled()
  },
}

/** A page with no properties yet gets a quiet empty line. */
export const Empty: Story = {
  args: { schema: [], values: {} },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/no properties/i)).toBeInTheDocument()
  },
}
