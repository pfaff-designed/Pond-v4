/**
 * The `toggle` block (KAN-480 slice 1, build items 1, 3 and 4) — registration:
 * schema round trip (absent `body`/`folded` read as today's behaviour), both
 * halves of the two-map contract, serialize, AI-composability (without
 * `folded`), and `blockHoldsContent`; `ToggleView`'s read-only render (fold
 * hides the body, `aria-expanded` tracks `folded`); and its editable render —
 * two hosted text editors whose own `onChange` maps back into `content`/`body`,
 * isolated from the canvas row they sit inside. The ▸ click's own behaviour,
 * Enter's split/continue wiring and the path test land in later build items of
 * this ticket.
 */

import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toggleSchema, toggleDescriptor, type ToggleBlock } from '@/lib/modules/toggle/schema'
import { ToggleView } from '@/lib/modules/toggle/view'
import { blockSchema } from '@/lib/modules/content'
import { moduleDescriptors } from '@/lib/modules/registry'
import { moduleRenderers } from '@/lib/modules/renderers'
import { moduleDataSchema, createPageBlockSchema } from '@/lib/modules/ai-composition'
import { blockFrame } from '@/lib/modules/block-frame'
import { blockHoldsContent } from '@/lib/modules/block-holds-content'
import { BlockRowProvider } from '@/lib/modules/block-row-context'
import {
  findAllTextBlocks,
  textEditorOf,
  writeInTextBlock,
} from '@/__tests__/helpers/text-block'

const bare: ToggleBlock = { id: 't1', type: 'toggle', content: 'Packing list' }
const full: ToggleBlock = {
  id: 't1',
  type: 'toggle',
  content: 'Packing list',
  body: 'Passport',
  folded: true,
}

describe('toggle schema + registry facets', () => {
  it('persists through blockSchema with body/folded absent — reads as today’s behaviour', () => {
    expect(blockSchema.parse(bare)).toEqual(bare)
    expect('body' in blockSchema.parse(bare)).toBe(false)
    expect('folded' in blockSchema.parse(bare)).toBe(false)
  })

  it('persists through blockSchema with body and folded set', () => {
    expect(blockSchema.parse(full)).toEqual(full)
  })

  it('rejects a block missing its type literal', () => {
    expect(toggleSchema.safeParse({ id: 't1', content: '' }).success).toBe(false)
  })

  it('is registered in both halves of the two-map contract', () => {
    expect(moduleDescriptors.toggle).toBe(toggleDescriptor)
    expect(moduleRenderers.toggle.view).toBe(ToggleView)
    expect(toggleDescriptor.label).toBe('toggle')
  })

  it('serializes the summary alone behind a Toggle: marker', () => {
    expect(toggleDescriptor.serialize(bare)).toBe('Toggle: Packing list')
  })

  it('serializes the summary and body, so a wholesale re-emit never drops the body', () => {
    expect(toggleDescriptor.serialize(full)).toBe('Toggle: Packing list\nPassport')
  })

  it('serializes a placeholder line for an unwritten summary', () => {
    expect(toggleDescriptor.serialize({ id: 't1', type: 'toggle', content: '' })).toBe(
      'Toggle: (no summary yet)'
    )
  })

  it('is AI-composable without folded (moduleDataSchema + createPageBlockSchema)', () => {
    const data = { type: 'toggle', content: 'Packing list', body: 'Passport' }
    const r = moduleDataSchema.safeParse(data)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual(data)
    expect(createPageBlockSchema.safeParse({ ...data, bindKey: 'k' }).success).toBe(true)
    // An id, and a fold state, the model volunteers are both dropped, not honoured.
    const stripped = moduleDataSchema.parse({ id: 'ai-made', folded: true, ...data })
    expect('id' in stripped).toBe(false)
    expect('folded' in stripped).toBe(false)
  })

  it('renders bare, no PondBlock frame — as an unlabelled text block', () => {
    expect(blockFrame(bare)).toBeNull()
  })

  it('blockHoldsContent: a summary or a body holds something; neither does not', () => {
    expect(blockHoldsContent({ id: 't1', type: 'toggle', content: '' })).toBe(false)
    expect(blockHoldsContent({ id: 't1', type: 'toggle', content: '   ' })).toBe(false)
    expect(blockHoldsContent({ id: 't1', type: 'toggle', content: 'Packing list' })).toBe(true)
    expect(
      blockHoldsContent({ id: 't1', type: 'toggle', content: '', body: 'Passport' })
    ).toBe(true)
    expect(blockHoldsContent({ id: 't1', type: 'toggle', content: '', body: '  ' })).toBe(false)
  })
})

