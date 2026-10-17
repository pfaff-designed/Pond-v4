import { useState } from 'react'
import { EditorView } from '@tiptap/pm/view'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HEADING_PREFIX } from '@/lib/modules/palette'
import { COMPOSER_CLEARANCE_VAR } from '@/lib/layout/composer-clearance'
import {
  findTextBlock as findField,
  textEditorOf as editorOf,
} from '@/__tests__/helpers/text-block'
import { moduleDataSchema } from '@/lib/modules/ai-composition'
import type { TextBlock } from './schema'
import { TextView } from './view'
import TextEditor from './editor'
import { StaticProse } from './static-prose'
import { TEXT_PROSE_CLASS } from './prose'

const sample: TextBlock = {
  id: 'txt-1',
  type: 'text',
  content: '## Warm-up\n\nStart with **light cardio**, then reach for the `foam roller`.',
}

/** Editor-only attributes; everything else must match between editor and render. */
const EDITOR_ATTRIBUTES = new Set([
  'class',
  'contenteditable',
  'translate',
  'role',
  'aria-label',
  'aria-multiline',
  'tabindex',
])

/** An element's children as tags, sorted attributes and text — order-insensitive markup. */
const canonical = (element: Element): string =>
  Array.from(element.childNodes, (child) => {
    if (!(child instanceof Element)) return child.textContent ?? ''
    const attributes = Array.from(child.attributes)
      .filter(({ name }) => !EDITOR_ATTRIBUTES.has(name))
      .map(({ name, value }) => `${name}="${value}"`)
      .sort()
    return `<${[child.tagName.toLowerCase(), ...attributes].join(' ')}>${canonical(child)}</>`
  }).join('')

/** Dispatches a text/plain-only paste, the shape a terminal or plain editor puts on the clipboard. */
const pastePlainText = (field: HTMLElement, text: string, options: { shiftKey?: boolean } = {}) => {
  if (options.shiftKey) fireEvent.keyDown(field, { key: 'v', shiftKey: true, metaKey: true })
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      types: ['text/plain'],
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  })
  fireEvent(field, event)
}

/** Dispatches a paste carrying both text/html and text/plain, the shape a browser puts on the clipboard. */
const pasteHtml = (field: HTMLElement, html: string, text: string) => {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      types: ['text/html', 'text/plain'],
      getData: (type: string) => (type === 'text/html' ? html : type === 'text/plain' ? text : ''),
    },
  })
  fireEvent(field, event)
}

/** A host that keeps the block's state, as the page does. */
const StatefulText = ({
  data,
  onChange,
}: {
  data: TextBlock
  onChange: (next: TextBlock) => void
}) => {
  const [state, setState] = useState(data)
  const handleChange = (next: TextBlock) => {
    setState(next)
    onChange(next)
  }
  return <TextView data={state} editable onChange={handleChange} />
}

