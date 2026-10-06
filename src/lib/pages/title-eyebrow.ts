/**
 * The title row's eyebrow (`Pond 06.21` 6u.1): `{kind} — {state}`. The kind is the
 * page's own editable label, so a page without one shows the state alone; the state
 * is `saved hh:mm` once an autosave has landed this session, `saving…` while one is
 * pending, and a bare `saved` for a page opened and not yet edited.
 */

const clock = (at: Date): string =>
  `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`

export const titleEyebrow = (kind: unknown, saved: boolean, savedAt: Date | null): string => {
  const state = saved ? (savedAt ? `saved ${clock(savedAt)}` : 'saved') : 'saving…'
  const label = typeof kind === 'string' ? kind.trim() : ''
  return label ? `${label} — ${state}` : state
}
