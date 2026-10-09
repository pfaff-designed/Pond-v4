import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'

import { PondMenu, type PondMenuGroup, type PondMenuPlacement, type PondMenuSize } from './PondMenu'

type Pick = 'table' | 'list' | 'text' | 'copy-link' | 'delete'

/** A list's menu: three ways to turn it, then the block's own actions. */
const blockGroups: PondMenuGroup<Pick>[] = [
  {
    id: 'turn-into',
    label: 'turn into',
    heading: true,
    items: [
      { id: 'turn-into:table', label: 'table', value: '3 rows · 2 columns', action: 'table' },
      { id: 'turn-into:list', label: 'list', action: 'list' },
      { id: 'turn-into:text', label: 'text', action: 'text' },
    ],
  },
  {
    id: 'block',
    label: 'block',
    items: [
      { id: 'copy-link', label: 'copy link to block', action: 'copy-link' },
      { id: 'delete', label: 'delete', action: 'delete' },
    ],
  },
]

const PLACEMENT: Record<PondMenuSize, Omit<PondMenuPlacement, 'anchor'>> = {
  desktop: { align: 'start', top: 40, alignOffset: -8 },
  mobile: { align: 'end', top: 48, alignOffset: 0 },
}

interface BlockMenuFrameProps {
  size?: PondMenuSize
  ink?: boolean
  onSelect: (pick: Pick) => void
}

/**
 * A block with its handle, the menu open on arrival. The glass portals into the
 * frame, so the `.dark` around the ink frame is the whole theme.
 */
const BlockMenuFrame = ({ size = 'desktop', ink = false, onSelect }: BlockMenuFrameProps) => {
  const [open, setOpen] = useState(true)
  const frameRef = useRef<HTMLDivElement>(null)
  const blockRef = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={frameRef}
      className={`${ink ? 'dark bg-raw-ink' : 'bg-mn-surface'} min-h-[360px] p-6 pl-16 font-sans`}
    >
      <div
        ref={blockRef}
        className="relative max-w-[420px] rounded-[20px] px-[4px] py-[2px] font-serif text-[17px] text-mn-text"
      >
        <div className="absolute -left-10 top-1">
          <PondMenu
            kind="block"
            label="block menu"
            size={size}
            groups={blockGroups}
            open={open}
            onOpenChange={setOpen}
            onSelect={onSelect}
            placement={{ anchor: blockRef, ...PLACEMENT[size] }}
            container={frameRef}
            trigger={
              <button
                type="button"
                aria-label="Block menu"
                className="flex h-5 w-4 items-center justify-center text-mn-text-secondary"
              >
                <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
                  <circle cx="3" cy="3" r="1.1" />
                  <circle cx="7" cy="3" r="1.1" />
                  <circle cx="3" cy="7" r="1.1" />
                  <circle cx="7" cy="7" r="1.1" />
                  <circle cx="3" cy="11" r="1.1" />
                  <circle cx="7" cy="11" r="1.1" />
                </svg>
              </button>
            }
          />
        </div>
        2 eggs, 3 apples, 1 lemon
      </div>
    </div>
  )
}

const meta = {
  title: 'Molecules/PondMenu',
  component: BlockMenuFrame,
  parameters: { layout: 'fullscreen' },
  args: { onSelect: fn() },
} satisfies Meta<typeof BlockMenuFrame>

export default meta
type Story = StoryObj<typeof meta>

/** Kind `block` on paper, 260 wide, under the handle at the block's left edge. */
export const Block: Story = {}

/** Kind `block` on the dark ground: the ink glass. */
export const BlockInk: Story = { args: { ink: true } }

/** Kind `block` on a phone: 350 wide, 44px items at 15px, at the block's right edge. */
export const BlockPhone: Story = { args: { size: 'mobile' } }
