import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { CardPreviewModalView } from './CardPreviewModal'
import { CollectionView } from '@/lib/modules/view/view'
import type { CollectionRow } from '@/lib/modules/view/apply'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { PropertySchema } from '@/lib/properties/schema'
import type { Block } from '@/lib/documents/types'

/**
 * The Kanban card → page preview modal (#64). A board card is a collection row,
 * and a row IS a page — clicking the card opens this Press modal previewing the
 * page's blocks read-only, with an "Open page ↗" expand that navigates to the
 * full page. These stories render the presentational `CardPreviewModalView`
 * (and a stateful board harness for the click→open loop) with static blocks —
 * no Supabase, the same way the view/kanban stories render.
 */
const meta = {
  title: 'Organisms/CardPreviewModal',
  component: CardPreviewModalView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen bg-mn-surface p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    open: true,
    onOpenChange: fn(),
    title: 'Trim the rim',
    blocks: null,
    onOpenPage: fn(),
  },
} satisfies Meta<typeof CardPreviewModalView>

export default meta
type Story = StoryObj<typeof meta>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const pageBlocks: Block[] = [
  { id: 'b1', type: 'text', content: 'Bevel the foot ring before it dries.' },
  {
    id: 'b2',
    type: 'todo',
    items: [
      { id: 't1', label: 'Center the bowl on the wheel', checked: true },
      { id: 't2', label: 'Trim to an even 5mm wall', checked: false },
    ],
  },
]

const boardSchema: PropertySchema = [
  {
    id: 'p-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'o-todo', label: 'To do', color: 'zinc' },
      { id: 'o-doing', label: 'Doing', color: 'amber' },
    ],
  },
]

const boardRows: CollectionRow[] = [
  { id: 'row-1', title: 'Trim the rim', values: { 'p-status': 'o-doing' } },
  { id: 'row-2', title: 'Wedge stoneware', values: { 'p-status': 'o-todo' } },
]

const boardConfig: ViewBlock = { id: 'v1', type: 'view', mode: 'board', groupBy: 'p-status' }

// ── Modal states ──────────────────────────────────────────────────────────────

/** The preview: the page's blocks rendered read-only, with the expand affordance. */
export const Preview: Story = {
  args: { blocks: pageBlocks },
  play: async ({ args }) => {
    // The popup renders through a portal, so query the whole document.
    const body = within(document.body)
    const dialog = body.getByRole('dialog')
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(body.getByText('Trim the rim')).toBeInTheDocument()
    // AC 1: the linked page's content, read-only.
    await expect(body.getByText('Bevel the foot ring before it dries.')).toBeInTheDocument()
    await expect(body.getByText('Center the bowl on the wheel')).toBeInTheDocument()
    // Read-preview: the modal body holds no editor — every module renders quiet.
    await expect(body.queryByRole('textbox')).not.toBeInTheDocument()

    // AC 2: the expand affordance.
    await userEvent.click(body.getByRole('button', { name: /open page/i }))
    await expect(args.onOpenPage).toHaveBeenCalled()
  },
}

/** AC 4 — the card's page is gone: a calm notice, no dead "Open page" button. */
export const MissingPage: Story = {
  args: { blocks: null, missing: true, onOpenPage: undefined },
  play: async () => {
    const body = within(document.body)
    await expect(body.getByText('This card doesn’t have a page to preview.')).toBeInTheDocument()
    await expect(body.queryByRole('button', { name: /open page/i })).not.toBeInTheDocument()
  },
}

/** A linked page with no blocks yet — still openable, never a broken frame. */
export const EmptyPage: Story = {
  args: { blocks: [] },
  play: async () => {
    const body = within(document.body)
    await expect(body.getByText('This page has no content yet.')).toBeInTheDocument()
    await expect(body.getByRole('button', { name: /open page/i })).toBeInTheDocument()
  },
}

// ── The full loop: click a board card → preview → dismiss ─────────────────────

/** A board wired to the modal the way ViewView wires it (static blocks stand in
 *  for the fetch). Exercises the whole #64 arc: card click opens the preview;
 *  Esc and backdrop close it; focus returns to the board. */
