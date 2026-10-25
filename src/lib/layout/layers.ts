import type { CSSVars } from '@/lib/css-vars'

/**
 * The shell's overlay stacking order (KAN-553) — every floating overlay reads
 * its place here instead of picking its own z-index, which is how the undo
 * panel ended up hiding a toast raised while it was open. Each entry below is
 * derived from the one it must outrank, not a bare number, so "one above the
 * page-changes panel" stays true even if that panel's own layer ever moves.
 * `record-peek.tsx` sits at this same literal (40) but is out of this
 * ticket's `Owns:` and stays a literal.
 */
const pageChangesPanel = 40
const newPondBackdrop = pageChangesPanel
const newPondSheet = pageChangesPanel + 1
const undoPanel = pageChangesPanel + 1
const toastStack = undoPanel + 1

export const LAYER = {
  pageChangesPanel,
  newPondBackdrop,
  newPondSheet,
  undoPanel,
  toastStack,
} as const

// Only the layers whose component pairs a Tailwind `z-[var(--z-…)]` literal
// with this CSS var (UndoNotice/UndoToast) need an entry here — a component
// that reads `LAYER` with a plain `style={{ zIndex: LAYER.x }}` instead
// (PageChangesSection, NewPondSheet) has no var to look up.
type VarLayerName = 'undoPanel' | 'toastStack'

const LAYER_VAR: Record<VarLayerName, `--z-${string}`> = {
  undoPanel: '--z-undo-panel',
  toastStack: '--z-toast-stack',
}

/**
 * The CSS custom property for a layer, as a style object — spread onto the
 * element whose Tailwind class reads the matching `z-[var(--z-…)]` literal.
 * The class text has to stay a literal in the component (Tailwind's scanner
 * can't see a value built from a template string), so only the number moves
 * through this.
 */
export function layerVars(name: VarLayerName): CSSVars {
  return { [LAYER_VAR[name]]: String(LAYER[name]) }
}
