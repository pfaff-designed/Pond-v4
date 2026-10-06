import { titleEyebrow } from '@/lib/pages/title-eyebrow'

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
})
