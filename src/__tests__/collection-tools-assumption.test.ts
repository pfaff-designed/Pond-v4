/**
 * The required `assumption` field (KAN-334) on the four collection proposal tool
 * INPUT gates not covered by `configure-view-tool.test.ts`: a shape missing it
 * fails `safeParse` and triggers `repairToolCall`, which re-asks the model.
 */
import {
  defineSchemaTool,
  addRowTool,
  promoteTableTool,
  linkRecordsTool,
} from '@/app/api/chat/tools'

const assumption = 'Taking the only matching collection as the target.'

describe('define_schema input — the assumption field (KAN-334)', () => {
  it('rejects a payload with no assumption', () => {
    expect(
      defineSchemaTool.inputSchema.safeParse({
        pageId: 'p1',
        properties: [{ name: 'Status', type: 'select', options: [{ label: 'Open' }] }],
      }).success
    ).toBe(false)
  })

  it('passes with an assumption', () => {
    expect(
      defineSchemaTool.inputSchema.safeParse({
        pageId: 'p1',
        properties: [{ name: 'Status', type: 'select', options: [{ label: 'Open' }] }],
        assumption,
      }).success
    ).toBe(true)
  })
})

describe('add_row input — the assumption field (KAN-334)', () => {
  it('rejects a payload with no assumption', () => {
    expect(
      addRowTool.inputSchema.safeParse({
        collectionId: 'c1',
        title: 'Dune',
        props: { Status: 'Reading' },
      }).success
    ).toBe(false)
  })

  it('passes with an assumption', () => {
    expect(
      addRowTool.inputSchema.safeParse({
        collectionId: 'c1',
        title: 'Dune',
        props: { Status: 'Reading' },
        assumption,
      }).success
    ).toBe(true)
  })
})

describe('promote_table input — the assumption field (KAN-334)', () => {
  it('rejects a payload with no assumption', () => {
    expect(promoteTableTool.inputSchema.safeParse({ pageId: 'p1' }).success).toBe(false)
  })

  it('passes with an assumption', () => {
    expect(promoteTableTool.inputSchema.safeParse({ pageId: 'p1', assumption }).success).toBe(true)
  })
})

describe('link_records input — the assumption field (KAN-334)', () => {
  it('rejects a payload with no assumption', () => {
    expect(
      linkRecordsTool.inputSchema.safeParse({
        fromRow: 'Dune',
        fromCollection: 'Reading List',
        relation: 'Shelf',
        toRows: ['Sci-fi'],
      }).success
    ).toBe(false)
  })

  it('passes with an assumption', () => {
    expect(
      linkRecordsTool.inputSchema.safeParse({
        fromRow: 'Dune',
        fromCollection: 'Reading List',
        relation: 'Shelf',
        toRows: ['Sci-fi'],
        assumption,
      }).success
    ).toBe(true)
  })
})
