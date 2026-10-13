/**
 * The title row's eyebrow (`Pond 06.21` 6u.1): `{kind} — {state}`. The kind is the
 * page's own editable label, so a page without one shows the state alone; the state
 * is `saved hh:mm` once an autosave has landed this session, `saving…` while one is
 * pending, and a bare `saved` for a page opened and not yet edited. An untouched page
 * (board 6f frame 1) draws `new — in {parentTitle}` instead, or bare `new` with no
 * parent, until the person types anything.
 */

const clock = (at: Date): string =>
  `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`

/** Untouched: no title, and exactly one empty text block — the shape a fresh page is seeded with. */
export const isUntouchedPage = (title: string, blocks: Array<{ type: string; content?: string }>): boolean =>
  title.trim() === '' && blocks.length === 1 && blocks[0].type === 'text' && (blocks[0].content ?? '') === ''

export const titleEyebrow = (
  kind: unknown,
  saved: boolean,
  savedAt: Date | null,
  untouched?: boolean,
  parentTitle?: string | null,
): string => {
  if (untouched) return parentTitle ? `new — in ${parentTitle}` : 'new'
  const state = saved ? (savedAt ? `saved ${clock(savedAt)}` : 'saved') : 'saving…'
  const label = typeof kind === 'string' ? kind.trim() : ''
  return label ? `${label} — ${state}` : state
}
