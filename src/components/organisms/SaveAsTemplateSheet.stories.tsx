import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { SaveAsTemplateBody } from './SaveAsTemplateSheet'

/**
 * The name-and-keep sheet's body — `Pond 06.09` (`6i`) frame 3.
 *
 * The NAME field is not here: in sheet mode the ⌘K palette's own head input
 * becomes it, because the board transforms the palette in place rather than
 * covering it. These stories therefore cover everything below that rule — the
 * `keep` rows, the summary line, and the buttons.
 *
 * Every assertion is the COMPUTED value against the board's own inline markup, in
 * both themes, never a class name: a class-string assertion cannot see a wrong
 * ink tier, which is exactly what #252 shipped.
 *
 *   keep label  padding 10/12/4 · 10.5 · tracking .04em · ink .68
 *   check row   padding 8/12 · gap 10 · 12.5
 *   summary     padding 8/12/4 · 10.5 · tracking .04em · ink .68
 *   foot        gap 7 · padding 10/12/6
 */

const SUMMARY = '6 blocks — big number, list, checklist, heading, text, entry log'

const meta = {
  title: 'Organisms/SaveAsTemplateSheet',
  component: SaveAsTemplateBody,
  parameters: { layout: 'padded' },
  args: {
    keepContent: false,
    onKeepContentChange: fn(),
    summary: SUMMARY,
    canSave: true,
    saving: false,
    error: null,
    onSave: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof SaveAsTemplateBody>

export default meta
type Story = StoryObj<typeof meta>

const INK_68_PAPER = 'rgba(27, 29, 20, 0.68)'
const INK_68_DARK = 'rgba(250, 249, 239, 0.68)'

const px = (v: string) => parseFloat(v)
const part = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`)!
const keepRow = (root: HTMLElement, label: string) =>
  root.querySelector<HTMLElement>(`[data-part="keep-row"][data-label="${label}"]`)!
const body = (canvas: HTMLElement) =>
  canvas.querySelector<HTMLElement>('[data-part="save-as-template"]')!

/** The board's geometry, identical in both themes. */
async function assertGeometry(root: HTMLElement) {
  const label = getComputedStyle(part(root, 'keep-label'))
  await expect(px(label.fontSize)).toBeCloseTo(10.5, 1)
  // .04em at 10.5px = 0.42px.
  await expect(px(label.letterSpacing)).toBeCloseTo(0.42, 1)
  await expect(px(label.paddingTop)).toBeCloseTo(10, 1)
  await expect(px(label.paddingLeft)).toBeCloseTo(12, 1)

  const row = getComputedStyle(keepRow(root, 'this page’s content'))
  await expect(px(row.paddingTop)).toBeCloseTo(8, 1)
  await expect(px(row.paddingLeft)).toBeCloseTo(12, 1)
  await expect(px(row.fontSize)).toBeCloseTo(12.5, 1)
  await expect(px(row.columnGap)).toBeCloseTo(10, 1)

  const summary = getComputedStyle(part(root, 'summary'))
  await expect(px(summary.fontSize)).toBeCloseTo(10.5, 1)
  await expect(px(summary.letterSpacing)).toBeCloseTo(0.42, 1)
  await expect(px(summary.paddingTop)).toBeCloseTo(8, 1)

  const foot = getComputedStyle(part(root, 'foot'))
  await expect(px(foot.columnGap)).toBeCloseTo(7, 1)
  await expect(px(foot.paddingLeft)).toBeCloseTo(12, 1)
  await expect(px(foot.paddingTop)).toBeCloseTo(10, 1)
  await expect(px(foot.paddingBottom)).toBeCloseTo(6, 1)
}

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const c = body(canvasElement)
    await assertGeometry(c)

    // The three boxes, in the board's order.
    const labels = [...c.querySelectorAll<HTMLElement>('[data-part="keep-row"]')].map(
      (r) => r.dataset.label
    )
    await expect(labels).toEqual([
      'structure and labels',
      'placeholder text',
      'this page’s content',
    ])

    // The frame's caption as state: the stack and the labels, NOT the content.
    const content = within(keepRow(c, 'this page’s content')).getByRole('checkbox')
    await expect(content).toHaveAttribute('aria-checked', 'false')

    await expect(getComputedStyle(part(c, 'keep-label')).color).toBe(INK_68_PAPER)
    await expect(part(c, 'summary')).toHaveTextContent(SUMMARY)
  },
}

export const Ink: Story = {
  decorators: [
    (Story) => (
      <div className="dark bg-raw-ink p-mn-4">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const c = body(canvasElement)
    // Geometry does not move between themes; only the tiers reassign.
    await assertGeometry(c)
    await expect(getComputedStyle(part(c, 'keep-label')).color).toBe(INK_68_DARK)
    await expect(getComputedStyle(part(c, 'summary')).color).toBe(INK_68_DARK)
  },
}

/**
 * The two boxes the board draws ON and never captions unticking for. They render
 * in `PondControl`'s own `disabled` state — the #316 precedent: the board is
 * drawn whole, and nothing pretends to be live.
 *
 * `aria-disabled`, not `disabled`: base-ui's Checkbox is a `<span
 * role="checkbox">`, which cannot carry the HTML attribute. The ARIA state is the
 * stronger assertion anyway — it is what a screen reader reads.
 */
export const TheTwoFixedBoxes: Story = {
  play: async ({ canvasElement }) => {
    const c = body(canvasElement)
    for (const label of ['structure and labels', 'placeholder text']) {
      const box = within(keepRow(c, label)).getByRole('checkbox')
      await expect(box).toHaveAttribute('aria-checked', 'true')
      await expect(box).toHaveAttribute('aria-disabled', 'true')
      // Not reachable by keyboard either, so the row cannot be toggled at all.
      await expect(box).toHaveAttribute('tabindex', '-1')
    }
  },
}

/**
 * DIVERGENCE, recorded rather than papered over (KAN-24).
 *
 * `6i`'s row box is **12×12 at radius 3**; `PondControl kind="checkbox"` ships
 * **14×14 at radius 4**. `PondControl.tsx`'s header already enumerates the family:
 * the control is 14/4, `PondAtom kind="checkbox"` is the 12/3 inline atom a
 * `check-row` composes, and `PondTemplate.dc.html`'s is 13/3. So 6i draws the
 * ATOM — but the atom carries no handlers at all (#224), so composing it here
 * would mean hand-rolling the ARIA state machine. This pins what ships.
 */
export const BoxMetricsAsShipped: Story = {
  play: async ({ canvasElement }) => {
    const c = body(canvasElement)
    const cs = getComputedStyle(within(keepRow(c, 'this page’s content')).getByRole('checkbox'))
    await expect(px(cs.width)).toBeCloseTo(14, 1)
    await expect(px(cs.height)).toBeCloseTo(14, 1)
    await expect(px(cs.borderTopLeftRadius)).toBeCloseTo(4, 1)
    await expect(cs.boxShadow).toContain('inset')
  },
}

export const ContentTicked: Story = {
  args: { keepContent: true },
  play: async ({ canvasElement, args }) => {
    const c = body(canvasElement)
    const box = within(keepRow(c, 'this page’s content')).getByRole('checkbox')
    await expect(box).toHaveAttribute('aria-checked', 'true')
    // And it is the one row that answers a click.
    await userEvent.click(box)
    await expect(args.onKeepContentChange).toHaveBeenCalled()
  },
}

/** The summary is what the person reads before committing — so it must render. */
export const SummaryLine: Story = {
  args: { summary: '1 block — text' },
  play: async ({ canvasElement }) => {
    await expect(part(body(canvasElement), 'summary')).toHaveTextContent('1 block — text')
  },
}

export const EmptyPage: Story = {
  args: { summary: 'no blocks yet' },
  play: async ({ canvasElement }) => {
    // An empty page still draws the row, rather than trailing an em dash.
    await expect(part(body(canvasElement), 'summary')).toHaveTextContent('no blocks yet')
  },
}

export const NameIsRequired: Story = {
  args: { canSave: false },
  play: async ({ canvasElement, args }) => {
    const c = body(canvasElement)
    await expect(within(c).getByRole('button', { name: 'save template' })).toBeDisabled()
    await expect(args.onSave).not.toHaveBeenCalled()
  },
}

export const Saving: Story = {
  args: { saving: true, canSave: false },
  play: async ({ canvasElement }) => {
    const c = body(canvasElement)
    // The button says what is happening and cannot be pressed twice.
    await expect(within(c).getByRole('button', { name: 'saving…' })).toBeDisabled()
  },
}

/**
 * A same-pond name collision is the person's to resolve: `createTemplate` raises
 * `DuplicateTemplateNameError` and deliberately does NOT auto-suffix the way
 * `createPage` does (#84). So the sheet stays open carrying the message, and save
 * is offered again rather than left dead.
 */
export const NameAlreadyTaken: Story = {
  args: { error: 'A template named “weeknight recipe” already exists in this pond.' },
  play: async ({ canvasElement }) => {
    const c = body(canvasElement)
    const alert = await within(c).findByRole('alert')
    await expect(alert).toHaveTextContent('already exists in this pond')
    await expect(within(c).getByRole('button', { name: 'save template' })).toBeEnabled()
  },
}

export const Cancel: Story = {
  play: async ({ canvasElement, args }) => {
    const c = body(canvasElement)
    await userEvent.click(within(c).getByRole('button', { name: 'cancel' }))
    await expect(args.onCancel).toHaveBeenCalled()
    await expect(args.onSave).not.toHaveBeenCalled()
  },
}
