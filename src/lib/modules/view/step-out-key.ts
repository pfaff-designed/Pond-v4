// The one home for which keys step out of the last cell (KAN-344/350):
// unmodified Enter or ArrowDown. `handleCellKeyDown` (view.tsx) and the value
// editors' triggers (AtomEditor.tsx, TagValueEditor.tsx) all read this, so a
// future third key is guarded everywhere at once.
export function isStepOutKey(e: {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}) {
  return (e.key === 'Enter' || e.key === 'ArrowDown') && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
}