describe('ToggleView', () => {
  it('shows the summary and the body when unfolded, aria-expanded true', () => {
    render(<ToggleView data={{ ...full, folded: false }} />)
    expect(screen.getByText('Packing list')).toBeInTheDocument()
    expect(screen.getByText('Passport')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('hides the body when folded, aria-expanded false', () => {
    render(<ToggleView data={{ ...full, folded: true }} />)
    expect(screen.getByText('Packing list')).toBeInTheDocument()
    expect(screen.queryByText('Passport')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('reads an absent folded as unfolded', () => {
    render(<ToggleView data={bare} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })
})

/** A host that keeps the block's state, as the page does. */
const StatefulToggle = ({ data }: { data: ToggleBlock }) => {
  const [state, setState] = useState(data)
  return <ToggleView data={state} editable onChange={setState} />
}

describe('ToggleView — editable: summary and body as two hosted text editors', () => {
  it('typing in the summary updates content', async () => {
    render(<StatefulToggle data={{ ...full, folded: false }} />)
    const [summary] = await findAllTextBlocks()
    writeInTextBlock(summary, 'Packing list, revised')
    await waitFor(() => expect(screen.getByText('Packing list, revised')).toBeInTheDocument())
    expect(screen.getByText('Passport')).toBeInTheDocument()
  })

  it('typing in the body updates body', async () => {
    render(<StatefulToggle data={{ ...full, folded: false }} />)
    const [, body] = await findAllTextBlocks()
    writeInTextBlock(body, 'Passport, revised')
    await waitFor(() => expect(screen.getByText('Passport, revised')).toBeInTheDocument())
    expect(screen.getByText('Packing list')).toBeInTheDocument()
  })

  it('neither field’s stepOut reaches the canvas row it is nested inside', async () => {
    const outerStepOut = jest.fn()
    render(
      <BlockRowProvider value={{ selected: false, stepOut: outerStepOut }}>
        <ToggleView data={{ ...full, folded: false }} editable onChange={() => {}} />
      </BlockRowProvider>
    )
    const fields = await findAllTextBlocks()
    expect(fields).toHaveLength(2)
    for (const field of fields) {
      act(() => {
        textEditorOf(field).commands.focus('end')
      })
      fireEvent.keyDown(field, { key: 'Enter' })
    }
    expect(outerStepOut).not.toHaveBeenCalled()
  })

  it('autofocus passes through to the summary only', async () => {
    // Both fields are unwritten (empty), the one condition `TextEditor` itself
    // autofocuses under — isolating this to the `autofocus` PROP, which the
    // body's own field is never given regardless of its content.
    const empty: ToggleBlock = { id: 't1', type: 'toggle', content: '' }
    render(<ToggleView data={empty} editable onChange={() => {}} autofocus />)
    const [summary, body] = await findAllTextBlocks()
    await waitFor(() => expect(textEditorOf(summary).isFocused).toBe(true))
    expect(textEditorOf(body).isFocused).toBe(false)
  })
})

describe('ToggleView — Enter (KAN-480 build item 5)', () => {
  it('at the end of the summary opens the body, caret there, the summary unchanged', async () => {
    render(<StatefulToggle data={{ id: 't1', type: 'toggle', content: 'packing list' }} />)
    const [summary] = await findAllTextBlocks()
    act(() => {
      textEditorOf(summary).commands.focus('end')
    })
    fireEvent.keyDown(summary, { key: 'Enter' })
    const [, body] = await findAllTextBlocks()
    await waitFor(() => expect(textEditorOf(body).isFocused).toBe(true))
    expect(screen.getByText('packing list')).toBeInTheDocument()
  })

  it('on a FOLDED toggle, unfolds and lands the caret in the body — the lazily created body editor', async () => {
    render(
      <StatefulToggle
        data={{ id: 't1', type: 'toggle', content: 'packing list', folded: true }}
      />
    )
    const [summary] = await findAllTextBlocks()
    act(() => {
      textEditorOf(summary).commands.focus('end')
    })
    fireEvent.keyDown(summary, { key: 'Enter' })
    const [, body] = await findAllTextBlocks()
    await waitFor(() => expect(textEditorOf(body).isFocused).toBe(true))
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('at the end of the summary, with an existing body, opens a new empty first body line instead of merging into it', async () => {
    render(
      <StatefulToggle
        data={{
          id: 't1',
          type: 'toggle',
          content: 'packing list',
          body: 'passport\n\ntickets',
        }}
      />
    )
    const [summary] = await findAllTextBlocks()
    act(() => {
      textEditorOf(summary).commands.focus('end')
    })
    fireEvent.keyDown(summary, { key: 'Enter' })
    const [, body] = await findAllTextBlocks()
    await waitFor(() => expect(textEditorOf(body).isFocused).toBe(true))
    act(() => {
      textEditorOf(body).commands.insertContent('visa')
    })
    await waitFor(() => expect(screen.getByText('visa')).toBeInTheDocument())
    expect(screen.getByText('passport')).toBeInTheDocument()
    expect(screen.getByText('tickets')).toBeInTheDocument()
    expect(body.querySelectorAll('p')).toHaveLength(3)
  })

  it('same from a FOLDED toggle with an existing body', async () => {
    render(
      <StatefulToggle
        data={{
          id: 't1',
          type: 'toggle',
          content: 'packing list',
          body: 'passport\n\ntickets',
          folded: true,
        }}
      />
    )
    const [summary] = await findAllTextBlocks()
    act(() => {
      textEditorOf(summary).commands.focus('end')
    })
    fireEvent.keyDown(summary, { key: 'Enter' })
    const [, body] = await findAllTextBlocks()
    await waitFor(() => expect(textEditorOf(body).isFocused).toBe(true))
    act(() => {
      textEditorOf(body).commands.insertContent('visa')
    })
    await waitFor(() => expect(screen.getByText('visa')).toBeInTheDocument())
    expect(screen.getByText('passport')).toBeInTheDocument()
    expect(screen.getByText('tickets')).toBeInTheDocument()
    expect(body.querySelectorAll('p')).toHaveLength(3)
  })

  it('in the body adds a second body line — one block on the page, not a new one', async () => {
    const outerStepOut = jest.fn()
    render(
      <BlockRowProvider value={{ selected: false, stepOut: outerStepOut }}>
        <StatefulToggle
          data={{ id: 't1', type: 'toggle', content: 'packing list', body: 'passport' }}
        />
      </BlockRowProvider>
    )
    const [, body] = await findAllTextBlocks()
    act(() => {
      textEditorOf(body).commands.focus('end')
    })
    fireEvent.keyDown(body, { key: 'Enter' })
    act(() => {
      textEditorOf(body).commands.insertContent('visa')
    })
    await waitFor(() => expect(screen.getByText('visa')).toBeInTheDocument())
    expect(screen.getByText('passport')).toBeInTheDocument()
    expect(body.querySelectorAll('p')).toHaveLength(2)
    expect(outerStepOut).not.toHaveBeenCalled()
  })
})

describe('ToggleView — fold (KAN-480 build item 6)', () => {
  it('click writes folded true through commitStep — the todo pattern, its own change-log record', async () => {
    const commitStep = jest.fn()
    render(
      <BlockRowProvider value={{ selected: false, stepOut: () => {}, commitStep }}>
        <ToggleView data={{ ...full, folded: false }} editable onChange={() => {}} />
      </BlockRowProvider>
    )
    fireEvent.click(screen.getByRole('button'))
    expect(commitStep).toHaveBeenCalledWith({ ...full, folded: true })
  })

  it('falls back to onChange when no commitStep is provided — outside a BlockCanvas host', () => {
    const onChange = jest.fn()
    render(<ToggleView data={{ ...full, folded: false }} editable onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith({ ...full, folded: true })
  })

  it('folded editable does not mount the body editor', async () => {
    render(<ToggleView data={{ ...full, folded: true }} editable onChange={() => {}} />)
    const fields = await findAllTextBlocks()
    expect(fields).toHaveLength(1)
    expect(screen.queryByText('Passport')).not.toBeInTheDocument()
  })
})
