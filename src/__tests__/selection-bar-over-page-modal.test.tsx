/**
 * #574 — the selection bar shows behind an open page modal (`RecordPeek`,
 * `placement="center"`): selecting text inside the modal's own page draws the
 * bar at a lower z-index than the modal card, so the bar renders underneath
 * it instead of in front.
 */

import { createRef, type RefObject } from 'react'
import { render, screen } from '@testing-library/react'
import { SelectionBar } from '@/components/molecules/SelectionBar'
import { RecordPeek } from '@/lib/modules/view/record-peek'
import TextEditor, { type Press } from '@/lib/modules/text/editor'
import { textSchema } from '@/lib/modules/text/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'
import type { PropertySchema } from '@/lib/properties/schema'
import { clearSelection, selectWord } from './helpers/selection'

const schema: PropertySchema = []
const row: CollectionRow = { id: 'row-1', title: 'Trim the rim', values: {} }

/** The z-index a Tailwind `z-[N]`/`z-N` class carries, or `null` if none does. */
function zIndexOf(el: HTMLElement): number | null {
  for (const cls of el.className.split(/\s+/)) {
    const m = /^z-\[?(\d+)\]?$/.exec(cls)
    if (m) return Number(m[1])
  }
  return null
}

describe('#574: the selection bar over an open page modal', () => {
  afterEach(() => clearSelection())

  it('outranks the centered record peek it sits over', () => {
    render(
      <>
        <RecordPeek
          row={row}
          schema={schema}
          done={false}
          now={new Date()}
          placement="center"
          page={
            <TextEditor
              data={textSchema.parse({ id: 'b1', type: 'text', content: 'soak overnight' })}
              onChange={jest.fn()}
              standIn={null}
              pressRef={createRef<Press | null>() as RefObject<Press | null>}
            />
          }
        />
        <SelectionBar onAsk={jest.fn()} />
      </>
    )

    selectWord(screen.getByText('soak overnight'), 'overnight')

    const bar = document.body.querySelector('[data-part="selection-bar"]')
    const modal = document.body.querySelector('[data-part="record-peek"]')
    if (!(bar instanceof HTMLElement)) throw new Error('selection bar not found')
    if (!(modal instanceof HTMLElement)) throw new Error('record peek not found')

    const barZ = zIndexOf(bar)
    const modalZ = zIndexOf(modal)
    if (barZ === null) throw new Error(`selection bar has no z-index class (${bar.className})`)
    if (modalZ === null) throw new Error(`record peek has no z-index class (${modal.className})`)

    expect(barZ).toBeGreaterThan(modalZ)
  })
})
