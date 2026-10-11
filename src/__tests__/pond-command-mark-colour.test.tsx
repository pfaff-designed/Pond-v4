/**
 * The breadcrumb's leading mark carries its area's colour (`PondCommand.dc.html`
 * line 142, `markCol`) — comment 10076 on KAN-249. `path.role` is the SAME
 * `resolveMark` result the rail and the picker read, so the breadcrumb can never
 * show a colour the rail doesn't.
 */

import React from 'react'
import { render } from '@testing-library/react'

import { PondCommand } from '@/components/organisms/PondCommand'

const glyph = () => document.querySelector<HTMLElement>('[data-part="glyph"]')!

function renderCommand(role: 'area-a' | null) {
  return render(
    <PondCommand
      path={{ glyph: 'ramp', trail: ['life'], current: 'health', role }}
      open={false}
      items={[]}
      onSelect={jest.fn()}
      onOpenChange={jest.fn()}
    />
  )
}

describe('PondCommand — the breadcrumb mark’s colour', () => {
  it('an area role paints the mark and drops the ink class', () => {
    renderCommand('area-a')
    expect(glyph().style.color).toBe('var(--mn-area-a)')
    expect(glyph().className).not.toContain('text-mn-text')
  })

  it('no role keeps the mark ink', () => {
    renderCommand(null)
    expect(glyph().style.color).toBe('')
    expect(glyph().className).toContain('text-mn-text')
  })
})
