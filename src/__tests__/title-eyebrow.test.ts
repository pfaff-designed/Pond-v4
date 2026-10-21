import { isUntouchedPage, titleEyebrow } from '@/lib/pages/title-eyebrow'

const at = new Date(2026, 9, 5, 9, 4)

describe('titleEyebrow', () => {
  it('joins the kind and the state with an em dash', () => {
    expect(titleEyebrow('project', true, at)).toBe('project — saved 09:04')
  })

  it('zero-pads the clock to hh:mm', () => {
    expect(titleEyebrow('', true, new Date(2026, 9, 5, 0, 7))).toBe('saved 00:07')
  })

  it('says saving while a save is pending, whatever the last time was', () => {
    expect(titleEyebrow('project', false, at)).toBe('project — saving…')
  })

  it('reads a bare saved before any save this session', () => {
    expect(titleEyebrow(undefined, true, null)).toBe('saved')
  })

  it('shows only the state when the kind is missing, blank or not a string', () => {
    expect(titleEyebrow(undefined, true, at)).toBe('saved 09:04')
    expect(titleEyebrow('  ', true, at)).toBe('saved 09:04')
    expect(titleEyebrow(7, true, at)).toBe('saved 09:04')
  })

  it('draws new — in {parentTitle} for an untouched page with a parent', () => {
    expect(titleEyebrow('project', true, at, true, 'recipes')).toBe('new — in recipes')
  })

  it('draws a bare new for an untouched page with no parent', () => {
    expect(titleEyebrow('project', true, at, true, null)).toBe('new')
  })

  it('reads made hh:mm when a page was made from an answer and not yet edited this session', () => {
    const madeAt = new Date(2026, 9, 5, 7, 13)
    expect(titleEyebrow('page', true, null, false, null, madeAt)).toBe('page — made 07:13')
  })

  it('lets a this-session save win over madeAt', () => {
    const madeAt = new Date(2026, 9, 5, 7, 13)
    expect(titleEyebrow('page', true, at, false, null, madeAt)).toBe('page — saved 09:04')
  })

  it('reads offline — kept on this device when offline, kind prefixed as usual', () => {
    expect(titleEyebrow('project', true, at, false, null, null, true)).toBe('project — offline — kept on this device')
  })

  it('reads a bare offline state with no kind', () => {
    expect(titleEyebrow(undefined, true, at, false, null, null, true)).toBe('offline — kept on this device')
  })

  it('lets offline win over a pending save', () => {
    expect(titleEyebrow('project', false, null, false, null, null, true)).toBe('project — offline — kept on this device')
  })

  it('lets offline win over untouched', () => {
    expect(titleEyebrow('project', true, at, true, 'recipes', null, true)).toBe('project — offline — kept on this device')
  })

  it('lets offline win over madeAt', () => {
    const madeAt = new Date(2026, 9, 5, 7, 13)
    expect(titleEyebrow('page', true, null, false, null, madeAt, true)).toBe('page — offline — kept on this device')
  })

  it('reads not saved — retrying when retrying, kind prefixed as usual', () => {
    expect(titleEyebrow('project', false, null, false, null, null, false, true)).toBe(
      'project — not saved — retrying',
    )
  })

  it('reads a bare retrying state with no kind', () => {
    expect(titleEyebrow(undefined, false, null, false, null, null, false, true)).toBe('not saved — retrying')
  })

  it('lets retrying win over a pending save', () => {
    expect(titleEyebrow('project', false, at, false, null, null, false, true)).toBe(
      'project — not saved — retrying',
    )
  })

  it('lets retrying win over a landed save', () => {
    expect(titleEyebrow('project', true, at, false, null, null, false, true)).toBe(
      'project — not saved — retrying',
    )
  })

  it('lets offline win over retrying', () => {
    expect(titleEyebrow('project', false, null, false, null, null, true, true)).toBe(
      'project — offline — kept on this device',
    )
  })
})

describe('isUntouchedPage', () => {
  it('is true for an empty title and one empty text block', () => {
    expect(isUntouchedPage('', [{ type: 'text', content: '' }])).toBe(true)
  })

  it('is false once the title is non-empty', () => {
    expect(isUntouchedPage('notes', [{ type: 'text', content: '' }])).toBe(false)
  })

  it('is false once the block has content', () => {
    expect(isUntouchedPage('', [{ type: 'text', content: 'hi' }])).toBe(false)
  })

  it('is false with more than one block', () => {
    expect(
      isUntouchedPage('', [
        { type: 'text', content: '' },
        { type: 'text', content: '' },
      ]),
    ).toBe(false)
  })
})