function BoardWithPreview({ onOpenPage }: { onOpenPage: () => void }) {
  const [preview, setPreview] = useState<{ id: string; title: string } | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <CollectionView
        config={boardConfig}
        schema={boardSchema}
        rows={boardRows}
        onOpenCard={(rowId) => {
          setPreview({ id: rowId, title: boardRows.find((r) => r.id === rowId)?.title ?? '' })
          setOpen(true)
        }}
      />
      <CardPreviewModalView
        open={open}
        onOpenChange={setOpen}
        title={preview?.title ?? ''}
        blocks={preview?.id === 'row-1' ? pageBlocks : []}
        onOpenPage={() => {
          onOpenPage()
          setOpen(false)
        }}
      />
    </>
  )
}

export const ClickCardOpensPreview: StoryObj = {
  render: () => <BoardWithPreview onOpenPage={fn()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(document.body)

    // AC 1: click the card body → the preview opens with the page's content.
    await userEvent.click(canvas.getByText('Trim the rim'))
    await expect(body.getByRole('dialog')).toBeInTheDocument()
    await expect(body.getByText('Bevel the foot ring before it dries.')).toBeInTheDocument()

    // AC 3a: Esc closes.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument())

    // Reopen via the keyboard-reachable ↗ affordance.
    await userEvent.click(canvas.getByRole('button', { name: 'Open card: Wedge stoneware' }))
    await expect(body.getByRole('dialog')).toBeInTheDocument()
    await expect(body.getByText('This page has no content yet.')).toBeInTheDocument()

    // AC 3b: backdrop click closes.
    await userEvent.click(body.getByTestId('card-preview-backdrop'))
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument())
  },
}

export const OpenPageNavigatesAndCloses: StoryObj = {
  render: function Render() {
    const [navigated, setNavigated] = useState(false)
    return navigated ? (
      <p data-testid="navigated">Navigated to the full page.</p>
    ) : (
      <BoardWithPreview onOpenPage={() => setNavigated(true)} />
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(document.body)

    await userEvent.click(canvas.getByText('Trim the rim'))
    await expect(body.getByRole('dialog')).toBeInTheDocument()

    // AC 2: the expand affordance "navigates" and the modal closes with it.
    await userEvent.click(body.getByRole('button', { name: /open page/i }))
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(canvas.getByTestId('navigated')).toBeInTheDocument()
  },
}

// ── The board card's isolation rules ─────────────────────────────────────────

/**
 * A click on a card's own control is that control's, never the preview's. #223
 * deleted the per-card × (no board draws one), so the only control a card still
 * owns is its title input — and typing in it must not open a modal over the
 * caret. Both of these fail SILENTLY: a modal that steals the first keystroke,
 * or a delete affordance nobody designed creeping back in.
 */
export const EditableBoardCardControls: StoryObj = {
  render: function Render() {
    const [opened, setOpened] = useState<string | null>(null)
    return (
      <>
        <CollectionView
          config={boardConfig}
          schema={boardSchema}
          rows={boardRows}
          editable
          onRenameRow={() => {}}
          onOpenCard={setOpened}
        />
        <p data-testid="opened">{opened ?? 'none'}</p>
      </>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByLabelText('Card title')[0])
    await expect(canvas.getByTestId('opened')).toHaveTextContent('none')
    // No board draws a per-card delete, even on an editable board (#223).
    await expect(canvas.queryByRole('button', { name: /delete card/i })).not.toBeInTheDocument()
    // The ↗ affordance still opens, from the keyboard as much as the pointer.
    await userEvent.click(canvas.getByRole('button', { name: 'Open card: Wedge stoneware' }))
    await expect(canvas.getByTestId('opened')).toHaveTextContent('row-2')
  },
}

/** A host that cannot open a card draws no affordance promising it can. */
export const BoardWithoutOpenCard: StoryObj = {
  render: () => <CollectionView config={boardConfig} schema={boardSchema} rows={boardRows} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Trim the rim')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /open card/i })).not.toBeInTheDocument()
  },
}
