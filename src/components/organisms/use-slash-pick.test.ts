import { renderHook } from '@testing-library/react'
import type { SlashRow } from '@/components/molecules/SlashMenu'
import type { Block } from '@/lib/documents/types'
import { landAtSlash, undoLanding, useSlashPick, type Landing, type SlashTarget } from './use-slash-pick'

const table: Block = { id: 'b-table', type: 'table', columns: ['Tool'], rows: [] }
const picked: Block = { id: 'todo-1', type: 'todo', items: [] }
const host: Block = { id: 'b-text', type: 'text', content: 'above\n\n/\n\nbelow', label: 'notes' }
const line = { before: 'above', markdown: '/', after: 'below', query: '' }
const target: SlashTarget = { hostId: 'b-text', content: host.content, line }

const land = (blocks: Block[], at: SlashTarget, inserted: Block | null): Landing => {
  const landing = landAtSlash(blocks, at, inserted)
  if (!landing) throw new Error('nothing landed')
  return landing
}

/** `blocks` with the block `id` given `content`. */
const edit = (blocks: Block[], id: string, content: string): Block[] =>
  blocks.map((b) => (b.id === id && b.type === 'text' ? { ...b, content } : b))

describe('landAtSlash', () => {
  it('splits the host around the pick, its id and label on the text above', () => {
    const landing = land([table, host], target, picked)
    expect(landing.next).toEqual([
      table,
      { id: 'b-text', type: 'text', content: 'above', label: 'notes' },
      picked,
      { id: expect.any(String), type: 'text', content: 'below' },
    ])
    expect(landing.landed).toBe(picked)
  })

  it('a `/…` block is replaced whole', () => {
    const slashBlock: Block = { id: 'b-text', type: 'text', content: '/che' }
    const landing = land(
      [slashBlock, table],
      { hostId: 'b-text', content: '/che', line: null },
      picked
    )
    expect(landing.next).toEqual([picked, table])
  })

  it('a `/…` block typed into since the pick began is kept, with the pick after it', () => {
    const typed: Block = { id: 'b-text', type: 'text', content: '/table and what I typed since' }
    const landing = land([typed], { hostId: 'b-text', content: '/table', line: null }, picked)
    expect(landing.next).toEqual([typed, picked])
  })

  it('a host edited since the pick began is kept whole, with the pick after it', () => {
    const edited: Block = { ...host, content: 'above\n\n/\n\nbelow, and more' }
    expect(land([edited, table], target, picked).next).toEqual([edited, picked, table])
  })

  it('nothing lands when the host is gone', () => {
    expect(landAtSlash([table], target, picked)).toBeNull()
  })

  it('with nothing to land, only the `/` line goes and the host stays one block', () => {
    expect(land([host], target, null).next).toEqual([
      { id: 'b-text', type: 'text', content: 'above\n\nbelow', label: 'notes' },
    ])
  })
})

describe('undoLanding', () => {
  it('rejoins an untouched split into exactly the block it was', () => {
    const landing = land([table, host], target, picked)
    expect(undoLanding(landing.next, landing)).toEqual([table, host])
  })

  it('rejoins a split with text only above, or only below', () => {
    const onlyAbove = { ...host, content: 'above\n\n/' }
    const above = land(
      [onlyAbove],
      { ...target, content: onlyAbove.content, line: { ...line, after: '' } },
      picked
    )
    expect(undoLanding(above.next, above)).toEqual([onlyAbove])

    const onlyBelow = { ...host, content: '/\n\nbelow' }
    const below = land(
      [onlyBelow],
      { ...target, content: onlyBelow.content, line: { ...line, before: '' } },
      picked
    )
    expect(undoLanding(below.next, below)).toEqual([onlyBelow])
  })

  it('a half edited since keeps both halves, with the `/` line back between them', () => {
    const landing = land([host], target, picked)
    const belowId = landing.next[2].id
    const edited = edit(landing.next, belowId, 'below, and more')
    expect(undoLanding(edited, landing)).toEqual([
      { id: 'b-text', type: 'text', content: 'above', label: 'notes' },
      { id: expect.any(String), type: 'text', content: '/' },
      { id: belowId, type: 'text', content: 'below, and more' },
    ])

    const editedAbove = edit(landing.next, 'b-text', 'above, and more')
    expect(undoLanding(editedAbove, landing)).toEqual([
      { id: 'b-text', type: 'text', content: 'above, and more', label: 'notes' },
      { id: expect.any(String), type: 'text', content: '/' },
      { id: belowId, type: 'text', content: 'below' },
    ])
  })

  it('a pick that replaced the whole block gives the block back', () => {
    const onlyLine = { ...host, content: '/\n\n' }
    const landing = land(
      [onlyLine],
      { ...target, content: onlyLine.content, line: { ...line, before: '', after: '' } },
      picked
    )
    expect(landing.next).toEqual([{ ...picked, id: 'b-text', label: 'notes' }])
    expect(undoLanding(landing.next, landing)).toEqual([onlyLine])
  })

  it('a pick that landed after an edited host is simply taken out', () => {
    const edited: Block = { ...host, content: 'rewritten' }
    const landing = land([edited], target, picked)
    expect(undoLanding(landing.next, landing)).toEqual([edited])
  })
})

describe('useSlashPick · handleSlashSelect with a free-text row', () => {
  const setup = () => {
    const onChange = jest.fn()
    const markInserted = jest.fn()
    const slashBlock: Block = { id: 'b-slash', type: 'text', content: '/wine' }
    const { result } = renderHook(() =>
      useSlashPick({
        blocks: [slashBlock],
        onChange,
        markInserted,
        openSourcePicker: jest.fn(),
        makePageFromRow: jest.fn(),
        makePageFromTemplate: jest.fn(),
      })
    )
    return { result, onChange, markInserted }
  }

  it('mints a text block from the free-text row’s word', () => {
    const { result, onChange, markInserted } = setup()
    const row: SlashRow = { id: 'freetext:text', label: 'text', freeText: { as: 'text', word: 'wine' } }

    result.current.handleSlashSelect(0, row, null)

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'text', content: 'wine' }),
    ])
    expect(markInserted).toHaveBeenCalledWith(onChange.mock.calls[0][0][0].id)
  })

  it('keeps the word’s own casing — `/Wine` lands a block reading `Wine`', () => {
    const { result, onChange } = setup()
    const row: SlashRow = { id: 'freetext:text', label: 'text', freeText: { as: 'text', word: 'Wine' } }

    result.current.handleSlashSelect(0, row, null)

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'text', content: 'Wine' }),
    ])
  })

  it('mints a heading block, content prefixed with `## `, from the free-text row’s word', () => {
    const { result, onChange } = setup()
    const row: SlashRow = {
      id: 'freetext:heading',
      label: 'heading',
      freeText: { as: 'heading', word: 'wine' },
    }

    result.current.handleSlashSelect(0, row, null)

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'text', content: '## wine' }),
    ])
  })
})
