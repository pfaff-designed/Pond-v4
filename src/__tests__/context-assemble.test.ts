/**
 * Tests for the context-assembly logic behind Track C
 * (@mention + auto node-context injection).
 *
 * The DB-fetch layer (fetchNodeContext / resolveMention) is verified live
 * against Supabase; here we unit-test the pure, branch-heavy logic:
 *   - parseMentions: extracting @references from a message
 *   - blocksToText: flattening document blocks to plain text
 *   - formatNodeContext: rendering a node's context block for the prompt
 *
 * Spec: ticket-04 §"Context scoping" + ticket-06 §"Retrieval (RAG)" —
 * inject the current node + direct children automatically; cross-space context
 * only via @mention / natural-language request.
 */

import {
  parseMentions,
  blocksToText,
  formatNodeContext,
  formatWorkspaceOutline,
  type NodeContextData,
  type PageSummary,
} from '@/lib/context/assemble'
import type { Block } from '@/lib/documents/types'

// ── parseMentions ────────────────────────────────────────────────────────────

describe('parseMentions', () => {
  it('extracts a simple @word mention', () => {
    expect(parseMentions('what about @Woodworking?')).toEqual(['Woodworking'])
  })

  it('extracts a bracketed multi-word mention', () => {
    expect(parseMentions('compare @[Website Redesign] to this')).toEqual(['Website Redesign'])
  })

  it('extracts multiple mentions of both kinds', () => {
    expect(parseMentions('link @Health and @[Meal Prep] together')).toEqual(['Health', 'Meal Prep'])
  })

  it('returns an empty array when there are no mentions', () => {
    expect(parseMentions('just a normal message')).toEqual([])
  })

  it('does not treat an email address as a mention', () => {
    expect(parseMentions('email me at cmp7cc@gmail.com')).toEqual([])
  })

  it('de-duplicates repeated mentions', () => {
    expect(parseMentions('@Health then more @Health')).toEqual(['Health'])
  })

  it('strips trailing punctuation from bare mentions', () => {
    expect(parseMentions('look at @Woodworking, please')).toEqual(['Woodworking'])
  })
})

// ── blocksToText ─────────────────────────────────────────────────────────────

describe('blocksToText', () => {
  it('renders a text block as its markdown content', () => {
    const blocks: Block[] = [{ id: 'b1', type: 'text', content: 'Hello world' }]
    expect(blocksToText(blocks)).toContain('Hello world')
  })

  it('renders todo items with checked state', () => {
    const blocks: Block[] = [
      {
        id: 'b1',
        type: 'todo',
        items: [
          { id: 't1', label: 'Buy wood', checked: false },
          { id: 't2', label: 'Sand it', checked: true },
        ],
      },
    ]
    const text = blocksToText(blocks)
    expect(text).toContain('Buy wood')
    expect(text).toContain('Sand it')
    expect(text).toMatch(/\[[ x]\]/) // some checkbox marker rendered
  })

  it('renders a metric block with label, value and unit', () => {
    const blocks: Block[] = [
      { id: 'b1', type: 'metric', label: 'Boards cut', value: 12, unit: 'pcs' },
    ]
    const text = blocksToText(blocks)
    expect(text).toContain('Boards cut')
    expect(text).toContain('12')
    expect(text).toContain('pcs')
  })

  it('renders a metric-ring block with label, sub and percentage', () => {
    const blocks: Block[] = [
      { id: 'b1', type: 'metric-ring', label: 'Overall Progress', sub: 'Phase 1 of 5', pct: 0.2 },
    ]
    const text = blocksToText(blocks)
    expect(text).toContain('Overall Progress')
    expect(text).toContain('Phase 1 of 5')
    expect(text).toContain('20')
  })

  it('renders a table block with every row and cell, not a summary', () => {
    const blocks: Block[] = [
      {
        id: 'b1',
        type: 'table',
        title: 'Power Tools',
        columns: ['Tool', 'Location'],
        rows: [
          { id: 'r1', cells: ['Table Saw', 'Centre of shop'] },
          { id: 'r2', cells: ['Bandsaw', 'Left wall'] },
        ],
      },
    ]
    const text = blocksToText(blocks)
    expect(text).toContain('Power Tools')
    expect(text).toContain('Tool')
    expect(text).toContain('Table Saw')
    expect(text).toContain('Centre of shop')
    expect(text).toContain('Bandsaw')
    expect(text).toContain('Left wall')
  })

  it('returns an empty string for no blocks', () => {
    expect(blocksToText([])).toBe('')
  })
})

// ── formatNodeContext ────────────────────────────────────────────────────────

