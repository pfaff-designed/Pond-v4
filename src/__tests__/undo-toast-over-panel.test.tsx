/**
 * KAN-553 — the toast stack must outrank the undo panel, read from the
 * shared layer scale (`src/lib/layout/layers.ts`), not from two magic
 * numbers that happen to agree.
 */

import { render, screen } from '@testing-library/react'
import { UndoNotice } from '@/components/molecules/UndoNotice'
import { UndoToastViewport } from '@/components/molecules/UndoToast'
import { LAYER } from '@/lib/layout/layers'
import type { UndoNotice as UndoNoticeData } from '@/lib/terminal-focus'

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
