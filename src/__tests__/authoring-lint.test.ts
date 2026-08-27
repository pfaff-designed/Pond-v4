/**
 * Ticket-21 emit-time authoring lint — heuristic unit tests.
 *
 * These are the PROOF for the lint (the .mts evals hit the live API and are not run
 * here). The two heuristics are deterministic string predicates; the bar is: flag
 * the real anti-patterns (a markdown pipe table in a text block; a first-block
 * heading that echoes the page title) and NEVER flag legitimate prose — especially
 * prose that merely contains a `|` character.
 */
import {
  isMarkdownPipeTable,
  isTitleEchoHeading,
} from '@/lib/modules/authoring-lint'
import { moduleDataSchema } from '@/lib/modules/ai-composition'
import { createPageTool } from '@/app/api/chat/tools'

describe('isMarkdownPipeTable — positive (should flag)', () => {
  it('a canonical GFM pipe table', () => {
    const md = [
      '| Tool | Category | Qty |',
      '| --- | --- | --- |',
      '| Cordless drill | Power tools | 1 |',
      '| Circular saw | Power tools | 1 |',
    ].join('\n')
    expect(isMarkdownPipeTable(md)).toBe(true)
  })

  it('a pipe table embedded below a heading and prose', () => {
    const md = [
      '## Reading progress',
      'Here is where I am so far this fall.',
      '',
      '| Book | Status |',
      '|------|--------|',
      '| Dune | Reading |',
    ].join('\n')
    expect(isMarkdownPipeTable(md)).toBe(true)
  })

  it('a table using colon-aligned separator cells', () => {
    const md = ['| A | B |', '| :--- | ---: |', '| 1 | 2 |'].join('\n')
    expect(isMarkdownPipeTable(md)).toBe(true)
  })

  it('table without outer leading/trailing pipes (still >=2 pipes per row)', () => {
    const md = ['Name | Role | Team', '--- | --- | ---', 'Ada | Eng | Core'].join('\n')
    expect(isMarkdownPipeTable(md)).toBe(true)
  })
})

describe('isMarkdownPipeTable — negative (must NOT flag legitimate prose)', () => {
  it('plain prose with no pipes', () => {
    expect(isMarkdownPipeTable('A hearty lasagna that reheats well all week.')).toBe(false)
  })

  it('prose that happens to contain a single pipe character', () => {
    expect(
      isMarkdownPipeTable('Run the build | tee the log, then check the output.')
    ).toBe(false)
  })

  it('prose with several pipes but no separator rule line', () => {
    const md = 'Options: red | green | blue. Pick one and note it below | in the margin.'
    expect(isMarkdownPipeTable(md)).toBe(false)
  })

  it('a single key|value line (no separator, no second row)', () => {
    expect(isMarkdownPipeTable('Status | In progress')).toBe(false)
  })

  it('a markdown horizontal rule (---) that is not a table separator', () => {
    const md = ['Intro paragraph.', '', '---', '', 'Next section.'].join('\n')
    expect(isMarkdownPipeTable(md)).toBe(false)
  })

  it('a header + separator but no body row is not yet a table', () => {
    // Incomplete: a lone header over a rule with nothing beneath it is not the
    // data-loss anti-pattern the lint targets.
    expect(isMarkdownPipeTable(['| A | B |', '| --- | --- |'].join('\n'))).toBe(false)
  })

  it('an empty string', () => {
    expect(isMarkdownPipeTable('')).toBe(false)
  })
})

describe('isTitleEchoHeading — positive (should flag)', () => {
  it('a `##` heading identical to the title', () => {
    expect(isTitleEchoHeading('## Fall Reading List', 'Fall Reading List')).toBe(true)
  })

  it('a heading with a leading emoji echoing the title', () => {
    expect(isTitleEchoHeading('## 📚 Fall Reading List', 'Fall Reading List')).toBe(true)
  })

  it('case- and whitespace-insensitive', () => {
    expect(isTitleEchoHeading('#   fall   reading   list  ', 'Fall Reading List')).toBe(true)
  })

  it('a `#` H1 echo followed by real content beneath it', () => {
    const md = '# Workshop Tools\nEverything in the garage shop.'
    expect(isTitleEchoHeading(md, 'Workshop Tools')).toBe(true)
  })
})

describe('isTitleEchoHeading — negative (must NOT flag)', () => {
  it('a heading that is genuinely different from the title', () => {
    expect(isTitleEchoHeading('## Ingredients', 'Weeknight Lasagna')).toBe(false)
  })

  it('a first block that is prose, not a heading', () => {
    expect(
      isTitleEchoHeading('A hearty lasagna that reheats well.', 'Weeknight Lasagna')
    ).toBe(false)
  })

  it('a heading that merely MENTIONS the title inside a longer line', () => {
    expect(
      isTitleEchoHeading('## Why the Fall Reading List matters', 'Fall Reading List')
    ).toBe(false)
  })

  it('an empty title never matches', () => {
    expect(isTitleEchoHeading('## Anything', '')).toBe(false)
  })
})

// ── Wired into the real emit-time gates ──────────────────────────────────────
// The heuristics are pure, but the enforcement decision is that they run as Zod
// refinements on the ACTUAL tool schemas (t16 branch 7). These assert the wiring:
// a violating payload fails the same gate the AI SDK validates tool calls against.

describe('emit-time gate: pipe table in a text-module payload is rejected', () => {
  const pipeTableText = {
    type: 'text' as const,
    content: ['| Book | Status |', '| --- | --- |', '| Dune | Reading |'].join('\n'),
  }

  it('moduleDataSchema rejects a text block that is a markdown pipe table', () => {
    expect(moduleDataSchema.safeParse(pipeTableText).success).toBe(false)
  })

  it('moduleDataSchema accepts ordinary prose (with an incidental pipe)', () => {
    const ok = { type: 'text' as const, content: 'Read A | then B, in that order.' }
    expect(moduleDataSchema.safeParse(ok).success).toBe(true)
  })

  it('the equivalent data as a real table module validates', () => {
    const asTable = {
      type: 'table' as const,
      title: 'Reading',
      columns: ['Book', 'Status'],
      rows: [{ cells: ['Dune', 'Reading'] }],
    }
    expect(moduleDataSchema.safeParse(asTable).success).toBe(true)
  })
})

describe('emit-time gate: create_page rejects a title-echo first block', () => {
  const schema = createPageTool.inputSchema

  it('rejects a first text block that echoes the page title', () => {
    const input = {
      type: 'page' as const,
      title: 'Fall Reading List',
      blocks: [
        { type: 'text' as const, content: '## 📚 Fall Reading List' },
        { type: 'text' as const, content: 'A running list of what to read this fall.' },
      ],
    }
    expect(schema.safeParse(input).success).toBe(false)
  })

  it('accepts a page that opens with real content instead of a title echo', () => {
    const input = {
      type: 'page' as const,
      title: 'Fall Reading List',
      blocks: [
        { type: 'text' as const, content: 'A running list of what to read this fall.' },
      ],
    }
    expect(schema.safeParse(input).success).toBe(true)
  })

  it('accepts a non-echo heading as the first block', () => {
    const input = {
      type: 'page' as const,
      title: 'Fall Reading List',
      blocks: [{ type: 'text' as const, content: '## To read first' }],
    }
    expect(schema.safeParse(input).success).toBe(true)
  })
})
