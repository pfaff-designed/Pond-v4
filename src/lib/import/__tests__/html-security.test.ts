/** @jest-environment node */
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachments/validate'
import { blockSchema } from '@/lib/modules/content'
import { readHtml, type HtmlReading } from '../html'

const read = (body: string): HtmlReading => {
  const result = readHtml(
    `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`
  )
  if (!result.ok) throw new Error(`expected a reading, got ${result.error.kind}`)
  for (const block of result.blocks) expect(blockSchema.safeParse(block).success).toBe(true)
  return result
}

const contents = (reading: HtmlReading) =>
  reading.blocks.flatMap((b) => (b.type === 'text' ? [b.content] : []))

const MEGABYTE = 1024 * 1024

const timed = (html: string): number => {
  const start = performance.now()
  readHtml(html)
  return performance.now() - start
}

describe('hostile input finishes in well under a second', () => {
  it('a megabyte of unclosed tags', () => {
    expect(timed('<a '.repeat(MEGABYTE / 3))).toBeLessThan(1000)
  })

  it('sixty-five thousand line breaks inside a mark', () => {
    const breaksHtml = (n: number) => `<p><b>a${'<br>'.repeat(n)}b</b></p>`
    const minTime = (n: number): number => {
      const html = breaksHtml(n)
      timed(html) // warm up the JIT before measuring
      return Math.min(timed(html), timed(html), timed(html), timed(html), timed(html))
    }
    const n = 16_384
    const base = minTime(n)
    const quadrupled = minTime(4 * n) // 65,536 — the case this test is named for
    // A linear parser's time roughly quadruples when the input does; a quadratic
    // one's roughly sixteen-tuples. 8 sits between the two, so a regression to
    // quadratic trips this without flaking on a slower or noisier CI runner.
    expect(quadrupled / base).toBeLessThan(8)
  })

  it('a megabyte of spaces inside preformatted text', () => {
    expect(timed(`<pre>a${' '.repeat(MEGABYTE)}b</pre>`)).toBeLessThan(1000)
  })

  it.each([
    ['open tags', '<div>'.repeat(100_000)],
    ['tags that only look self-closed', '<div/>'.repeat(100_000)],
    ['self-closed tags after leaving a drawing', `<svg><div>${'<path/>'.repeat(100_000)}`],
    ['self-closed tags inside a drawing’s html', `<svg><foreignObject>${'<x/>'.repeat(100_000)}`],
  ])('a hundred thousand nested %s, refused as unreadable before parsing', (_, html) => {
    expect(timed(html)).toBeLessThan(1000)
    expect(readHtml(html)).toEqual({ ok: false, error: { kind: 'unreadable' } })
  })
})

describe('nesting', () => {
  const nested = (depth: number, open: string, close: string) =>
    `${open.repeat(depth)}<p>deep</p>${close.repeat(depth)}`

  it('reads a file nested as deep as a real page goes', () => {
    expect(contents(read(nested(300, '<div>', '</div>')))).toEqual(['deep'])
  })

  it('counts neither closed tags nor tags allowed to close themselves', () => {
    const items = '<li>item'.repeat(5000)
    const paragraphs = '<p>words'.repeat(5000)
    const closed = '<div>x</div>'.repeat(5000)
    const script = `<script>${"'<div>'".repeat(5000)}</script>`
    const comment = `<!--${'<div>'.repeat(5000)}-->`
    const drawing = `<svg>${'<rect width="1"/>'.repeat(5000)}</svg>`
    const html = `<ul>${items}</ul>${paragraphs}${closed}${script}${comment}${drawing}`
    expect(readHtml(html).ok).toBe(true)
  })

  it('never throws on nesting the parser cannot walk: it is unreadable', () => {
    for (const shape of ['<ul><li>', '<table><tr><td>', '<b>']) {
      expect(() => readHtml(shape.repeat(999))).not.toThrow()
    }
  })
})

describe('text never turns into an image, html or a different mark', () => {
  it('keeps a `!` before a link from making it an image', () => {
    const [content] = contents(read('<p>Look!<a href="https://x.example/p.png">p</a></p>'))
    expect(content).toBe('Look\\![p](https://x.example/p.png)')
    expect(contents(read('<p><b>wow!</b><a href="https://x.example/p.png">p</a></p>'))).toEqual([
      '**wow\\!**[p](https://x.example/p.png)',
    ])
  })

  it('keeps an entity written as text from being decoded', () => {
    expect(contents(read('<p>write &amp;amp; or &amp;#60; — a &amp; b</p>'))).toEqual([
      'write \\&amp; or \\&#60; — a & b',
    ])
  })

  it('keeps a pipe from starting a table', () => {
    expect(contents(read('<p>a | b<br>--|--</p>'))).toEqual(['a \\| b\n--\\|--'])
  })

  it('keeps a line of dashes or equals from making a rule or a heading', () => {
    expect(contents(read('<p>---</p><p>Title<br>===</p><p>Title<br>- - -</p>'))).toEqual([
      '\\---',
      'Title\n\\===',
      'Title\n\\- - -',
    ])
  })

  it('keeps a lone number from starting a list', () => {
    expect(contents(read('<p>1.</p><p>2)</p>'))).toEqual(['1\\.', '2\\)'])
  })

  it('fences code longer than any run of backticks in it', () => {
    expect(contents(read('<p><code>a``b</code> <code>`x</code></p>'))).toEqual([
      '```a``b``` `` `x ``',
    ])
    expect(contents(read('<pre>````\nfence\n````</pre>'))).toEqual([
      '`````\n````\nfence\n````\n`````',
    ])
  })
})

describe('names written in the file', () => {
  it('reads a tag or role named like a built-in as any other', () => {
    const reading = read(
      '<div role="constructor"><p><constructor>plain</constructor> words</p></div><ul><li><a href="https://x.example/a">a</a></li></ul>'
    )
    expect(contents(reading)).toEqual(['plain words'])
    expect(reading.leftOut.map((l) => l.from)).toEqual([['list']])
  })
})

describe('images written into the file', () => {
  const dataImage = (bytes: number) =>
    `data:image/png;base64,${'A'.repeat(Math.ceil(bytes / 3) * 4)}`

  it('keeps one within the attachment limit', () => {
    const reading = read(`<img src="${dataImage(30)}" alt="dot">`)
    expect(reading.blocks).toEqual([
      expect.objectContaining({ type: 'image', mediaType: 'image/png', caption: 'dot' }),
    ])
  })

  it('lists one over the attachment limit instead of carrying it', () => {
    const reading = read(`<p>before</p><img src="${dataImage(MAX_ATTACHMENT_BYTES + 3)}">`)
    expect(reading.blocks.map((b) => b.type)).toEqual(['text'])
    expect(reading.leftOut).toEqual([
      { name: 'an image over 10 MB', why: 'pond keeps images up to 10 MB.', from: ['image'] },
    ])
  })
})
