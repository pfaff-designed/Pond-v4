/** @jest-environment node */
import { renderToString } from 'react-dom/server'
import type { TextBlock } from './schema'
import { TextView } from './view'
import { TextDiffer } from './differ'

const sample: TextBlock = {
  id: 'txt-1',
  type: 'text',
  content: '## Warm-up\n\nStart with **light cardio**, then reach for the `foam roller`.',
}

describe('a text block renders on the server, with no window and no editor', () => {
  it('there is no window here', () => {
    expect(typeof window).toBe('undefined')
  })

  it('read-only is the typeset document', () => {
    const html = renderToString(<TextView data={sample} />)
    expect(html).toContain('<h2>Warm-up</h2>')
    expect(html).toContain('<strong>light cardio</strong>')
    expect(html).toContain('<code>foam roller</code>')
    expect(html).not.toContain('contenteditable')
    expect(html).not.toMatch(/##|\*\*|`/)
  })

  it('an editable block arrives as its prose, not an empty box, until the editor loads', () => {
    const html = renderToString(<TextView data={sample} editable onChange={() => {}} />)
    expect(html).toContain('<h2>Warm-up</h2>')
    expect(html).toContain('<strong>light cardio</strong>')
    expect(html).not.toContain('contenteditable')
  })

  it('an empty editable block arrives with its placeholder line', () => {
    const html = renderToString(
      <TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />
    )
    expect(html).toContain('data-placeholder="write something"')
  })

  it('an empty heading arrives reading the heading atom’s `untitled`', () => {
    const html = renderToString(
      <TextView data={{ id: 't', type: 'text', content: '## ' }} editable onChange={() => {}} />
    )
    expect(html).toContain('<h2 class="is-empty is-editor-empty" data-placeholder="untitled">')
  })

  it('the diff card reads the block the same way', () => {
    const html = renderToString(
      <TextDiffer before={{ ...sample, content: 'milk\neggs' }} after={sample} />
    )
    expect(html).toContain('milk<br/>eggs')
    expect(html).toContain('<h2>Warm-up</h2>')
  })
})
