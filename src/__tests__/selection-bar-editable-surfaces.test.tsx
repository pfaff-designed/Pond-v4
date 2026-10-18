/**
 * KAN-489 person's path: the real block-canvas `TextEditor` shows the bar,
 * while the real `NewPondSheet`, a read-only `TextView` and the real rail do
 * not — each surface named in PATH_STEPS, not a generic `<p>` stand-in.
 */

import { createRef, type RefObject } from 'react'
import { render, screen } from '@testing-library/react'
import { SelectionBar } from '@/components/molecules/SelectionBar'
import TextEditor, { type Press } from '@/lib/modules/text/editor'
import { textSchema } from '@/lib/modules/text/schema'
import { TextView } from '@/lib/modules/text/view'
import { NewPondSheet } from '@/components/organisms/NewPondSheet'
import { mountRail, ROWS } from './helpers/rail-sweep-fixture'
import { clearSelection, selectText, selectWord } from './helpers/selection'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

describe("KAN-489: the selection bar opens only for the page canvas's own editable text", () => {
  afterEach(() => clearSelection())

  it('canvas paragraph text shows the bar with formatting enabled', async () => {
    render(
      <>
        <TextEditor
          data={textSchema.parse({ id: 'b1', type: 'text', content: 'soak overnight' })}
          onChange={jest.fn()}
          standIn={null}
          pressRef={createRef<Press | null>() as RefObject<Press | null>}
        />
        <SelectionBar onAsk={jest.fn()} />
      </>
    )
    await screen.findByRole('textbox', { name: 'text block' })

    selectWord(screen.getByText('soak overnight'), 'overnight')

    expect(screen.getByRole('toolbar', { name: 'selection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'bold' })).toBeEnabled()
  })

  it('the new-pond window shows no bar for its title text', () => {
    render(
      <>
        <NewPondSheet onCreate={jest.fn()} onCancel={jest.fn()} />
        <SelectionBar onAsk={jest.fn()} />
      </>
    )

    selectText(screen.getByText('Name it'))

    expect(screen.queryByRole('toolbar', { name: 'selection' })).not.toBeInTheDocument()
  })

  it('a read-only page shows no bar', () => {
    render(
      <>
        <TextView data={textSchema.parse({ id: 'b2', type: 'text', content: 'static page prose' })} />
        <SelectionBar onAsk={jest.fn()} />
      </>
    )

    selectText(screen.getByText('static page prose'))

    expect(screen.queryByRole('toolbar', { name: 'selection' })).not.toBeInTheDocument()
  })

  it('the rail shows no bar for a selected row title', () => {
    mountRail(ROWS)
    render(<SelectionBar onAsk={jest.fn()} />)

    selectText(screen.getByText('Health'))

    expect(screen.queryByRole('toolbar', { name: 'selection' })).not.toBeInTheDocument()
  })
})
