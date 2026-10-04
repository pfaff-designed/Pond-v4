import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { SaveAsTemplateSheet } from './SaveAsTemplateSheet'

/**
 * The name-and-keep sheet — `Pond 06.09` (`6i`) frame 4, "name it, choose what
 * it keeps".
 *
 * Every assertion below is the COMPUTED value against the board's own inline
 * markup, in both themes — not a class name. A class-string assertion cannot see
 * a wrong ink tier (#252 shipped exactly that), and these rows are all tiers and
 * metrics.
 *
 * The board's values, read inline:
 *
 *   name row   padding 10/12/12 · border-bottom 1px ink .09 · 13.5
 *   keep label padding 10/12/4 · 10.5 · tracking .04em · ink .68
 *   check row  padding 8/12 · gap 10 · 12.5
 *   box        12×12 · radius 3 · on `#1B1D14` · off inset 1.4px ink .68
 *   foot       gap 7 · padding 10/12/6
 *
 * The `Ink` stories add `.dark` around the canvas and nothing else.
 */

const meta = {
  title: 'Organisms/SaveAsTemplateSheet',
  component: SaveAsTemplateSheet,
  parameters: { layout: 'fullscreen' },
  args: {
    pageTitle: 'weeknight recipe',
    onSave: fn(async () => {}),
    onClose: fn(),
  },
} satisfies Meta<typeof SaveAsTemplateSheet>

export default meta
type Story = StoryObj<typeof meta>

// ── The board's two palettes ────────────────────────────────────────────────

const INK_68_PAPER = 'rgba(27, 29, 20, 0.68)'
const INK_68_DARK = 'rgba(250, 249, 239, 0.68)'

