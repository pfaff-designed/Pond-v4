import type { CSSVars } from '@/lib/css-vars'

/**
 * The shell's overlay stacking order (KAN-553) — every floating overlay reads
 * its place here instead of picking its own z-index, which is how the undo
 * panel ended up hiding a toast raised while it was open. `undoPanel` is the
 * same "one above the nearest z-40" value `NewPondSheet` already uses for its
 * own sheet-over-backdrop pair; `toastStack` sits one above that so a toast is
 * never hidden under the panel.
 */
export const LAYER = {
  undoPanel: 41,
  toastStack: 42,
} as const

type LayerName = keyof typeof LAYER

const LAYER_VAR: Record<LayerName, `--z-${string}`> = {
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
export function layerVars(name: LayerName): CSSVars {
  return { [LAYER_VAR[name]]: String(LAYER[name]) }
}
