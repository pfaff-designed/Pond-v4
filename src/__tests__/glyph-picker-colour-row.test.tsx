/**
 * KAN-249 (3/4): `GlyphPicker` adds a colour row for an area target, in place
 * of the inherit note — `PondPicker.dc.html`'s `hasColour: isG && gArea`
 * branch. Four cells (ink/sage/mist/navy), the current role ringed, a click
 * calling `onPickColour` without closing the glass — the host (`Rail.tsx`)
 * decides whether to keep it open.
 */
import React, { useState } from 'react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GlyphPicker } from '@/components/molecules/GlyphPicker'
import type { AreaRole } from '@/lib/rail/glyph-library'

function mockFetchOk() {
  return jest.fn().mockImplementation(async () => ({
    ok: true,
    blob: async () => new Blob(['png-bytes'], { type: 'image/png' }),
  }))
}

beforeEach(() => {
  global.fetch = mockFetchOk() as unknown as typeof fetch
})

function renderPicker(props: Partial<React.ComponentProps<typeof GlyphPicker>> = {}) {
  const anchor = document.createElement('button')
  document.body.appendChild(anchor)
  const portal = document.createElement('div')
  document.body.appendChild(portal)
  const onPick = jest.fn()
  const onClose = jest.fn()
  const onPickColour = jest.fn()
  render(
    <GlyphPicker
      target={{ isArea: true, title: 'health' }}
      current={null}
      role={null}
      inheritsFrom="health"
      anchor={anchor}
      container={portal}
      onPick={onPick}
      onClose={onClose}
      onPickColour={onPickColour}
      {...props}
    />
  )
  return { container: portal, onPick, onClose, onPickColour, anchor }
}

describe('GlyphPicker — the colour row (an area target only)', () => {
  it('shows exactly four cells, labelled ink/sage/mist/navy, ink ringed by default', () => {
    const { container } = renderPicker()
    const colour = container.querySelector('[data-part="colour"]')
    expect(colour).toBeTruthy()

    const cells = colour!.querySelectorAll('[role="gridcell"]')
    expect(cells).toHaveLength(4)
    expect([...cells].map((c) => c.getAttribute('aria-label'))).toEqual([
      'ink',
      'sage',
      'mist',
      'navy',
    ])

    const ink = cells[0] as HTMLElement
    expect(ink.getAttribute('aria-selected')).toBe('true')
    expect(ink.className).toContain('shadow-[inset_0_0_0_2px_var(--mn-text)]')
    expect((cells[1] as HTMLElement).getAttribute('aria-selected')).toBe('false')
  })

  it('a page target shows the inherit row and no colour section', () => {
    const { container } = renderPicker({ target: { isArea: false, title: 'workouts' } })
    expect(container.querySelector('[data-part="colour"]')).toBeNull()
    expect(container.querySelector('[data-part="inherit"]')).toBeTruthy()
  })

  it('rings the current colour instead of ink when one is already set', () => {
    const { container } = renderPicker({ role: 'area-b' })
    const cells = container.querySelectorAll('[data-part="colour"] [role="gridcell"]')
    expect((cells[0] as HTMLElement).getAttribute('aria-selected')).toBe('false')
    const mist = cells[2] as HTMLElement
    expect(mist.getAttribute('aria-selected')).toBe('true')
    expect(mist.className).toContain('shadow-[inset_0_0_0_2px_var(--mn-text)]')
  })

  it('clicking a swatch calls onPickColour with that role, and does not close the glass', async () => {
    const { container, onPickColour, onClose } = renderPicker()
    const sage = container.querySelectorAll('[data-part="colour"] [role="gridcell"]')[1]
    await userEvent.click(sage)
    expect(onPickColour).toHaveBeenCalledWith('area-a')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('GlyphPicker — the colour row joins the picker’s keys', () => {
  it('ArrowDown from the last grid cell lands on ink, ArrowRight moves to sage, Enter picks without closing', async () => {
    const { container, onPickColour, onClose } = renderPicker()
    const user = userEvent.setup()
    const input = container.querySelector('input') as HTMLInputElement
    // "star" narrows the library to exactly three cells (star-01/02/03), one
    // row — small enough to walk to the last cell deterministically.
    await user.type(input, 'star')
    await user.keyboard('{ArrowRight}{ArrowRight}') // star-01 → star-02 → star-03, the last cell
    await user.keyboard('{ArrowDown}')
    const foot = container.querySelector('[data-part="foot"]') as HTMLElement
    expect(foot.textContent).toContain('ink')

    await user.keyboard('{ArrowRight}')
    expect(foot.textContent).toContain('sage')

    await user.keyboard('{Enter}')
    expect(onPickColour).toHaveBeenCalledWith('area-a')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ArrowUp from a swatch returns to the grid', async () => {
    const { container } = renderPicker()
    const user = userEvent.setup()
    const input = container.querySelector('input') as HTMLInputElement
    await user.type(input, 'star')
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowDown}') // last cell → ink
    const foot = container.querySelector('[data-part="foot"]') as HTMLElement
    expect(foot.textContent).toContain('ink')

    await user.keyboard('{ArrowUp}')
    expect(foot.textContent).not.toContain('ink')
    expect(foot.textContent).toContain('star-0')
  })

  it('a click on a swatch makes it the active cell — ACTIVE_HILITE and PICKED_RING together once the pick lands', async () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    const portal = document.createElement('div')
    document.body.appendChild(portal)

    function ControlledPicker() {
      const [role, setRole] = useState<AreaRole | null>(null)
      return (
        <GlyphPicker
          target={{ isArea: true, title: 'health' }}
          current={null}
          role={role}
          inheritsFrom="health"
          anchor={anchor}
          container={portal}
          onPick={() => {}}
          onClose={() => {}}
          onPickColour={setRole}
        />
      )
    }
    render(<ControlledPicker />)
    const mist = portal.querySelectorAll('[data-part="colour"] [role="gridcell"]')[2]
    await userEvent.click(mist)
    expect(mist.className).toContain('bg-mn-text/[0.1]')
    expect(mist.className).toContain('shadow-[inset_0_0_0_2px_var(--mn-text)]')
  })
})