function baseData(overrides: Partial<NodeContextData> = {}): NodeContextData {
  return {
    type: 'area',
    title: 'Woodworking',
    documents: [],
    children: [],
    ...overrides,
  }
}

describe('formatNodeContext', () => {
  it('includes the node type and title', () => {
    const out = formatNodeContext(baseData())
    expect(out).toContain('Woodworking')
    expect(out.toLowerCase()).toContain('area')
  })

  it('includes a status when present', () => {
    const out = formatNodeContext(
      baseData({ type: 'project', title: 'Build a workbench', status: 'active' })
    )
    expect(out).toContain('Build a workbench')
    expect(out).toContain('active')
  })

  it('lists direct children with their type and status', () => {
    const out = formatNodeContext(
      baseData({
        children: [
          { type: 'project', title: 'Build a workbench', status: 'active' },
          { type: 'action', title: 'Buy chisel set', status: 'open' },
        ],
      })
    )
    expect(out).toContain('Build a workbench')
    expect(out).toContain('Buy chisel set')
    expect(out).toContain('open')
  })

  it('includes document content', () => {
    const out = formatNodeContext(
      baseData({
        documents: [
          { title: 'Notes', blocks: [{ id: 'b1', type: 'text', content: 'chisels are sharp' }] },
        ],
      })
    )
    expect(out).toContain('chisels are sharp')
  })

  it('accepts a custom label (used for @mentioned nodes)', () => {
    const out = formatNodeContext(baseData(), { label: 'Referenced: @Woodworking' })
    expect(out).toContain('Referenced: @Woodworking')
  })

  it('renders a node with no children or documents without crashing', () => {
    const out = formatNodeContext(baseData())
    expect(typeof out).toBe('string')
    expect(out.length).toBeGreaterThan(0)
  })

  // ── block-id exposure (Slice 2: propose_changes needs stable UUIDs) ─────────
  // The auto-injected current node must surface each editable block's id so the
  // model can target a block in a propose_changes edit/remove. @mentioned nodes
  // must NOT (they are not an editable target), so id exposure is opt-in.

  it('exposes block ids for the current node when includeBlockIds is set', () => {
    const out = formatNodeContext(
      baseData({
        documents: [
          {
            title: 'Notes',
            blocks: [
              { id: 'blk-abc', type: 'text', content: 'first paragraph' },
              { id: 'blk-def', type: 'text', content: 'second paragraph' },
            ],
          },
        ],
      }),
      { includeBlockIds: true }
    )
    expect(out).toContain('blk-abc')
    expect(out).toContain('blk-def')
    // content still present so the model knows what each id refers to
    expect(out).toContain('first paragraph')
    expect(out).toContain('second paragraph')
  })

  it('does NOT expose block ids by default (e.g. for @mentioned nodes)', () => {
    const out = formatNodeContext(
      baseData({
        documents: [
          { title: 'Notes', blocks: [{ id: 'blk-secret', type: 'text', content: 'body text' }] },
        ],
      })
    )
    expect(out).not.toContain('blk-secret')
    // the human-readable content is still injected as before
    expect(out).toContain('body text')
  })
})

// ── formatWorkspaceOutline ───────────────────────────────────────────────────
// The outline exists so create_page can infer a parent (parentTitle) even from
// the Home view: titles only, top-level pages + their direct children.

describe('formatWorkspaceOutline', () => {
  const pages: PageSummary[] = [
    { id: 'a1', parentId: null, type: 'area', title: 'Creativity' },
    { id: 'a2', parentId: null, type: 'area', title: 'Health' },
    { id: 'w1', parentId: 'a1', type: 'area', title: 'Woodworking' },
    { id: 'p1', parentId: 'w1', type: 'project', title: 'Bench build' },
    { id: 'n1', parentId: null, type: 'page', title: 'Scratch note' },
  ]

  it('lists top-level pages with their type labels', () => {
    const out = formatWorkspaceOutline(pages)
    expect(out).toContain('Area: Creativity')
    expect(out).toContain('Area: Health')
    expect(out).toContain('Page: Scratch note')
  })

  it('nests direct children under their top-level parent', () => {
    const out = formatWorkspaceOutline(pages)
    expect(out).toContain('  - Area: Woodworking')
  })

  it('stops at two levels — grandchildren are not listed', () => {
    const out = formatWorkspaceOutline(pages)
    expect(out).not.toContain('Bench build')
  })

  it('never includes page ids (titles only, kept lean)', () => {
    const out = formatWorkspaceOutline(pages)
    expect(out).not.toContain('a1')
    expect(out).not.toContain('w1')
  })

  it('returns an empty string for an empty workspace', () => {
    expect(formatWorkspaceOutline([])).toBe('')
  })
})
