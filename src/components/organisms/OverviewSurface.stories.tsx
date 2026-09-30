import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { OverviewSurface } from './OverviewSurface'
import type { OverviewModel } from '@/lib/pages/overview'

const MODEL: OverviewModel = {
  focal: '7',
  focalCaption: '7 pages within, 3 tucked deeper.',
  cards: [
    {
      id: 'sleep',
      type: 'page',
      title: 'Sleep',
      stat: '0',
      sub: '0 pages inside · updated today',
      accent: '#5f7355',
    },
    {
      id: 'marathon',
      type: 'project',
      title: 'Marathon Training',
      stat: '4',
      sub: '4 pages inside · updated 2d ago',
      accent: '#5f7355',
    },
    {
      id: 'workouts',
      type: 'page',
      title: 'Workouts',
      stat: '1',
      sub: '1 page inside · updated 1w ago',
      accent: '#5f7355',
    },
  ],
}

const meta = {
  title: 'Organisms/OverviewSurface',
  component: OverviewSurface,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen bg-mn-surface">
        <Story />
      </div>
    ),
  ],
  args: {
    kicker: 'Health',
    accent: '#5f7355',
    model: MODEL,
    closing: 'That’s Health at a glance. Open any of it, or ask.',
    onOpenCard: fn(),
  },
} satisfies Meta<typeof OverviewSurface>

export default meta
type Story = StoryObj<typeof meta>

/** An area overview: focal numeral + a card per child. */
export const Area: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('7')).toBeInTheDocument()
    await expect(canvas.getByText('Everything within')).toBeInTheDocument()
    await userEvent.click(canvas.getByText('Marathon Training'))
    await expect(args.onOpenCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'marathon' }))
  },
}

/**
 * An area whose title maps to a glyph (#91): the kicker leads with the masked
 * mark in the area hue and the fallback accent square retires. Asserted in a
 * real Chromium because the mask is the whole point — jsdom drops it, and a
 * glyph that fails to load paints as a SOLID SQUARE rather than a silhouette.
 */
export const AreaWithGlyph: Story = {
  args: { glyph: 'leaf-01' },
  play: async ({ canvasElement }) => {
    const mark = canvasElement.querySelector('[data-area-mark]') as HTMLElement
    await expect(mark).toBeTruthy()
    // The hue rides the slot, so the masked glyph inherits it via currentColor.
    await expect(mark.style.color).toBe('rgb(95, 115, 85)')

    const glyph = mark.querySelector('[data-icon="leaf-01"]') as HTMLElement
    await expect(glyph).toBeTruthy()
    await waitFor(async () => {
      const cs = getComputedStyle(glyph)
      // Both the standard and the -webkit- property carry the decoded data-URI.
      await expect(cs.maskImage).toContain('data:image/png;base64')
      await expect(cs.webkitMaskImage).toContain('data:image/png;base64')
      // Painted THROUGH the mask, never as a filled box.
      await expect(cs.backgroundColor).toBe('rgb(95, 115, 85)')
      await expect(cs.maskRepeat).toBe('no-repeat')
      await expect(cs.maskSize).toBe('contain')
    })
    // The plain accent square is gone once a glyph takes the slot.
    await expect(canvasElement.querySelector('[data-part="kicker-dot"]')).toBeNull()
  },
}

/** The Life root: no accent dot, a card per top-level page. */
export const Life: Story = {
  args: {
    kicker: 'Life · everything',
    accent: undefined,
    model: {
      focal: '23',
      focalCaption: '23 pages across your life, 12 of them in Personal.',
      cards: [
        {
          id: 'health',
          type: 'page',
          title: 'Health',
          stat: '7',
          sub: '7 pages inside · updated today',
          accent: '#5f7355',
        },
        {
          id: 'personal',
          type: 'page',
          title: 'Personal',
          stat: '12',
          sub: '12 pages inside · updated yesterday',
          accent: '#8a6b74',
        },
        {
          id: 'creativity',
          type: 'page',
          title: 'Creativity',
          stat: '3',
          sub: '3 pages inside · updated 4d ago',
          accent: '#9a6b43',
        },
      ],
    },
    closing: 'That’s the whole of it. Open an area, or ask.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('23')).toBeInTheDocument()
    await expect(
      canvas.getByText('23 pages across your life, 12 of them in Personal.')
    ).toBeInTheDocument()
    await expect(canvas.getByText('Health')).toBeInTheDocument()
  },
}

/**
 * A pure container that can gain its own content: the quiet "+ Add content"
 * affordance sits in the header. Palette-first (ticket-44 §2) — clicking it opens
 * the block picker; picking a module hands that item to onAddContent, which
 * inserts its empty state and flips the node to the composite editor+children
 * surface (ticket-22).
 */
export const WithAddContent: Story = {
  args: { onAddContent: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const add = canvas.getByRole('button', { name: '+ Add content' })
    await expect(add).toBeInTheDocument()
    // Click opens the palette (does NOT add anything on its own).
    await userEvent.click(add)
    const filter = await canvas.findByLabelText('Filter blocks')
    await userEvent.type(filter, 'Todo')
    await userEvent.click(await canvas.findByText('Todo'))
    // The pick — a SlashMenuItem — is what reaches onAddContent.
    await expect(args.onAddContent).toHaveBeenCalledWith(expect.objectContaining({ id: 'todo' }))
  },
}

/**
 * A renamable area overview (ticket-26): the kicker is an inline click-to-rename
 * field. Typing + Enter commits via onRenameKicker; Escape abandons the edit;
 * a page must be renamable from every surface it renders as.
 */
export const EditableTitle: Story = {
  args: { onRenameKicker: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByRole('textbox', { name: /rename page/i })
    await expect(field).toHaveValue('Health')
    await userEvent.clear(field)
    await userEvent.type(field, 'Fitness{Enter}')
    await expect(args.onRenameKicker).toHaveBeenCalledWith('Fitness')
    await expect(args.onRenameKicker).toHaveBeenCalledTimes(1)

    // Escape reverts — the edit is abandoned, NOT committed. (Regression guard:
    // Escape blurs the field, and blur fires its commit synchronously with the
    // stale edited draft still in the closure — it must not perform the rename.)
    await userEvent.clear(field)
    await userEvent.type(field, 'Abandoned{Escape}')
    await expect(args.onRenameKicker).toHaveBeenCalledTimes(1)
    await expect(field).toHaveValue('Health')
  },
}

/** An empty area: zero focal, no card grid, still calm. */
export const Empty: Story = {
  args: {
    model: {
      focal: '0',
      focalCaption: 'Nothing here yet.',
      cards: [],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('0')).toBeInTheDocument()
    await expect(canvas.queryByText('Everything within')).not.toBeInTheDocument()
  },
}
