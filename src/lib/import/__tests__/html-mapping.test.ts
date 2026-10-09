/** @jest-environment node */
import { blockSchema } from '@/lib/modules/content'
import { readHtml, type HtmlReading, type ReadHtmlOptions } from '../html'

const read = (body: string, opts?: ReadHtmlOptions): HtmlReading => {
  const result = readHtml(
    `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`,
    opts
  )
  if (!result.ok) throw new Error(`expected a reading, got ${result.error.kind}`)
  for (const block of result.blocks) expect(blockSchema.safeParse(block).success).toBe(true)
  return result
}

const contents = (reading: HtmlReading) =>
  reading.blocks.flatMap((b) => (b.type === 'text' ? [b.content] : []))

const rowsHtml = (count: number, cells: (i: number) => string[]) =>
  Array.from(
    { length: count },
    (_, i) =>
      `<tr>${cells(i)
        .map((c) => `<td>${c}</td>`)
        .join('')}</tr>`
  ).join('')

describe('text', () => {
  it('puts headings at the text block’s heading levels', () => {
    expect(contents(read('<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h6>e</h6>'))).toEqual([
      '# a',
      '## b',
      '### c',
      '### d',
      '### e',
    ])
  })

  it('uses the first heading as the title when the file has none', () => {
    const result = readHtml('<h1>Long runs</h1><p>slow and steady</p>')
    expect(result.ok && result.title).toBe('Long runs')
    expect(result.ok && result.blocks.map((b) => b.type === 'text' && b.content)).toEqual([
      'slow and steady',
    ])
  })

  it('keeps code, strikethrough and line breaks as marks, and escapes markdown in plain text', () => {
    expect(
      contents(read('<p>run <code>5k</code> <del>fast</del><br>2 * 3 = [6] and_so_on</p>'))
    ).toEqual(['run `5k` ~~fast~~\n2 \\* 3 = \\[6\\] and\\_so\\_on'])
  })

  it('escapes a paragraph that would read as a markdown heading or list', () => {
    expect(contents(read('<p># not a heading</p><p>- not a list</p><p>1. not either</p>'))).toEqual(
      ['\\# not a heading', '\\- not a list', '1\\. not either']
    )
  })

  it('drops a link it cannot follow and keeps its words', () => {
    expect(
      contents(read('<p><a href="#top">back up</a> or <a href="javascript:x()">go</a></p>'))
    ).toEqual(['back up or go'])
  })

  it('resolves relative links against the base url', () => {
    expect(
      contents(read('<p><a href="/plan">plan</a></p>', { baseUrl: 'https://club.example/runs/' }))
    ).toEqual(['[plan](https://club.example/plan)'])
  })

  it('reads loose text in a container as a paragraph', () => {
    expect(contents(read('<div>easy <b>miles</b></div>'))).toEqual(['easy **miles**'])
  })

  it('makes a quote a quoted text block', () => {
    expect(
      contents(read('<blockquote><p>run the mile you are in</p><p>then the next</p></blockquote>'))
    ).toEqual(['> run the mile you are in\n>\n> then the next'])
  })

  it('keeps preformatted text as a fenced code block', () => {
    expect(contents(read('<pre><code class="language-js">let km = 5\nkm++</code></pre>'))).toEqual([
      '```js\nlet km = 5\nkm++\n```',
    ])
  })
})

describe('lists', () => {
  it('makes ul and ol a list', () => {
    const reading = read(
      '<ul><li>shoes</li><li>gels</li></ul><ol><li>warm up</li><li>run</li></ol>'
    )
    expect(reading.blocks).toEqual([
      expect.objectContaining({
        type: 'todo',
        marker: 'dot',
        items: [
          expect.objectContaining({ label: 'shoes', checked: false }),
          expect.objectContaining({ label: 'gels', checked: false }),
        ],
      }),
      expect.objectContaining({ type: 'todo', marker: 'dot' }),
    ])
  })

  it('makes a list of checkboxes a checklist that keeps its checked state', () => {
    const reading = read(
      '<ul><li><input type="checkbox" checked> book the race</li><li><label><input type="checkbox"> taper</label></li></ul>'
    )
    expect(reading.blocks).toEqual([
      expect.objectContaining({
        type: 'todo',
        marker: 'check',
        items: [
          expect.objectContaining({ label: 'book the race', checked: true }),
          expect.objectContaining({ label: 'taper', checked: false }),
        ],
      }),
    ])
    expect(reading.leftOut).toEqual([])
  })

  it('flattens a nested list in reading order', () => {
    const reading = read(
      '<ul><li>legs<ul><li>squats</li><li>lunges</li></ul></li><li>core</li></ul>'
    )
    const list = reading.blocks[0]
    expect(list.type === 'todo' && list.items.map((i) => i.label)).toEqual([
      'legs',
      'squats',
      'lunges',
      'core',
    ])
  })
})

