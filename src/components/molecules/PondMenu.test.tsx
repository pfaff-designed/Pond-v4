/**
 * `PondMenu` kind `mode` (6r f1) — the composer's mode menu: a solid card
 * (`bg-mn-card`, not the other kinds' dismissal glass), and a selected row
 * carries its own ground wash + bold title independent of hover/keyboard
 * highlight. Token classes throughout — no hex — so the same assertions hold
 * under both themes without branching.
 */

import { useRef, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import { PondMenu, type PondMenuGroup } from '@/components/molecules/PondMenu'

const pointRect = (x: number, y: number): DOMRect =>
  ({ x, y, width: 0, height: 0, top: y, left: x, right: x, bottom: y, toJSON: () => ({}) }) as DOMRect

type ModeAction = 'ask' | 'deep-research'

const groups = (selected: ModeAction): PondMenuGroup<ModeAction>[] => [
  {
    id: 'mode',
    label: 'mode',
    items: [
      { id: 'ask', label: 'ask', value: 'reads this pond. quick.', action: 'ask', selected: selected === 'ask' },
      {
        id: 'deep-research',
        label: 'deep research',
        value: 'reads the web and this pond.',
        action: 'deep-research',
        selected: selected === 'deep-research',
      },
    ],
  },
]

const Harness = ({ selected, dark = false }: { selected: ModeAction; dark?: boolean }) => {
  const [open, setOpen] = useState(true)
  const anchorRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  return (
    <div className={dark ? 'dark' : undefined}>
      <div data-testid="composer-card">
        <div ref={slotRef} className="contents" />
        <div ref={anchorRef}>
          <PondMenu
            kind="mode"
            label="mode menu"
            groups={groups(selected)}
            open={open}
            onOpenChange={setOpen}
            onSelect={jest.fn()}
            trigger={<button type="button">research</button>}
            placement={{ anchor: anchorRef, align: 'start', top: 40, alignOffset: -8 }}
            container={slotRef}
          />
        </div>
      </div>
    </div>
  )
}

const menu = () => screen.getByRole('menu', { name: 'mode menu' })
const items = () => within(menu()).getAllByRole('menuitem')

describe.each([
  ['light', false],
  ['dark', true],
] as const)('PondMenu kind="mode" (%s)', (_name, dark) => {
  it('lists the ask and deep research rows with their descriptions', () => {
    render(<Harness selected="ask" dark={dark} />)

    expect(items().map((item) => item.textContent)).toEqual([
      'askreads this pond. quick.',
      'deep researchreads the web and this pond.',
    ])
  })

  it("the selected row's classes carry the ground wash and bold title — the unselected row carries neither", () => {
    render(<Harness selected="deep-research" dark={dark} />)
    const [askRow, deepResearchRow] = items()

    expect(deepResearchRow.className).toContain('bg-mn-text/[0.07]')
    expect(within(deepResearchRow).getByText('deep research').className).toContain('font-medium')

    expect(askRow.className).not.toContain('bg-mn-text/[0.07]')
    expect(within(askRow).getByText('ask').className).not.toContain('font-medium')
  })

  it('carries no hex colour — paper/card/ink are all token classes', () => {
    render(<Harness selected="ask" dark={dark} />)

    expect(menu().className).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    items().forEach((item) => expect(item.className).not.toMatch(/#[0-9a-fA-F]{3,6}/))
  })
})

describe('PondMenu kind="mode" lays out in the host\'s own slot, not floating', () => {
  it('portals into the given container, in flow, full width, with no transform', () => {
    render(<Harness selected="ask" />)

    const card = screen.getByTestId('composer-card')
    expect(card).toContainElement(menu())

    const positioner = menu().parentElement as HTMLElement
    expect(positioner.style.position).toBe('static')
    expect(positioner.style.transform).toBe('none')

    expect(menu().className).toContain('w-full')
    expect(menu().className).not.toContain('w-[280px]')
  })
})

describe('PondMenu kind="mode" selection changes', () => {
  it('moves the ground wash and bold title when a different row is selected', () => {
    const { rerender } = render(<Harness selected="ask" />)
    let [askRow, deepResearchRow] = items()
    expect(askRow.className).toContain('bg-mn-text/[0.07]')
    expect(deepResearchRow.className).not.toContain('bg-mn-text/[0.07]')

    rerender(<Harness selected="deep-research" />)
    ;[askRow, deepResearchRow] = items()
    expect(askRow.className).not.toContain('bg-mn-text/[0.07]')
    expect(deepResearchRow.className).toContain('bg-mn-text/[0.07]')
  })
})

describe('PondMenu placement.anchor accepts a point (a right-click, with no element behind it)', () => {
  it('opens at a virtual anchor with no click on the trigger, and the positioner measures that anchor', async () => {
    const getBoundingClientRect = jest.fn(() => pointRect(120, 240))

    render(
      <PondMenu
        kind="block"
        label="block menu"
        groups={[{ id: 'g', label: 'g', items: [{ id: 'delete', label: 'delete', action: 'delete' }] }]}
        open
        onOpenChange={jest.fn()}
        onSelect={jest.fn()}
        trigger={<button type="button">block menu trigger</button>}
        placement={{ anchor: { getBoundingClientRect }, align: 'start', top: 0, alignOffset: 0 }}
      />,
    )

    expect(screen.getByRole('menu', { name: 'block menu' })).toBeInTheDocument()
    await waitFor(() => expect(getBoundingClientRect).toHaveBeenCalled())
  })

  it('still copes with a zero-height anchor through the sideOffset math', async () => {
    const getBoundingClientRect = jest.fn(() => pointRect(10, 20))

    render(
      <PondMenu
        kind="block"
        label="block menu"
        groups={[{ id: 'g', label: 'g', items: [{ id: 'delete', label: 'delete', action: 'delete' }] }]}
        open
        onOpenChange={jest.fn()}
        onSelect={jest.fn()}
        trigger={<button type="button">block menu trigger</button>}
        placement={{ anchor: { getBoundingClientRect }, align: 'start', top: 6, alignOffset: 0 }}
      />,
    )

    const positioner = screen.getByRole('menu', { name: 'block menu' }).parentElement as HTMLElement
    await waitFor(() => expect(positioner.style.transform).not.toBe(''))
    expect(positioner.style.transform).not.toMatch(/NaN/)
  })
})
