/**
 * The header that ships inside the generated JSON, so the file explains itself to
 * whoever opens it without having to find this script first.
 */

export const README = {
  what: 'Design-handoff values, extracted from wayfinder/design_handoff_pond/. A CACHE, not a spec.',
  generated: 'GENERATED FILE — do not hand-edit. Any edit is overwritten on the next run.',
  regenerate: 'npm run board-values',
  sourceOfTruth:
    'The .dc.html boards remain the source of truth. When this file and a board disagree, THE BOARD WINS: regenerate, and take the board value.',
  guard:
    'src/__tests__/board-values.test.ts re-runs the extraction and fails if this file differs, so it cannot silently drift from the handoff.',
  whyNotABrowser:
    'Geometry comes from the inline `style` attribute, never from a computed layout — the handoff frames render under a CSS transform, so a measured rect lies about every number. Component values come from running each .dc.html logic class’s renderVals() with a stub base class: the style objects it returns ARE the spec.',
  howToRead: {
    components:
      'components[Name].base.vals is the full element inventory at every prop default — one entry per element the component can draw (`block`, `eyebrow`, `thead`, …), each a style object, plus the fixture text and the `isKind` flags that say which elements a kind actually renders.',
    variants:
      'components[Name].variants["kind=table|theme=ink"].delta is a DELTA against base.vals. It is a delta because renderVals returns every element’s style for every kind (the template picks with sc-if), so the resolved copies are ~98% identical — and the delta is the actual answer to "what makes this kind different".',
    states:
      'variants[…].states["hover"] is a delta against THAT VARIANT’s resolved vals (not against base). An empty object means the state changes nothing at this level, because the change lives in a child component the variant imports — e.g. PondBlock hover moves one row into PondMolecule state=hover, which is in that row’s own entry.',
    secondary:
      'variants[…].secondary["size=mobile"] is the same delta form, against the same variant, for the axes not crossed in full (size, level, color, role).',
    resolve:
      'resolved(variant) = deepMerge(base.vals, variant.delta). resolved(state) = deepMerge(resolved(variant), states[state]). Keys a delta omits are unchanged.',
    deltaConventions:
      'In a delta: `null` means the key is absent in that state, and { "__arrayPatch": { "1": … } } patches index 1 of a same-length array (other indices unchanged). A whole array is given verbatim when its length changed.',
    unsetProps:
      'unsetProps are props the extractor leaves unset on purpose, so each component’s own `p.x ?? "…"` fallback fires — that fallback is the designer’s fixture copy, which is more informative than the editor default (usually an empty string). Pass your own value for these.',
    boards:
      'boards[Name].frames[] carries the board’s own frame id (`2i`, `3a`, …), its data-screen-label, its caption prose (the rule that frame commits to), the frame root style, every <dc-import> usage — which is the board’s record of exactly which component variants it shows — and every styled element with its inline style and its own text.',
  },
  findingAValue:
    'jq \'.components.PondBlock.variants["kind=table|theme=ink"]\' wayfinder/board-values.generated.json — or just grep the variant key: the layout keeps each element\u2019s whole spec on one line, so one hit gives you all of its values.',
  units:
    'Values are verbatim. A bare number in a component style object is a React style number (px for lengths, unitless for fontWeight/lineHeight/opacity/flex); board values are raw CSS strings, so property names there are kebab-case. Nothing is rounded, snapped to a token, or reconciled with prose elsewhere — 13.5 means 13.5px.',
} as const

export const SKIPPED = {
  boards: [
    'Pond 00/01 and 04–09 (roadmap, design system, onboarding, shell, the 21 storyboards, edges, sources, examples) — outside M0. The board extractor is generic: add the file name to BOARDS in scripts/board-values/index.mts and regenerate.',
  ],
  values: [
    'PondChart’s `plot` is null. It is the pre-rendered SVG artwork from pond-charts.js (megabytes of path data), not a value to build from — read pond-charts.js directly if you need the geometry. Every other chart value (title, type, sub, reads, tooltip copy) is present.',
    'CSS inside the boards’ <style> blocks (the `dv-*` classes). That is the handoff doc viewer’s own annotation chrome, not product surface, and elements carrying those classes are excluded.',
    'Glyph artwork and font files under _ds/mn/. Read those from the bundle.',
    'Anything a component computes in componentDidMount rather than renderVals (PondChart/PondPicker/PondRail poll window.MNIcons / window.PondCharts there). renderVals never runs that path, and no value depends on it.',
  ],
} as const
