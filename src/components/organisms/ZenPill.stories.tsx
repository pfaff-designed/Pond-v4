import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { useRef } from 'react'

import { ZenPill } from './ZenPill'
import { useZen, ZenProvider } from '@/lib/layout/zen'

/**
 * `Pond 02 Component library.dc.html` 2t "zen pill · organism · zen only" —
 * ask pond, editor, attach, type, ground, leave. `editor`, `attach`, `type`
 * and `ground` stay `aria-disabled` until their own tickets wire them
 * (KAN-186 is the pill's static draw and mount alone).
 */

function Entered() {
  const { enterZen } = useZen()
  return (
    <>
      <button onClick={() => enterZen({ onInk: false })}>enter zen</button>
      <ZenPill />
    </>
  )
}

function Harness() {
  const root = useRef<HTMLDivElement>(null)
  return (
    <div ref={root} className="bg-mn-surface relative h-[200px] w-full">
      <ZenProvider scrollRoot={root}>
        <Entered />
      </ZenProvider>
    </div>
  )
}

const meta = {
  title: 'Organisms/2t · the zen pill',
  component: ZenPill,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { query: {} } },
  },
} satisfies Meta<typeof ZenPill>

export default meta
type Story = StoryObj<typeof meta>

/** The pill's 8 items, drawn once zen is on: ask pond, two dividers and the six controls. */
export const AtRest: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'enter zen' }))

    const pill = canvasElement.querySelector('[data-part="zen-pill"]')!
    const buttons = within(pill as HTMLElement).getAllByRole('button')
    await expect(buttons).toHaveLength(6)
    await expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'ask pond',
      'editor',
      'attach',
      'type',
      'ground',
      'leave',
    ])
    for (const id of ['editor', 'attach', 'type', 'ground']) {
      await expect(canvas.getByRole('button', { name: id })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    }
  },
}