describe('TextView — the text block edits in place as rendered prose', () => {
  it('shows no markdown syntax while writing: headings, bold and code are typeset', async () => {
    render(<TextView data={sample} editable onChange={() => {}} />)
    const field = await findField()
    expect(field).toHaveAttribute('contenteditable', 'true')
    expect(within(field).getByRole('heading', { level: 2, name: 'Warm-up' })).toBeInTheDocument()
    expect(within(field).getByText('light cardio').tagName).toBe('STRONG')
    expect(within(field).getByText('foam roller').tagName).toBe('CODE')
    expect(field.textContent).not.toMatch(/##|\*\*|`/)
  })

  it('lists, italic and links render as prose too', async () => {
    const data: TextBlock = {
      id: 't',
      type: 'text',
      content: '- *slow* stretch\n- see [the plans](https://example.com/plans)\n\n1. soak',
    }
    render(<TextView data={data} editable onChange={() => {}} />)
    const field = await findField()
    expect(field.querySelectorAll('ul > li')).toHaveLength(2)
    expect(field.querySelectorAll('ol > li')).toHaveLength(1)
    expect(within(field).getByText('slow').tagName).toBe('EM')
    const link = within(field).getByRole('link', { name: 'the plans' })
    expect(link).toHaveAttribute('href', 'https://example.com/plans')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(field.textContent).not.toMatch(/[*[\]()]/)
  })

  it('an editable block shows its prose at once, then becomes the editor in place', async () => {
    const { container } = render(<TextView data={sample} editable onChange={() => {}} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Warm-up' })).toBeInTheDocument()
    const before = container.textContent
    const field = await findField()
    expect(container.textContent).toBe(before)
    expect(within(field).getByRole('heading', { level: 2, name: 'Warm-up' })).toBeInTheDocument()
  })

  it('clicking a link in an editable block opens it in a new tab, with the opener severed', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null)
    render(
      <TextView
        data={{ id: 't', type: 'text', content: 'See [the plans](https://example.com/plans).' }}
        editable
        onChange={() => {}}
      />
    )
    const field = await findField()
    const link = within(field).getByRole('link', { name: 'the plans' })
    const { view } = editorOf(field)
    // jsdom has no hit-testing, so the click is handed to the editor the way its
    // mouseup does, rather than dispatched at a coordinate.
    const click = new MouseEvent('click', { button: 0 })
    Object.defineProperty(click, 'target', { value: link })
    const handled = view.someProp('handleClick', (handleClick) =>
      handleClick(view, view.posAtDOM(link, 0), click)
    )
    expect(handled).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('https://example.com/plans', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('a link the editor refused (its href blanked) opens nothing — not this page', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null)
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    const editor = editorOf(field)
    act(() => {
      editor.commands.setContent({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'run me',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
        ],
      })
    })
    const link = field.querySelector('a')!
    expect(link.getAttribute('href')).toBe('')
    const { view } = editor
    const click = new MouseEvent('click', { button: 0 })
    Object.defineProperty(click, 'target', { value: link })
    const handled = view.someProp('handleClick', (handleClick) =>
      handleClick(view, view.posAtDOM(link, 0), click)
    )
    expect(handled).toBeFalsy()
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('an edit writes the block back as markdown, changing only what was typed', async () => {
    const handleChange = jest.fn()
    render(<StatefulText data={sample} onChange={handleChange} />)
    const editor = editorOf(await findField())
    act(() => {
      editor.chain().focus('end').insertContent(' Go.').run()
    })
    expect(handleChange).toHaveBeenLastCalledWith({ ...sample, content: `${sample.content} Go.` })
  })

  it('a save re-rendering the page never resets the editor, so typing in flight is kept', async () => {
    const handleChange = jest.fn()
    render(
      <StatefulText
        data={{ id: 't', type: 'text', content: HEADING_PREFIX }}
        onChange={handleChange}
      />
    )
    const editor = editorOf(await findField())
    const setOptions = jest.spyOn(editor, 'setOptions')
    for (const letter of 'warm-up') {
      act(() => {
        editor.commands.insertContent(letter)
      })
    }
    expect(handleChange).toHaveBeenLastCalledWith({ id: 't', type: 'text', content: '## warm-up' })
    expect(setOptions).not.toHaveBeenCalled()
  })

  it('the page catching up a keystroke late never rewinds the editor', async () => {
    const handleChange = jest.fn()
    const at = (content: string): TextBlock => ({ id: 't', type: 'text', content })
    const { rerender } = render(
      <TextView data={at(HEADING_PREFIX)} editable onChange={handleChange} />
    )
    const editor = editorOf(await findField())
    act(() => {
      editor.commands.insertContent('w')
    })
    act(() => {
      editor.commands.insertContent('a')
    })
    rerender(<TextView data={at('## w')} editable onChange={handleChange} />)
    expect(editor.getText()).toBe('wa')
    rerender(<TextView data={at('## wa')} editable onChange={handleChange} />)
    expect(editor.getText()).toBe('wa')
    rerender(<TextView data={at('Rest **day**.')} editable onChange={handleChange} />)
    expect(editor.getText()).toBe('Rest day.')
    expect(handleChange).toHaveBeenCalledTimes(2)
  })

  it('with nowhere to send its writes, an outside value is never taken for one of them', async () => {
    const at = (content: string): TextBlock => ({ id: 't', type: 'text', content })
    const { rerender } = render(<TextView data={at('')} editable />)
    const editor = editorOf(await findField())
    act(() => {
      editor.commands.insertContent('a')
    })
    act(() => {
      editor.commands.insertContent('b')
    })
    rerender(<TextView data={at('a')} editable />)
    expect(editor.getText()).toBe('a')
  })

  it('opening a block never writes it — even content not in the serializer’s normal form', async () => {
    const handleChange = jest.fn()
    render(
      <TextView
        data={{ id: 't', type: 'text', content: '# Lasagna\nA _hearty_ classic.' }}
        editable
        onChange={handleChange}
      />
    )
    await findField()
    expect(handleChange).not.toHaveBeenCalled()
  })

  it('content changed from outside (an accepted diff) replaces the text without writing back', async () => {
    const handleChange = jest.fn()
    const { rerender } = render(<TextView data={sample} editable onChange={handleChange} />)
    const field = await findField()
    rerender(
      <TextView data={{ ...sample, content: 'Rest **day**.' }} editable onChange={handleChange} />
    )
    await waitFor(() => expect(field.textContent).toBe('Rest day.'))
    expect(within(field).getByText('day').tagName).toBe('STRONG')
    expect(handleChange).not.toHaveBeenCalled()
  })

  it('undo is the editor’s own inside the field: ⌘Z takes the typing back', async () => {
    const handleChange = jest.fn()
    render(<StatefulText data={sample} onChange={handleChange} />)
    const field = await findField()
    act(() => {
      editorOf(field).chain().focus('end').insertContent(' Go.').run()
    })
    expect(handleChange).toHaveBeenLastCalledWith({ ...sample, content: `${sample.content} Go.` })
    // jsdom reports no Mac platform, so the editor's Mod is Ctrl here.
    fireEvent.keyDown(field, { key: 'z', ctrlKey: true })
    expect(handleChange).toHaveBeenLastCalledWith(sample)
  })

  it('an empty block opens focused, with the prose atom’s placeholder', async () => {
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    await waitFor(() => expect(field).toHaveFocus())
    const line = field.querySelector('p')!
    expect(line).toHaveClass('is-editor-empty')
    expect(line).toHaveAttribute('data-placeholder', 'write something')
  })

  it('an empty block with its own placeholder draws that, not the generic line', async () => {
    const data: TextBlock = {
      id: 't',
      type: 'text',
      content: '',
      placeholder: 'anything, in any order',
    }
    const { container } = render(<TextView data={data} editable onChange={() => {}} />)
    const standIn = container.querySelector('p')!
    expect(standIn).toHaveAttribute('data-placeholder', 'anything, in any order')
    const field = await findField()
    await waitFor(() => expect(field).toHaveFocus())
    const line = field.querySelector('p')!
    expect(line).toHaveClass('is-editor-empty')
    expect(line).toHaveAttribute('data-placeholder', 'anything, in any order')
    const { id, ...withoutId } = data
    void id
    expect(moduleDataSchema.parse(withoutId)).toEqual(withoutId)
  })

  it('an empty heading reads `untitled`, the same before the editor loads and after', async () => {
    const { container } = render(
      <TextView data={{ id: 't', type: 'text', content: HEADING_PREFIX }} editable />
    )
    const standIn = container.querySelector('h2')!
    expect(standIn).toHaveClass('is-editor-empty')
    expect(standIn).toHaveAttribute('data-placeholder', 'untitled')
    const heading = (await findField()).querySelector('h2')!
    expect(heading).toHaveClass('is-editor-empty')
    expect(heading).toHaveAttribute('data-placeholder', 'untitled')
  })

  it('a press on the prose before the editor existed puts the caret there when it arrives', async () => {
    const posAtCoords = jest
      .spyOn(EditorView.prototype, 'posAtCoords')
      .mockReturnValue({ pos: 5, inside: -1 })
    const pressRef = { current: { left: 40, top: 60 } }
    render(<TextEditor data={sample} standIn={null} pressRef={pressRef} />)
    const field = await findField()
    await waitFor(() => expect(field).toHaveFocus())
    expect(posAtCoords).toHaveBeenCalledWith({ left: 40, top: 60 })
    expect(editorOf(field).state.selection.from).toBe(5)
    expect(pressRef.current).toBeNull()
    posAtCoords.mockRestore()
  })

  describe("the editor's scrollMargin (KAN-400)", () => {
    let shell: HTMLElement | null = null

    afterEach(() => {
      shell?.remove()
      shell = null
    })

    it("keeps reading the composer's live published footprint, not the one at mount", async () => {
      shell = document.createElement('div')
      shell.setAttribute('data-part', 'shell')
      shell.style.setProperty(COMPOSER_CLEARANCE_VAR, '125px')
      document.body.appendChild(shell)
      render(<TextEditor data={sample} standIn={null} pressRef={{ current: null }} />)
      const { view } = editorOf(await findField())

      shell.style.setProperty(COMPOSER_CLEARANCE_VAR, '416px')

      expect(view.someProp('scrollMargin')).toEqual({ top: 72, bottom: 440, left: 0, right: 0 })
    })
  })

  it('the stand-in records where it was pressed', () => {
    const handleMouseDown = jest.fn()
    const { container } = render(
      <StaticProse content={sample.content} showPlaceholder onMouseDown={handleMouseDown} />
    )
    fireEvent.mouseDown(container.querySelector('p')!, { clientX: 40, clientY: 60 })
    expect(handleMouseDown).toHaveBeenCalledWith(
      expect.objectContaining({ clientX: 40, clientY: 60 })
    )
  })

  it('a minted heading opens focused on an empty heading, and typing fills it', async () => {
    const handleChange = jest.fn()
    render(
      <StatefulText
        data={{ id: 't', type: 'text', content: HEADING_PREFIX }}
        onChange={handleChange}
      />
    )
    const field = await findField()
    await waitFor(() => expect(field).toHaveFocus())
    expect(field.firstElementChild?.tagName).toBe('H2')
    expect(field.textContent).toBe('')
    act(() => {
      editorOf(field).commands.insertContent('warm-up')
    })
    expect(handleChange).toHaveBeenLastCalledWith({ id: 't', type: 'text', content: '## warm-up' })
  })

  it('a written block does not take focus on its own', async () => {
    render(<TextView data={sample} editable onChange={() => {}} />)
    const field = await findField()
    expect(field).not.toHaveFocus()
  })

  it('Escape leaves the field', async () => {
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    await waitFor(() => expect(field).toHaveFocus())
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(field).not.toHaveFocus()
  })

  it('read-only is the same typeset document, drawn at once with no editor, in the same type', () => {
    const { container } = render(<TextView data={sample} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Warm-up' })).toBeInTheDocument()
    expect(screen.getByText('light cardio').tagName).toBe('STRONG')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(container.querySelector('[contenteditable]')).toBeNull()
    expect(container.querySelector('[data-text-prose]')?.className).toBe(TEXT_PROSE_CLASS)
    expect(container.textContent).not.toMatch(/##|\*\*/)
  })

  it('the editor and the read-only render draw the same document', async () => {
    const content =
      '## Warm-up\n\n- **light** cardio\n- see [plans](https://example.com)\n\nmilk\neggs'
    const read = render(<TextView data={{ id: 'r', type: 'text', content }} />)
    const readDocument = canonical(read.container.querySelector('[data-text-prose]')!)
    read.unmount()
    render(<TextView data={{ id: 'e', type: 'text', content }} editable onChange={() => {}} />)
    expect(canonical(await findField())).toBe(readDocument)
  })

  it('the editor carries the board’s prose register: serif 200, 17.5 / 1.6, full ink', async () => {
    render(<TextView data={sample} editable onChange={() => {}} />)
    const tokens = (await findField()).className.split(' ')
    for (const token of [
      'font-serif',
      'font-extralight',
      'text-[17.5px]',
      'leading-[1.6]',
      'text-mn-text',
    ]) {
      expect(tokens).toContain(token)
    }
    expect(tokens).not.toContain('font-normal')
  })

  it('a divider is the atom’s rule: ink .09 in both themes, 12px above and below; a code block has its own padding', () => {
    const tokens = TEXT_PROSE_CLASS.split(' ')
    for (const token of [
      '[&_hr]:border-mn-text/9',
      '[&_hr]:my-3',
      '[&_hr+*]:mt-0',
      '[&_pre]:px-3.5',
      '[&_pre]:py-3',
    ]) {
      expect(tokens).toContain(token)
    }
    expect(TEXT_PROSE_CLASS).not.toMatch(/border-mn-line/)
  })

  it('a text/plain-only markdown paste arrives typeset in the same block', async () => {
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    pastePlainText(field, '# Title\n\n- one\n- two\n\n**bold**')
    expect(within(field).getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
    expect(field.querySelectorAll('ul > li')).toHaveLength(2)
    expect(within(field).getByText('bold').tagName).toBe('STRONG')
    expect(field.textContent).not.toMatch(/#|\*\*/)
  })

  it('a text/plain-only paste that does not look like markdown still inserts literally', async () => {
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    const prose = 'just some plain notes, nothing special here'
    pastePlainText(field, prose)
    expect(field.textContent).toBe(prose)
    expect(field.querySelector('h1,h2,h3,strong,em,ul,ol')).toBeNull()
  })

  it('⌘⇧V/Ctrl+Shift+V pastes the same markdown clipboard literally', async () => {
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    pastePlainText(field, '# Title\n\n**bold**', { shiftKey: true })
    expect(field.textContent).toBe('# Title**bold**')
    expect(field.querySelector('h1,strong')).toBeNull()
  })

  it('a text/plain-only paste of a bare URL still links (not markdown, so Link keeps its own paste rule)', async () => {
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    pastePlainText(field, 'see https://example.com now')
    expect(within(field).getByRole('link', { name: 'https://example.com' })).toHaveAttribute(
      'href',
      'https://example.com'
    )
  })

  it('a markdown paste keeps a link target that differs from its visible text', async () => {
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    pastePlainText(field, '**b** [https://b.com](https://a.com/x)')
    const link = within(field).getByRole('link', { name: 'https://b.com' })
    expect(link).toHaveAttribute('href', 'https://a.com/x')
  })

  it('a wrapper-only text/html paste (matching text/plain) parses as markdown', async () => {
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    const text = '# Title\n\n**bold**'
    pasteHtml(field, `<pre>${text}</pre>`, text)
    expect(within(field).getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
    expect(within(field).getByText('bold').tagName).toBe('STRONG')
    expect(field.textContent).not.toMatch(/#|\*\*/)
  })

  it('a structured text/html paste (list markup) is left to the default HTML paste', async () => {
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    pasteHtml(field, '<ul><li>one</li><li>two</li></ul>', '# IGNORE ME')
    expect(field.querySelectorAll('ul > li')).toHaveLength(2)
    expect(field.textContent).not.toContain('IGNORE ME')
    expect(field.querySelector('h1')).toBeNull()
  })

  it('a markdown paste at the end of a list item lands its heading as its own block, not merged into the item', async () => {
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    const editor = editorOf(field)
    act(() => {
      editor.commands.setContent({
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }],
              },
            ],
          },
        ],
      })
      editor.commands.focus('end')
    })
    pastePlainText(field, '## Twice\n- one')
    expect(within(field).getByRole('heading', { level: 2, name: 'Twice' })).toBeInTheDocument()
    expect(field.querySelectorAll('ul > li')[1]).toHaveTextContent('two')
  })

  it('a markdown block paste mid-paragraph splits it, leaving the tail as its own paragraph', async () => {
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    const editor = editorOf(field)
    act(() => {
      editor.commands.setContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'foobar' }] }],
      })
      editor.commands.setTextSelection(4)
    })
    pastePlainText(field, '# H')
    expect(within(field).getByRole('heading', { level: 1, name: 'H' })).toBeInTheDocument()
    const paragraphs = Array.from(field.querySelectorAll('p')).map((p) => p.textContent)
    expect(paragraphs).toContain('foo')
    expect(paragraphs).toContain('bar')
  })

  it('a markdown block paste at the start of a paragraph leaves that paragraph intact after it', async () => {
    render(<TextView data={{ id: 't', type: 'text', content: '' }} editable onChange={() => {}} />)
    const field = await findField()
    const editor = editorOf(field)
    act(() => {
      editor.commands.setContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bar' }] }],
      })
      editor.commands.setTextSelection(1)
    })
    pastePlainText(field, '# H')
    expect(within(field).getByRole('heading', { level: 1, name: 'H' })).toBeInTheDocument()
    expect(within(field).getByText('bar').tagName).toBe('P')
  })

  it('a full markdown document pastes typeset in one block, one ⌘Z undoes it, and typing still formats', async () => {
    const handleChange = jest.fn()
    render(<StatefulText data={{ id: 't', type: 'text', content: '' }} onChange={handleChange} />)
    const field = await findField()
    const document = [
      '# Title',
      '',
      '- one',
      '- two',
      '',
      '**bold**',
      '',
      '> a quote',
      '',
      '```',
      'const x = 1',
      '```',
      '',
      '[a link](https://example.com)',
    ].join('\n')
    pastePlainText(field, document)
    expect(within(field).getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
    expect(field.querySelectorAll('ul > li')).toHaveLength(2)
    expect(within(field).getByText('bold').tagName).toBe('STRONG')
    expect(field.querySelector('blockquote')?.textContent).toBe('a quote')
    expect(field.querySelector('pre code')?.textContent).toBe('const x = 1')
    expect(within(field).getByRole('link', { name: 'a link' })).toHaveAttribute(
      'href',
      'https://example.com'
    )

    // jsdom reports no Mac platform, so the editor's Mod is Ctrl here.
    fireEvent.keyDown(field, { key: 'z', ctrlKey: true })
    expect(handleChange).toHaveBeenLastCalledWith({ id: 't', type: 'text', content: '' })

    // jsdom's contenteditable never actually edits the DOM, so typing a rule's
    // trigger is simulated the same way a real keystroke reaches it: ProseMirror's
    // own `handleTextInput` prop, the one path a real browser's input event drives.
    const editor = editorOf(field)
    const typeOnAFreshLine = (text: string) => {
      act(() => {
        editor.commands.clearContent()
        editor.commands.focus('end')
      })
      const { view } = editor
      const { from, to } = view.state.selection
      act(() => {
        view.someProp('handleTextInput', (fire) =>
          fire(view, from, to, text, () => view.state.tr)
        )
      })
    }
    typeOnAFreshLine('# ')
    expect(field.querySelector('h1')).toBeInTheDocument()
    typeOnAFreshLine('- ')
    expect(field.querySelector('ul')).toBeInTheDocument()
    typeOnAFreshLine('1. ')
    expect(field.querySelector('ol')).toBeInTheDocument()
    typeOnAFreshLine('> ')
    expect(field.querySelector('blockquote')).toBeInTheDocument()
    typeOnAFreshLine('``` ')
    expect(field.querySelector('pre')).toBeInTheDocument()
    typeOnAFreshLine('**x**')
    expect(within(field).getByText('x').tagName).toBe('STRONG')
  })
})
