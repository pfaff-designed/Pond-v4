/**
 * read_page tool (ticket-30) — the cross-page READ that lets the model load a page
 * that is NOT the one open, so a cross-page propose_changes can reference the right
 * block ids.
 *
 * The tool's `execute` closure lives in the chat route (it captures the per-request
 * supabase client + user); here we pin the two pieces it is built from:
 *   1. the tool's input schema (a required pageId),
 *   2. the read contract — `formatNodeContext(..., { includeBlockIds: true })` must
 *      surface each block's id, since the whole point is to give the model correct
 *      ids to target. This mirrors exactly what the route's execute returns.
 */

import { readPageTool } from '@/app/api/chat/tools'
import { formatNodeContext, type NodeContextData } from '@/lib/context/assemble'
import type { Block } from '@/lib/documents/types'

describe('readPageTool schema', () => {
  it('requires a non-empty pageId', () => {
    expect(readPageTool.inputSchema.safeParse({ pageId: 'abc' }).success).toBe(true)
    expect(readPageTool.inputSchema.safeParse({ pageId: '' }).success).toBe(false)
    expect(readPageTool.inputSchema.safeParse({}).success).toBe(false)
  })

  it('names read_page and the workspace outline in its description (so the model reads before editing)', () => {
    expect(readPageTool.description).toMatch(/workspace outline/i)
    expect(readPageTool.description).toMatch(/id/i)
  })
})

describe('read_page contract: block ids are surfaced', () => {
  it('formats the read page with each block id (the route returns exactly this)', () => {
    const blocks: Block[] = [
      { id: 'blk-1', type: 'text', content: 'Buy a pottery wheel' } as Block,
      { id: 'blk-2', type: 'text', content: 'Set up the studio' } as Block,
    ]
    const data: NodeContextData = {
      type: 'project',
      title: 'Ceramics Studio Plan',
      documents: [{ title: 'Ceramics Studio Plan', blocks }],
      children: [],
    }
    const out = formatNodeContext(data, {
      label: 'Read: Ceramics Studio Plan',
      includeBlockIds: true,
    })
    expect(out).toContain('Read: Ceramics Studio Plan')
    expect(out).toContain('[blk-1]')
    expect(out).toContain('[blk-2]')
  })
})