describe('images and files', () => {
  it('makes img and figure > img image blocks', () => {
    const reading = read(
      '<img src="https://cdn.example/start.jpg" alt="the start"><figure><img src="finish.png" alt="x"><figcaption>the finish</figcaption></figure>',
      { baseUrl: 'https://club.example/race/' }
    )
    expect(reading.blocks).toEqual([
      expect.objectContaining({
        type: 'image',
        url: 'https://cdn.example/start.jpg',
        filename: 'start.jpg',
        mediaType: 'image/jpeg',
        caption: 'the start',
      }),
      expect.objectContaining({
        type: 'image',
        url: 'https://club.example/race/finish.png',
        caption: 'the finish',
      }),
    ])
    expect(reading.linkedImages).toEqual([
      'https://cdn.example/start.jpg',
      'https://club.example/race/finish.png',
    ])
    expect(reading.found.images).toBe(2)
  })

  it('makes a link to a non-HTML file a file block', () => {
    const reading = read('<p><a href="https://club.example/plan.pdf">the plan</a></p>')
    expect(reading.blocks).toEqual([
      expect.objectContaining({
        type: 'image',
        url: 'https://club.example/plan.pdf',
        filename: 'plan.pdf',
        mediaType: 'application/pdf',
        caption: 'the plan',
      }),
    ])
    expect(reading.linkedImages).toEqual([])
  })

  it('keeps a file link inside prose as a link', () => {
    expect(
      contents(read('<p>read <a href="https://club.example/plan.pdf">the plan</a> first</p>'))
    ).toEqual(['read [the plan](https://club.example/plan.pdf) first'])
  })

  it('places an image from a list item or a table cell after the list or table', () => {
    const reading = read(
      '<ul><li>start <img src="https://cdn.example/a.png"></li></ul><table><tr><td>finish <img src="https://cdn.example/b.png"></td></tr></table>'
    )
    expect(reading.blocks.map((b) => b.type)).toEqual(['todo', 'image', 'table', 'image'])
    expect(reading.linkedImages).toEqual(['https://cdn.example/a.png', 'https://cdn.example/b.png'])
  })

  it('lifts an image out of a paragraph and keeps the words', () => {
    const reading = read('<p>at the line <img src="https://cdn.example/line.webp" alt="line"></p>')
    expect(reading.blocks.map((b) => b.type)).toEqual(['text', 'image'])
  })
})

describe('tables', () => {
  const table = (count: number, cells: (i: number) => string[]) =>
    read(`<table><tr><th>a</th><th>b</th></tr>${rowsHtml(count, cells)}</table>`)

  it('makes a table with a date column a database', () => {
    const reading = table(3, (i) => [`2026-02-0${i + 1}`, `${i}`])
    expect(reading.tables[0]).toMatchObject({ became: 'database', because: 'dates', unsure: false })
    expect(reading.blocks).toEqual([
      expect.objectContaining({
        type: 'view',
        mode: 'table',
        collectionId: reading.databases[0].id,
      }),
    ])
  })

  it('reads a <time> cell by its machine date', () => {
    const reading = read(
      `<table><tr><th>day</th></tr><tr><td><time datetime="2026-03-01">1 mar</time></td></tr><tr><td><time datetime="2026-03-02">2 mar</time></td></tr><tr><td><time datetime="2026-03-03">3 mar</time></td></tr></table>`
    )
    expect(reading.databases[0].schema[0].type).toBe('date')
  })

  it.each([
    [6, 'table', 'short', false],
    [7, 'table', 'short', true],
    [8, 'table', 'short', true],
    [9, 'database', 'rows', true],
    [10, 'database', 'rows', true],
    [11, 'database', 'rows', false],
  ])('%i rows without dates → %s (%s), unsure %s', (count, became, because, unsure) => {
    const reading = table(count, (i) => [`thing ${i}`, `${i}`])
    expect(reading.tables[0]).toMatchObject({ became, because, unsure, rows: count })
  })

  it('is unsure about a date table of one or two rows', () => {
    expect(table(2, (i) => [`2026-02-0${i + 1}`, 'x']).tables[0]).toMatchObject({
      became: 'database',
      unsure: true,
    })
  })

  it('names columns it has no header for', () => {
    const reading = read('<table><tr><td>pace</td><td>5:10</td></tr></table>')
    expect(reading.blocks[0]).toMatchObject({ type: 'table', columns: ['column 1', 'column 2'] })
  })
})

