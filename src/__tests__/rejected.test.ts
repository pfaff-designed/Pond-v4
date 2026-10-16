import { proposalToolCallIds, rejectedContextNote } from '@/app/api/chat/rejected'

describe('proposalToolCallIds', () => {
  it('collects tool-call ids for propose_changes and the five collection tools', () => {
    const ids = proposalToolCallIds([
      {
        id: 'a1',
        parts: [
          { type: 'text' },
          { type: 'tool-propose_changes', toolCallId: 'pc1' },
          { type: 'tool-define_schema', toolCallId: 'ds1' },
          { type: 'tool-add_row', toolCallId: 'ar1' },
          { type: 'tool-promote_table', toolCallId: 'pt1' },
          { type: 'tool-configure_view', toolCallId: 'cv1' },
          { type: 'tool-link_records', toolCallId: 'lr1' },
        ],
      },
    ])
    expect(ids).toEqual(['pc1', 'ds1', 'ar1', 'pt1', 'cv1', 'lr1'])
  })

  it('excludes create_page — a reject on a brand-new page is not "the same edit"', () => {
    const ids = proposalToolCallIds([
      { id: 'a1', parts: [{ type: 'tool-create_page', toolCallId: 'cp1' }] },
    ])
    expect(ids).toEqual([])
  })

  it('ignores a part with no toolCallId', () => {
    const ids = proposalToolCallIds([
      { id: 'a1', parts: [{ type: 'tool-propose_changes' }] },
    ])
    expect(ids).toEqual([])
  })

  it('returns an empty array for an empty transcript', () => {
    expect(proposalToolCallIds([])).toEqual([])
  })
})

describe('rejectedContextNote', () => {
  it('returns null when there are no rejected entries', () => {
    expect(rejectedContextNote([])).toBeNull()
  })

  it('renders one line per entry naming the target page and a summary', () => {
    const note = rejectedContextNote([
      { targetTitle: 'kitchen renovation', summary: 'electrician → w/c 6 oct' },
      { targetTitle: 'schedule', summary: 'added 2 rows' },
    ])
    expect(note).toContain('[Rejected]')
    expect(note).toContain('kitchen renovation: electrician → w/c 6 oct')
    expect(note).toContain('schedule: added 2 rows')
  })
})
