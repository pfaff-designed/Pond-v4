/**
 * KAN-553 — the toast stack must outrank the undo panel, read from the
 * shared layer scale (`src/lib/layout/layers.ts`), not from two magic
 * numbers that happen to agree.
 */

import { act, render, screen } from '@testing-library/react'
import { UndoNotice, useUndoPanelBottom } from '@/components/molecules/UndoNotice'
import { UndoToastViewport } from '@/components/molecules/UndoToast'
import { LAYER } from '@/lib/layout/layers'
import { clearUndoNotice, requestUndoNotice, type UndoNotice as UndoNoticeData } from '@/lib/terminal-focus'

function cssVarOf(el: HTMLElement, name: string): number {
  const value = el.style.getPropertyValue(name)
  if (value === '') throw new Error(`no ${name} on "${el.className}"`)
  return Number(value)
}

describe('the toast stack over the undo panel', () => {
  it('outranks the undo panel, read from the shared layer scale', () => {
    const notice: UndoNoticeData = {
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      openedPageTitle: null,
      previousPageTitle: 'kitchen renovation',
    }
    render(
      <>
        <UndoNotice notice={notice} />
        <UndoToastViewport>
          <div>a toast</div>
        </UndoToastViewport>
      </>
    )

    const panelZ = cssVarOf(screen.getByRole('status'), '--z-undo-panel')
    const toastZ = cssVarOf(screen.getByTestId('undo-toast-viewport'), '--z-toast-stack')

    expect(panelZ).toBe(LAYER.undoPanel)
    expect(toastZ).toBe(LAYER.toastStack)
    expect(toastZ).toBeGreaterThan(panelZ)
  })
})

describe('the toast stack stays clear of the open panel (KAN-553)', () => {
  afterEach(() => {
    // Still mounted at this point — this inner `afterEach` runs before RTL's
    // own cleanup (an outer, module-scope `afterEach`) unmounts it.
    act(() => clearUndoNotice())
  })

  it("drops its top below the panel's measured bottom edge while the panel is open", () => {
    const notice: UndoNoticeData = {
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      openedPageTitle: null,
      previousPageTitle: 'kitchen renovation',
    }
    // The panel publishes its BOTTOM edge as offsetTop + the measured rect
    // height (not offsetHeight, which rounds) — mock both sources, so the
    // expectation below derives the offset the same way the component does,
    // with no copy of the panel's own top-[28px] anywhere. The fractional
    // height (99.5) is the KAN-553 round-trip bug: offsetHeight would have
    // rounded it to 100 and landed the toast 0.5px off the 10px gap.
    const mockPanelTop = 28
    const mockPanelHeight = 99.5
    const mockGap = 10
    const offsetTop = jest
      .spyOn(window.HTMLElement.prototype, 'offsetTop', 'get')
      .mockReturnValue(mockPanelTop)
    const getBoundingClientRect = jest
      .spyOn(window.HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: mockPanelHeight } as DOMRect)
    // Mirrors `ShellCommands`: the panel's prop and the toast viewport's open
    // signal (`useUndoNotice`) are the same global notice, not two sources.
    requestUndoNotice(notice)

    render(
      <>
        <UndoNotice notice={notice} />
        <UndoToastViewport>
          <div>a toast</div>
        </UndoToastViewport>
      </>
    )

    const viewport = screen.getByTestId('undo-toast-viewport')
    expect(viewport.style.top).toBe(`${mockPanelTop + mockPanelHeight + mockGap}px`)
    expect(viewport.className).not.toMatch(/\btop-4\b/)

    offsetTop.mockRestore()
    getBoundingClientRect.mockRestore()
  })

  it('publishes a null bottom edge once the panel unmounts', () => {
    const notice: UndoNoticeData = {
      direction: 'undo',
      pastTense: 'removed chickpeas, harissa',
      openedPageTitle: null,
      previousPageTitle: 'kitchen renovation',
    }
    const offsetTop = jest.spyOn(window.HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(28)
    const getBoundingClientRect = jest
      .spyOn(window.HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: 99.5 } as DOMRect)

    function PanelBottomProbe() {
      const bottom = useUndoPanelBottom()
      return <div data-testid="panel-bottom">{String(bottom)}</div>
    }

    const { rerender } = render(
      <>
        <UndoNotice notice={notice} />
        <PanelBottomProbe />
      </>
    )
    expect(screen.getByTestId('panel-bottom').textContent).toBe('127.5')

    act(() => {
      rerender(
        <>
          <UndoNotice notice={null} />
          <PanelBottomProbe />
        </>
      )
    })
    expect(screen.getByTestId('panel-bottom').textContent).toBe('null')

    offsetTop.mockRestore()
    getBoundingClientRect.mockRestore()
  })

  it('returns to top-4 once the panel closes', () => {
    render(
      <UndoToastViewport>
        <div>a toast</div>
      </UndoToastViewport>
    )

    const viewport = screen.getByTestId('undo-toast-viewport')
    expect(viewport.className).toMatch(/\btop-4\b/)
    expect(viewport.style.top).toBe('')
  })
})
