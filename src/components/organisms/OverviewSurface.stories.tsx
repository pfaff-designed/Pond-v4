import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { OverviewSurface } from './OverviewSurface'
import type { OverviewModel } from '@/lib/pages/overview'

const MODEL: OverviewModel = {
  focal: '7',
  focalCaption: 'pages within, at a glance.',
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
      <div className="h-screen bg-press-paper">
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
    onAskPond: fn(),
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
    await userEvent.click(canvas.getByRole('button', { name: 'ask Pond →' }))
    await expect(args.onAskPond).toHaveBeenCalled()
  },
}

/** The Life root: no accent dot, a card per top-level page. */
export const Life: Story = {
  args: {
    kicker: 'Life · everything',
    accent: undefined,
    model: {
      focal: '23',
      focalCaption: 'pages across your life.',
      cards: [
        {
          id: 'health',
          type: 'area',
          title: 'Health',
          stat: '7',
          sub: '7 pages inside · updated today',
          accent: '#5f7355',
        },
        {
          id: 'personal',
          type: 'area',
          title: 'Personal',
          stat: '12',
          sub: '12 pages inside · updated yesterday',
          accent: '#8a6b74',
        },
        {
          id: 'creativity',
          type: 'area',
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
    await expect(canvas.getByText('pages across your life.')).toBeInTheDocument()
    await expect(canvas.getByText('Health')).toBeInTheDocument()
  },
}

/**
 * A pure container that can gain its own content: the quiet "+ Add content"
 * affordance sits beside "ask Pond". Clicking it flips the node to the composite
 * editor+children surface (ticket-22).
 */
export const WithAddContent: Story = {
  args: { onAddContent: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const add = canvas.getByRole('button', { name: '+ Add content' })
    await expect(add).toBeInTheDocument()
    await userEvent.click(add)
    await expect(args.onAddContent).toHaveBeenCalled()
  },
}

/**
 * A renamable area overview (ticket-26): the kicker is an inline click-to-rename
 * field. Typing + Enter commits via onRenameKicker; a page must be renamable from
 * every surface it renders as.
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
  },
}

/** An empty area: zero focal, no card grid, still calm. */
export const Empty: Story = {
  args: {
    model: {
      focal: '0',
      focalCaption: 'nothing inside yet — add a page, or ask Pond.',
      cards: [],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('0')).toBeInTheDocument()
    await expect(canvas.queryByText('Everything within')).not.toBeInTheDocument()
  },
}
