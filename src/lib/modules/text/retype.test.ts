import { retypeText, textKindOf, type TextKind } from './retype'

describe('textKindOf', () => {
  it.each<[string, TextKind]>([
    ['hello', 'text'],
    ['# hello', 'heading1'],
    ['## hello', 'heading2'],
    ['### hello', 'heading3'],
    ['> hello', 'quote'],
    ['```\nhello\n```', 'code'],
  ])('reads %j as %s', (content, kind) => {
    expect(textKindOf(content)).toBe(kind)
  })

  it.each([
    ['', 'empty'],
    ['- a\n- b', 'a list'],
    ['a\n\nb', 'two paragraphs'],
    ['#### too small a heading', 'a heading past level 3'],
  ])('is null for %j (%s)', (content) => {
    expect(textKindOf(content)).toBeNull()
  })
})

describe('retypeText', () => {
  it.each<TextKind>(['heading1', 'heading2', 'heading3', 'quote', 'code'])(
    'turns a line into %s and back to text',
    (kind) => {
      const retyped = retypeText('hello', kind)
      expect(textKindOf(retyped)).toBe(kind)
      expect(retypeText(retyped, 'text')).toBe('hello')
    }
  )

  it('keeps inline marks turning into a heading', () => {
    expect(retypeText('**hello**', 'heading1')).toBe('# **hello**')
  })

  it('keeps inline marks turning into a quote', () => {
    expect(retypeText('**hello**', 'quote')).toBe('> **hello**')
  })

  it('takes a code block as plain text, marks dropped, fenced by the serializer', () => {
    const code = retypeText('**hello**', 'code')
    expect(code).toBe('```\nhello\n```')
    expect(retypeText(code, 'code')).toBe(code)
  })

  it('turns a heading into another level', () => {
    expect(retypeText('# hello', 'heading2')).toBe('## hello')
    expect(retypeText('## hello', 'heading3')).toBe('### hello')
    expect(retypeText('### hello', 'heading1')).toBe('# hello')
  })
})
