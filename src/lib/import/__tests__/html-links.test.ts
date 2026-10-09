/** @jest-environment node */
import { blockSchema } from '@/lib/modules/content'
import { readHtml, type HtmlReading, type ReadHtmlOptions } from '../html'

const read = (body: string, opts?: ReadHtmlOptions, head = ''): HtmlReading => {
  const result = readHtml(
    `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`,
    opts
  )
  if (!result.ok) throw new Error(`expected a reading, got ${result.error.kind}`)
  for (const block of result.blocks) expect(blockSchema.safeParse(block).success).toBe(true)
  return result
}

const LINK_LEFT_OUT = 'the words are kept, but where they sit holds no link.'

const pdf = (caption: string, url = 'https://club.example/plan.pdf') =>
  expect.objectContaining({
    type: 'image',
    url,
    filename: url.split('/').pop(),
    mediaType: 'application/pdf',
    caption,
  })

const rows = (count: number, cell: (i: number) => string) =>
  Array.from({ length: count }, (_, i) => `<tr><td>run ${i}</td><td>${cell(i)}</td></tr>`).join('')

describe('links in list items', () => {
  it('makes a file link a file block after the list', () => {
    const reading = read(
      '<ul><li>read <a href="https://club.example/plan.pdf">the plan</a></li><li>rest</li></ul>'
    )
    expect(reading.blocks).toEqual([expect.objectContaining({ type: 'todo' }), pdf('the plan')])
    const list = reading.blocks[0]
    expect(list.type === 'todo' && list.items.map((i) => i.label)).toEqual([
      'read the plan',
      'rest',
    ])
    expect(reading.leftOut).toEqual([])
  })

  it('lists the address of any other link, counted', () => {
    const reading = read(
      '<ul><li><a href="https://club.example/a">a</a></li><li><a href="https://club.example/b">b</a></li></ul>'
    )
    expect(reading.leftOut).toEqual([
      { name: '2 links’ addresses', why: LINK_LEFT_OUT, from: ['list'] },
    ])
  })
})

describe('links in table cells', () => {
  it('keeps links and bold in a table block’s cells, escaped as markdown', () => {
    const reading = read(
      '<table><tr><th>what</th><th>how</th></tr><tr><td>2*3*4</td><td><b>fast</b> <a href="https://club.example/pace">pace</a></td></tr></table>'
    )
    const table = reading.blocks[0]
    expect(table.type === 'table' && table.rows[0].cells).toEqual([
      '2\\*3\\*4',
      '**fast** [pace](https://club.example/pace)',
    ])
    expect(reading.leftOut).toEqual([])
  })

  it('makes a file link in a table block’s cell a file block after the table', () => {
    const reading = read(
      '<table><tr><td>plan</td><td><a href="https://club.example/plan.pdf">the plan</a></td></tr></table>'
    )
    expect(reading.blocks).toEqual([expect.objectContaining({ type: 'table' }), pdf('the plan')])
    expect(reading.leftOut).toEqual([])
  })

  it('makes a file link in a database’s cell a file block, and lists any other link', () => {
    const reading = read(
      `<table><tr><th>run</th><th>notes</th></tr>${rows(9, (i) =>
        i === 0
          ? '<a href="https://club.example/route.pdf">route</a>'
          : `<a href="https://club.example/runs/${i}">log</a>`
      )}</table>`
    )
    expect(reading.blocks).toEqual([
      expect.objectContaining({ type: 'view', mode: 'table' }),
      pdf('route', 'https://club.example/route.pdf'),
    ])
    expect(reading.leftOut).toEqual([
      { name: '8 links’ addresses', why: LINK_LEFT_OUT, from: ['table'] },
    ])
  })

  it('names a database field it has no header for by its place', () => {
    const reading = read(
      `<table><tr><th>run</th><th></th></tr>${rows(9, (i) => `${i * 2}`)}</table>`
    )
    expect(reading.databases[0].schema.map((field) => field.name)).toEqual(['run', 'field 2'])
  })
})

describe('other links whose address has nowhere to go', () => {
  it('lists a link around an image', () => {
    const reading = read(
      '<a href="https://club.example/finish"><img src="https://cdn.example/finish.png"></a>'
    )
    expect(reading.blocks.map((b) => b.type)).toEqual(['image'])
    expect(reading.leftOut).toEqual([
      { name: 'a link’s address', why: LINK_LEFT_OUT, from: ['link'] },
    ])
  })

  it('does not list links inside a part already listed', () => {
    const reading = read('<nav><a href="https://club.example/">home</a></nav>')
    expect(reading.leftOut.map((l) => l.name)).toEqual(['the site’s links'])
  })
})

describe('<base href>', () => {
  const body =
    '<ul><li><a href="plan.pdf">the plan</a></li></ul><img src="finish.png" alt="finish">'

  it('resolves relative links and images against it', () => {
    const reading = read(body, {}, '<base href="https://club.example/runs/">')
    expect(reading.blocks).toEqual([
      expect.objectContaining({ type: 'todo' }),
      pdf('the plan', 'https://club.example/runs/plan.pdf'),
      expect.objectContaining({ type: 'image', url: 'https://club.example/runs/finish.png' }),
    ])
  })

  it('resolves a relative base against the file’s own address', () => {
    const reading = read(
      body,
      { baseUrl: 'https://club.example/2026/report.html' },
      '<base href="assets/">'
    )
    expect(reading.linkedImages).toEqual(['https://club.example/2026/assets/finish.png'])
  })

  it('falls back to the file’s own address without one', () => {
    const reading = read(body, { baseUrl: 'https://club.example/2026/report.html' })
    expect(reading.linkedImages).toEqual(['https://club.example/2026/finish.png'])
  })
})