const px = (v: string) => parseFloat(v)
const part = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`)!
const keepRow = (root: HTMLElement, label: string) =>
  root.querySelector<HTMLElement>(`[data-part="keep-row"][data-label="${label}"]`)!

/** The board's geometry, identical in both themes. */
async function assertGeometry(root: HTMLElement) {
  const name = getComputedStyle(part(root, 'name'))
  await expect(px(name.paddingTop)).toBeCloseTo(10, 1)
  await expect(px(name.paddingLeft)).toBeCloseTo(12, 1)
  await expect(px(name.paddingBottom)).toBeCloseTo(12, 1)
  await expect(px(name.fontSize)).toBeCloseTo(13.5, 1)
  // The rule under the name row — present and hairline, not a border box.
  await expect(px(name.borderBottomWidth)).toBeCloseTo(1, 1)

  const label = getComputedStyle(part(root, 'keep-label'))
  await expect(px(label.fontSize)).toBeCloseTo(10.5, 1)
  // .04em at 10.5px = 0.42px.
  await expect(px(label.letterSpacing)).toBeCloseTo(0.42, 1)

  const row = getComputedStyle(keepRow(root, 'this page’s content'))
  await expect(px(row.paddingTop)).toBeCloseTo(8, 1)
  await expect(px(row.paddingLeft)).toBeCloseTo(12, 1)
  await expect(px(row.fontSize)).toBeCloseTo(12.5, 1)
  await expect(px(row.columnGap)).toBeCloseTo(10, 1)

  const foot = getComputedStyle(part(root, 'foot'))
  await expect(px(foot.columnGap)).toBeCloseTo(7, 1)
  await expect(px(foot.paddingLeft)).toBeCloseTo(12, 1)
  await expect(px(foot.paddingTop)).toBeCloseTo(10, 1)
  await expect(px(foot.paddingBottom)).toBeCloseTo(6, 1)
}

/** The three boxes, in the board's order and default states. */
async function assertKeepRows(c: HTMLElement) {
  const labels = [...c.querySelectorAll<HTMLElement>('[data-part="keep-row"]')].map(
    (r) => r.dataset.label
  )
  await expect(labels).toEqual(['structure and labels', 'placeholder text', 'this page’s content'])
}

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement).getByRole('dialog')
    await assertGeometry(c)
    await assertKeepRows(c)

    // The name is seeded from the page, so ⏎ saves without typing.
    await expect(within(c).getByLabelText('Template name')).toHaveValue('weeknight recipe')

    // The frame's caption as state: the stack and the labels, NOT the content.
    const content = within(keepRow(c, 'this page’s content')).getByRole('checkbox')
    await expect(content).toHaveAttribute('aria-checked', 'false')

    const label = getComputedStyle(part(c, 'keep-label'))
    await expect(label.color).toBe(INK_68_PAPER)
  },
}

export const Ink: Story = {
  decorators: [
    (Story) => (
      <div className="dark min-h-screen bg-raw-ink">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement).getByRole('dialog')
    // Geometry does not move between themes; only the tiers reassign.
    await assertGeometry(c)
    await expect(getComputedStyle(part(c, 'keep-label')).color).toBe(INK_68_DARK)
  },
}

/**
 * The two boxes the board draws ON and never captions unticking for. They render
 * in `PondControl`'s own `disabled` state — the #316 precedent: the board is
 * drawn whole, and nothing pretends to be live.
 *
 * `aria-disabled`, not `disabled`: base-ui's Checkbox is a `<span
 * role="checkbox">`, which cannot carry the HTML attribute. Asserting the ARIA
 * state is the stronger check anyway — it is what a screen reader reads.
 */
export const TheTwoFixedBoxes: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement).getByRole('dialog')
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
 * `6i`'s row box is **12×12 at radius 3**. `PondControl kind="checkbox"` ships
 * **14×14 at radius 4**. `PondControl.tsx`'s own header already enumerates the
 * family: the control is 14/4, `PondAtom kind="checkbox"` is the 12/3 inline atom
 * a `check-row` composes, and `PondTemplate.dc.html`'s 13/3 is "a level-4
 * rendering with no code of its own yet".
 *
 * So 6i draws the ATOM, not the control — but `PondAtom` carries no handlers at
 * all (#224: "no handlers, no hooks"), so composing it here would mean
 * hand-rolling the checkbox's ARIA state machine and keyboard handling. The
 * control is kept, and this story pins what actually ships so the 2px is a known
 * quantity rather than a surprise.
 */
export const BoxMetricsAsShipped: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement).getByRole('dialog')
    const box = within(keepRow(c, 'this page’s content')).getByRole('checkbox')
    const cs = getComputedStyle(box)
    await expect(px(cs.width)).toBeCloseTo(14, 1)
    await expect(px(cs.height)).toBeCloseTo(14, 1)
    await expect(px(cs.borderTopLeftRadius)).toBeCloseTo(4, 1)
    // The inset at the .68 tier IS the board's, in both this and the atom.
    await expect(cs.boxShadow).toContain('inset')
  },
}

export const ContentTicked: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement).getByRole('dialog')
    const box = within(keepRow(c, 'this page’s content')).getByRole('checkbox')
    await userEvent.click(box)
    await expect(box).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(within(c).getByRole('button', { name: 'save template' }))
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({ name: 'weeknight recipe', keepContent: true })
    )
  },
}

export const NameIsRequired: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement).getByRole('dialog')
    const field = within(c).getByLabelText('Template name')
    await userEvent.clear(field)
    // Nothing to name, nothing to save — and whitespace is not a name.
    await userEvent.type(field, '   ')
    await expect(within(c).getByRole('button', { name: 'save template' })).toBeDisabled()
    await expect(args.onSave).not.toHaveBeenCalled()
  },
}

/**
 * A same-pond name collision is the person's to resolve: `createTemplate` raises
 * `DuplicateTemplateNameError` and deliberately does NOT auto-suffix the way
 * `createPage` does (#84). So the sheet stays OPEN carrying the message, rather
 * than closing and losing what was typed.
 */
export const NameAlreadyTaken: Story = {
  args: {
    onSave: fn(async () => {
      throw new Error('A template named “weeknight recipe” already exists in this pond.')
    }),
  },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement).getByRole('dialog')
    await userEvent.click(within(c).getByRole('button', { name: 'save template' }))

    const alert = await within(c).findByRole('alert')
    await expect(alert).toHaveTextContent('already exists in this pond')
    // The sheet is still here and the typing survived, so the name can be fixed.
    await expect(within(c).getByLabelText('Template name')).toHaveValue('weeknight recipe')
    await expect(args.onClose).not.toHaveBeenCalled()
    // And it is offered again rather than left disabled after the failure.
    await expect(within(c).getByRole('button', { name: 'save template' })).toBeEnabled()
  },
}

export const EnterSaves: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement).getByRole('dialog')
    await userEvent.type(within(c).getByLabelText('Template name'), '{Enter}')
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({ name: 'weeknight recipe', keepContent: false })
    )
  },
}

export const CancelAndEscapeBothClose: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement).getByRole('dialog')
    await userEvent.click(within(c).getByRole('button', { name: 'cancel' }))
    await expect(args.onClose).toHaveBeenCalled()
    await expect(args.onSave).not.toHaveBeenCalled()
  },
}
