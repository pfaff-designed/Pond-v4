import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { PropertyInspector } from './PropertyInspector'
import { PondBlock } from '@/components/organisms/PondBlock'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { propertiesFrame } from '@/lib/modules/block-frame'
import type { PropertySchema } from '@/lib/properties/schema'

// The relation row (below) renders the connected RelationValueField, which reads
// react-query. Seed an empty workspace list so its untargeted candidate query
// resolves from cache (staleTime Infinity → no network); appDirectory (params)
// mounts the router the chip onOpen needs. Relation edit/chip behavior itself is
// covered in Organisms/RelationValueField — here the relation value is empty.
const storyClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
})
storyClient.setQueryData(['pages', 'main', 'full'], [])

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
  parameters: { layout: 'centered', nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <QueryClientProvider client={storyClient}>
        <div className="w-[28rem] bg-mn-surface p-6">
          <Story />
        </div>
      </QueryClientProvider>
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
    // The checkbox property IS `PondControl kind="checkbox"` (#221): a base-ui
    // `role="checkbox"` span inside the control's own `[data-kind]` root, so its
    // state is `aria-checked`, not `.checked` — and the bare
    // `<input type="checkbox">` this call site used to hand-roll is gone (only
    // base-ui's own aria-hidden shadow input may remain).
    const done = canvas.getByLabelText('Done value')
    await expect(done).toHaveAttribute('role', 'checkbox')
    await expect(done).toHaveAttribute('aria-checked', 'false')
    await expect(done.closest('[data-kind="checkbox"]')).not.toBeNull()
    await expect(
      canvasElement.querySelector('input[type="checkbox"]:not([aria-hidden])')
    ).toBeNull()

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

/**
 * Read-only: every control is disabled, no edit escapes. The checkbox is a
 * base-ui `role="checkbox"` span rather than an input, so its refusal reads as
 * `aria-disabled` — and a click on it emits nothing at all (#221).
 */
export const ReadOnly: Story = {
  args: {
    editable: false,
    values: { title: 'Build a workbench', count: 3, stage: 'doing', done: true },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Title value')).toBeDisabled()
    await expect(canvas.getByLabelText('Stage value')).toBeDisabled()

    const done = canvas.getByLabelText('Done value')
    await expect(done).toHaveAttribute('aria-checked', 'true')
    await expect(done).toHaveAttribute('aria-disabled', 'true')
    // Disabled takes the pointer out first — then force the click through anyway,
    // because `aria-disabled` is an announcement and the refusal has to be real.
    await expect(getComputedStyle(done).pointerEvents).toBe('none')
    await userEvent.click(done, { pointerEventsCheck: 0 })
    await expect(args.onChange).not.toHaveBeenCalled()
  },
}

/**
 * #260 — framed, as DocumentPanel mounts it: the board's `properties` card (400),
 * `properties` as the eyebrow, the field count as the note. The rows ARE
 * `PondMolecule kind="field-row"` — `PondBlock.dc.html`'s properties frame
 * dc-imports the molecule — so the geometry asserted here is the molecule's
 * (`PondMolecule.dc.html` `fieldRow`): grid `140px minmax(0,1fr)` · gap 12 ·
 * min-height 34 · width 360 · the eyebrow label; the control rides the value cell.
 */
export const InPropertiesCard: Story = {
  render: (args) => (
    <PondBlock {...propertiesFrame(args.schema)}>
      <PropertyInspector {...args} />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind]')!
    await expect(card.dataset.blockKind).toBe('properties')
    await expect(card.dataset.blockState).toBe('rest')
    // ADR 0008: the card fills its container, not the board's old 400px.
    const cp = card.parentElement!
    const cps = getComputedStyle(cp)
    const cavail = cp.clientWidth - parseFloat(cps.paddingLeft) - parseFloat(cps.paddingRight)
    await expect(card.getBoundingClientRect().width).toBeCloseTo(cavail, 0)
    const head = card.firstElementChild as HTMLElement
    await expect(head.children[0].textContent).toBe('properties')
    await expect(head.children[0].className).toBe(pageEyebrowClass)
    await expect(head.children[1].textContent).toBe('6 fields')

    const rows = Array.from(card.querySelectorAll<HTMLElement>('[data-kind="field-row"]'))
    await expect(rows).toHaveLength(schema.length)
    for (const [i, row] of rows.entries()) {
      const rs = getComputedStyle(row)
      await expect(rs.display).toBe('grid')
      await expect(rs.gridTemplateColumns.split(' ')[0]).toBe('140px')
      await expect(rs.columnGap).toBe('12px')
      await expect(parseFloat(rs.minHeight)).toBe(34)
      await expect(parseFloat(rs.width)).toBe(360)
      const label = row.querySelector<HTMLElement>('[data-part="label"]')!
      await expect(label.textContent).toBe(schema[i].name)
      const ls = getComputedStyle(label)
      await expect(ls.fontSize).toBe('10.5px')
      await expect(ls.fontWeight).toBe('500')
      await expect(ls.textTransform).toBe('uppercase')
    }
    // The controls are live inside the rows — the inspector still edits.
    await expect(rows[0].contains(canvas.getByLabelText('Title value'))).toBe(true)
    await expect(canvas.getByLabelText('Count value')).toHaveValue(3)
  },
}

/** A schema with no fields: the frame's empty state — `no fields yet`, no dead action. */
export const EmptyInCard: Story = {
  args: { schema: [], values: {} },
  render: (args) => (
    <PondBlock {...propertiesFrame(args.schema)}>
      <PropertyInspector {...args} />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind]')!
    await expect(card.dataset.blockKind).toBe('properties')
    await expect(card.dataset.blockState).toBe('empty')
    // The note still counts, at zero — the frame does not drop it when empty.
    await expect((card.firstElementChild as HTMLElement).children[1].textContent).toBe('0 fields')
    await expect(canvas.getByText('no fields yet')).toBeInTheDocument()
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
    await expect(canvas.queryByText(/no properties/i)).not.toBeInTheDocument()
  },
}
