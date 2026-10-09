/** @jest-environment node */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { blockSchema, type Block } from '@/lib/modules/content'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { TableBlock } from '@/lib/modules/table/schema'
import { readHtml, MAX_HTML_BYTES, type HtmlReading } from '../html'

const fixture = (name: string) => readFileSync(join(__dirname, '../__fixtures__', name), 'utf8')

const read = (html: string): HtmlReading => {
  const result = readHtml(html)
  if (!result.ok) throw new Error(`expected a reading, got ${result.error.kind}`)
  return result
}

const views = (blocks: Block[]) => blocks.filter((b): b is ViewBlock => b.type === 'view')

describe('readHtml — running-log.html', () => {
  const reading = read(fixture('running-log.html'))

  it('yields text blocks, one database with 48 records and a table view, and a chart reading it', () => {
    expect(reading.blocks.map((b) => b.type)).toEqual([
      'text',
      'text',
      'text',
      'text',
      'text',
      'view',
      'view',
      'text',
    ])

    expect(reading.records).toHaveLength(1)
    const runs = reading.records[0]
    expect(runs.title).toBe('Runs')
    expect(runs.records).toHaveLength(48)
    expect(runs.schema.map((p) => [p.name, p.type])).toEqual([
      ['date', 'date'],
      ['distance', 'number'],
      ['time', 'text'],
      ['shoes', 'text'],
    ])
    const [date, distance] = runs.schema
    expect(runs.records[0].props[date.id]).toBe('2026-01-06')
    expect(runs.records[0].props[distance.id]).toBe(6)

    const [table, chart] = views(reading.blocks)
    expect(table).toMatchObject({ mode: 'table', collectionId: runs.id })
    expect(chart).toMatchObject({
      mode: 'chart',
      collectionId: runs.id,
      label: 'weekly distance',
      chart: { kind: 'bar', xProperty: date.id, series: [{ property: distance.id, agg: 'sum' }] },
    })
  })

  it('keeps inline bold, italic and links as the text block’s marks', () => {
    const texts = reading.blocks.flatMap((b) => (b.type === 'text' ? [b.content] : []))
    expect(texts).toEqual([
      '## Training notes',
      'Build to **40km a week** before the half in March.',
      'Long run on Sundays, *nothing fast* the day after.',
      'The plan is from [the club coach](https://example.com/plan).',
      '## Runs',
      '## Route',
    ])
  })

  it('takes its title from the file and does not repeat it as a heading block', () => {
    expect(reading.title).toBe('Running log')
  })

  it('names what it left out, and why', () => {
    expect(reading.leftOut.map((l) => l.name)).toEqual(['the map', 'the site’s links', 'styling'])
    for (const part of reading.leftOut) expect(part.why).not.toBe('')
    expect(reading.leftOut[0].from).toEqual(['section 3 › map'])
    expect(reading.leftOut[1].from).toEqual(['header', 'footer'])
  })

  it('validates every block against the registry’s block schema', () => {
    for (const block of reading.blocks) expect(blockSchema.safeParse(block).success).toBe(true)
  })

  it('says which part of the file every block came from', () => {
    for (const block of reading.blocks) expect(reading.provenance[block.id]).toBeTruthy()
    const [table, chart] = views(reading.blocks)
    expect(reading.provenance[table.id]).toBe('section 2 › table')
    expect(reading.provenance[chart.id]).toBe('section 2 › chart')
    expect(reading.provenance[reading.blocks[0].id]).toBe('section 1 › heading')
    expect(reading.provenance[reading.blocks[1].id]).toBe('section 1 › paragraph 1')
    expect(reading.records[0].from).toBe('section 2 › table')
  })

  it('counts what it found', () => {
    expect(reading.found).toEqual({ headings: 4, text: 3, tables: 1, charts: 1, images: 0 })
  })

  it('marks the runs table a database because a chart reads it, and is sure', () => {
    const [table] = views(reading.blocks)
    expect(reading.tables).toEqual([
      {
        blockId: table.id,
        became: 'database',
        because: 'chart',
        unsure: false,
        rows: 48,
        databaseId: reading.records[0].id,
      },
    ])
  })

  it('reads the same file to the same blocks every time', () => {
    expect(read(fixture('running-log.html'))).toEqual(reading)
  })
})

describe('readHtml — a short table of facts', () => {
  const reading = read(fixture('shoes.html'))

  it('stays a table block', () => {
    expect(reading.records).toEqual([])
    const table = reading.blocks.find((b): b is TableBlock => b.type === 'table')
    expect(table).toMatchObject({ title: 'shoes', columns: ['shoe', 'brand', 'km', 'use'] })
    expect(table?.rows).toHaveLength(6)
    expect(table?.rows[0].cells).toEqual(['pegasus 41', 'nike', '412', 'easy'])
    expect(reading.tables).toEqual([
      { blockId: table?.id, became: 'table', because: 'short', unsure: false, rows: 6 },
    ])
  })
})

describe('readHtml — scripts never run', () => {
  const html = fixture('scripted.html')
  const flag = '__pondImportScriptRan'

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[flag]
  })

  it('the control: a browser that runs the file does set the flag', () => {
    const dom = new JSDOM(html, { runScripts: 'dangerously' })
    expect((dom.window as unknown as Record<string, unknown>)[flag]).toBe(true)
    dom.window.close()
  })

  it('reading the file does not', () => {
    const reading = read(html)
    expect((globalThis as Record<string, unknown>)[flag]).toBeUndefined()
    const text = JSON.stringify(reading.blocks)
    expect(text).not.toContain('__pondImportScriptRan')
    expect(text).not.toContain('javascript:')
    expect(text).not.toContain('Turn on scripts')
    expect(reading.blocks).toContainEqual(expect.objectContaining({ content: 'check in' }))
    expect(reading.leftOut.map((l) => l.name)).toEqual(['scripts'])
  })
})

describe('readHtml — limits', () => {
  it('refuses a file over 20 MB with its size and the limit, and no blocks', () => {
    const html = `<p>${'a'.repeat(MAX_HTML_BYTES)}</p>`
    const result = readHtml(html)
    expect(result).toEqual({
      ok: false,
      error: { kind: 'too-large', size: MAX_HTML_BYTES + 7, limit: MAX_HTML_BYTES },
    })
    expect('blocks' in result).toBe(false)
  })

  it('measures the limit in bytes, not characters', () => {
    const result = readHtml(`<p>${'é'.repeat(MAX_HTML_BYTES / 2)}</p>`)
    expect(result.ok).toBe(false)
  })

  it.each([
    ['an empty file', ''],
    ['only whitespace', '  \n\t '],
    ['plain text', 'just a note about my run'],
    ['a binary file', '\u0089PNG\r\n\u001a\n\u0000\u0000\u0000\rIHDR'],
    ['markup with nothing in it', '<!doctype html><html><head></head><body></body></html>'],
  ])('calls %s unreadable', (_, html) => {
    expect(readHtml(html)).toEqual({ ok: false, error: { kind: 'unreadable' } })
  })
})