describe('charts', () => {
  it('rebuilds a chart on the table it was drawn from, in the same figure', () => {
    const reading = read(
      `<figure><canvas aria-label="km by shoe"></canvas><table><tr><th>shoe</th><th>km</th></tr>${rowsHtml(3, (i) => [`s${i}`, `${i * 10}`])}</table></figure>`
    )
    const db = reading.databases[0]
    expect(reading.tables[0]).toMatchObject({ became: 'database', because: 'chart' })
    expect(reading.blocks.map((b) => b.type)).toEqual(['view', 'view'])
    expect(reading.blocks[0]).toMatchObject({
      mode: 'chart',
      collectionId: db.id,
      chart: { xProperty: db.schema[0].id, series: [{ property: db.schema[1].id, agg: 'sum' }] },
    })
  })

  it('makes the table from a picture’s values when they are in the markup', () => {
    const reading = read(
      '<svg aria-label="weekly km"><rect data-label="w1" data-value="20"></rect><rect data-label="w2" data-value="24.5"></rect></svg>'
    )
    const db = reading.databases[0]
    expect(db.title).toBe('weekly km')
    expect(db.records.map((r) => Object.values(r.props))).toEqual([
      ['w1', 20],
      ['w2', 24.5],
    ])
    expect(reading.blocks).toEqual([
      expect.objectContaining({ type: 'view', mode: 'chart', collectionId: db.id }),
    ])
    expect(reading.found.charts).toBe(1)
  })

  it('lists a chart that is only a picture', () => {
    const reading = read(
      '<figure><canvas id="pace-chart"></canvas><figcaption>pace</figcaption></figure>'
    )
    expect(reading.blocks).toEqual([])
    expect(reading.leftOut.map((l) => l.name)).toEqual(['the chart, drawn as a picture'])
    expect(reading.found.charts).toBe(1)
  })
})

describe('left out', () => {
  it.each([
    ['<form><input name="email"><button>join</button></form>', 'a form'],
    ['<iframe src="https://www.youtube.com/embed/abc"></iframe>', 'the video'],
    ['<iframe src="https://widgets.example/app"></iframe>', 'an embedded app'],
    ['<object data="game.swf"></object>', 'an embedded app'],
    ['<canvas></canvas>', 'a picture drawn by a script'],
    ['<svg><circle r="4"></circle></svg>', 'a drawing'],
    ['<nav><a href="/">home</a></nav>', 'the site’s links'],
    ['<p style="color: red">red</p>', 'styling'],
    ['<script>1</script>', 'scripts'],
    ['<video src="run.mp4"></video>', 'the video'],
  ])('%s → %s', (body, name) => {
    const reading = read(body)
    expect(reading.leftOut.map((l) => l.name)).toContain(name)
    for (const part of reading.leftOut) expect(part.why).not.toBe('')
  })

  it('makes one entry per kind of part, counting them', () => {
    const reading = read('<form></form><form></form><canvas></canvas><canvas></canvas>')
    expect(reading.leftOut.map((l) => l.name)).toEqual(['2 pictures drawn by a script', '2 forms'])
  })

  it('keeps a header inside the page’s own content', () => {
    const reading = read('<article><header><h2>race report</h2></header><p>went well</p></article>')
    expect(contents(reading)).toEqual(['## race report', 'went well'])
    expect(reading.leftOut).toEqual([])
  })
})

describe('ids', () => {
  it('mints ids with the injected minter', () => {
    let n = 0
    const reading = read('<p>a</p><ul><li>b</li></ul>', { mintId: () => `id-${++n}` })
    expect(reading.blocks[0].id).toBe('id-1')
    const list = reading.blocks[1]
    expect(list.id).toBe('id-2')
    expect(list.type === 'todo' && list.items[0].id).toBe('id-3')
  })
})
