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

/** One click-to-edit atom per property; edits raise onChange(key, value). */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)

    // A control per property, seeded with the stored value — a click-to-edit
    // atom (KAN-350), not a native `<input>`/`<select>`.
    const titleTrigger = canvas.getByRole('button', { name: 'Title value' })
    await expect(within(titleTrigger).getByText('Build a workbench')).toBeInTheDocument()
    await expect(canvas.getByText('3')).toBeInTheDocument()
    const stageTrigger = canvas.getByRole('button', { name: 'Stage value' })
    await expect(within(stageTrigger).getByText('Doing')).toBeInTheDocument()
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

    // Editing text (click to open, type, commit) raises onChange with the new string.
    await userEvent.click(titleTrigger)
    const titleInput = canvas.getByRole('textbox', { name: 'Title value' })
    await userEvent.type(titleInput, '!')
    await userEvent.keyboard('{Enter}')
    await expect(args.onChange).toHaveBeenLastCalledWith('title', 'Build a workbench!')

    // Toggling the checkbox raises a boolean.
    await userEvent.click(done)
    await expect(args.onChange).toHaveBeenLastCalledWith('done', true)

    // Picking a status option raises the option id. The popover portals to
    // document.body, outside canvasElement.
    await userEvent.click(stageTrigger)
    await userEvent.click(await within(document.body).findByRole('option', { name: 'Done' }))
    await expect(args.onChange).toHaveBeenLastCalledWith('stage', 'done')
  },
}

/** Clearing a value sends null (the canonical empty), not an empty string. */
export const ClearsToNull: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Stage value' }))
    // The leading `clear` row is also the initially-active one, so its
    // accessible name carries the `↵` hint (`PondControl`'s `selected` state
    // paints it) — match with a prefix regex rather than an exact string.
    const clearRow = await within(document.body).findByRole('option', { name: 'clear' })
    await userEvent.click(clearRow)
    await expect(args.onChange).toHaveBeenLastCalledWith('stage', null)
  },
}

/**
 * Read-only: no edit escapes. The text/number/date atom (`AtomEditor`) drops
 * its click target entirely when `editable` is false — a bare `PondAtom`, no
 * `<button>`. The tag editor (`TagValueEditor`) keeps its trigger button (the
 * popover it would open is the affordance to disable, not the display), so it
 * disables the button instead. The checkbox is a base-ui `role="checkbox"`
 * span rather than an input, so its refusal reads as `aria-disabled` — and a
 * click on it emits nothing at all (#221).
 */
export const ReadOnly: Story = {
  args: {
    editable: false,
    values: { title: 'Build a workbench', count: 3, stage: 'doing', done: true },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Build a workbench')).toBeInTheDocument()
    await expect(canvas.getByText('Doing')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Title value' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Stage value' })).toBeDisabled()

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
 * `record` as the eyebrow, the collection's name as the note (KAN-350,
 * `PondBlock.dc.html` `['record', 'recipes']`). The rows ARE `PondMolecule
 * kind="field-row"` — `PondBlock.dc.html`'s properties frame dc-imports the
 * molecule — so the geometry asserted here is the molecule's
 * (`PondMolecule.dc.html` `fieldRow`): grid `140px minmax(0,1fr)` · gap 12 ·
 * min-height 34 · the eyebrow label; the control rides the value cell. KAN-350
 * dropped the molecule's own 360px clamp, so a row's width is whatever the card
 * gives it — not asserted here.
 */
export const InPropertiesCard: Story = {
  render: (args) => (
    <PondBlock {...propertiesFrame(args.schema, 'tasks')}>
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
    await expect(head.children[0].textContent).toBe('record')
    await expect(head.children[0].className).toBe(pageEyebrowClass)
    await expect(head.children[1].textContent).toBe('tasks')

    const rows = Array.from(card.querySelectorAll<HTMLElement>('[data-kind="field-row"]'))
    await expect(rows).toHaveLength(schema.length)
    for (const [i, row] of rows.entries()) {
      const rs = getComputedStyle(row)
      await expect(rs.display).toBe('grid')
      await expect(rs.gridTemplateColumns.split(' ')[0]).toBe('140px')
      await expect(rs.columnGap).toBe('12px')
      await expect(parseFloat(rs.minHeight)).toBe(34)
      const label = row.querySelector<HTMLElement>('[data-part="label"]')!
      await expect(label.textContent).toBe(schema[i].name)
      const ls = getComputedStyle(label)
      await expect(ls.fontSize).toBe('10.5px')
      await expect(ls.fontWeight).toBe('500')
      await expect(ls.textTransform).toBe('uppercase')
    }
    // The controls are live inside the rows — the inspector still edits.
    const titleTrigger = canvas.getByRole('button', { name: 'Title value' })
    await expect(rows[0].contains(titleTrigger)).toBe(true)
    await expect(canvas.getByText('3')).toBeInTheDocument()
  },
}

/**
 * KAN-350 fix: a very long unbroken word (no spaces to wrap on) must truncate
 * inside the value column, not blow the trigger out past the card/viewport —
 * the grid-item `<button>` has `min-width: auto` by default, so this needs
 * `min-w-0 max-w-full` on the trigger, which only a real layout can prove.
 */
export const LongTextTruncates: Story = {
  args: {
    schema: [{ id: 'notes', name: 'Notes', type: 'text' }],
    values: { notes: 'a'.repeat(260) },
  },
  render: (args) => (
    <PondBlock {...propertiesFrame(args.schema, 'tasks')}>
      <PropertyInspector {...args} />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind]')!
    const row = card.querySelector<HTMLElement>('[data-kind="field-row"]')!
    const trigger = canvas.getByRole('button', { name: 'Notes value' })
    await expect(row.contains(trigger)).toBe(true)
    await expect(trigger.getBoundingClientRect().width).toBeLessThanOrEqual(
      row.getBoundingClientRect().width
    )

    // Editing shows the full draft, uncut — only the rest-mode read truncates.
    await userEvent.click(trigger)
    const input = canvas.getByRole('textbox', { name: 'Notes value' }) as HTMLInputElement
    await expect(input.value).toBe('a'.repeat(260))
  },
}

/** A schema with no fields: the frame's empty state — `no fields yet`, no dead action. */
export const EmptyInCard: Story = {
  args: { schema: [], values: {} },
  render: (args) => (
    <PondBlock {...propertiesFrame(args.schema, 'tasks')}>
      <PropertyInspector {...args} />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind]')!
    await expect(card.dataset.blockKind).toBe('properties')
    await expect(card.dataset.blockState).toBe('empty')
    // The note still names the collection — the frame does not drop it when empty.
    await expect((card.firstElementChild as HTMLElement).children[1].textContent).toBe('tasks')
    await expect(canvas.getByText('no fields yet')).toBeInTheDocument()
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
    await expect(canvas.queryByText(/no properties/i)).not.toBeInTheDocument()
  },
}
