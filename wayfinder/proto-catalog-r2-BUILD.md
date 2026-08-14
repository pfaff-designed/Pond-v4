# R2 Build Instructions (read before building)

You are building throwaway **visual-language prototypes** for Pond, in the existing harness at
`src/app/proto/visual-language/`. Each prototype is one art-directed "world" rendering the SAME
Pond three-panel shell. Creative specs live in `wayfinder/proto-catalog-r2.md`. This file is the
**technical contract** — follow it exactly so all 42 worlds stay comparable.

## What you create
For each assigned catalog entry, create ONE file:
`src/app/proto/visual-language/variants/vNN-<slug>.tsx`
where `NN` is your assigned id (zero-padded) and `<slug>` is a kebab name (e.g. `v16-sumi-e.tsx`).

It must export:
```tsx
export const variant: Variant = {
  id: NN,
  name: 'Sumi-e Ink Garden',
  pov: 'one-line soul from the catalog',
  boldness: 9,               // these are all ×10-bold; use 7–10
  Component: View,           // your custom component (or () => <Shell theme={theme}/>)
}
```
`Variant` type: `import type { Variant } from '../types'`.

## HARD RULES (do not violate)
1. **Only create your assigned `vNN-*.tsx` files.** Do NOT edit `index.tsx`, `page.tsx`,
   `content.ts`, `Shell.tsx`, `types.ts`, `layout.tsx`, or `globals.css`. The registry is wired
   separately. (Editing shared files causes conflicts with other builders.)
2. First line of every file: `'use client'`.
3. **Use PATTERN B (custom `View()` component)** for anything with a living background, glass,
   custom shapes, or non-default layout — i.e. almost all R2 worlds. Only use Pattern A
   (`<Shell theme={theme}/>`) if a pure recolor genuinely captures the world.
4. **Animation = CSS only.** Put `@keyframes` in a `<style>{`...`}</style>` tag inside your JSX.
   No framer-motion, no JS timers. Living backgrounds = absolutely-positioned,
   `pointer-events-none`, blurred `<div>`s behind a `relative z-10` content container.
5. **Fonts:** use ONLY these CSS vars (already loaded, do not add fonts):
   `--proto-font-sans` (Inter) · `--proto-font-grotesk` (Space Grotesk) ·
   `--proto-font-serif` (Fraunces) · `--proto-font-mono` (JetBrains Mono) ·
   `--proto-font-display` (Instrument Serif). Pick what fits the world; e.g. serif worlds →
   Fraunces/Instrument Serif, technical → Space Grotesk/JetBrains.
6. **Inline styles** (`style={{...}}`) for variant-specific look; avoid Tailwind utility classes
   for colors/type so styles never leak. Layout flrefx classes are fine.
7. **Keep the information architecture identical** across all worlds (see next section). Only the
   *world* changes — same panels, same content, same controls. This is what makes them comparable.
8. Don't run `next dev` or `next build` (resource conflicts with other builders). Write carefully;
   compilation is verified centrally afterward.

## The shell you must render (same IA in every world)
Import shared content: `import { tree, openPage, transcript, diffCard, contextLabel, openNodeId } from '../content'`
(also `type TreeNode, Block, Message` if useful). Content is immutable — render it, don't invent data.

Three regions, left→right / top→bottom:
- **Sidebar (~264px, or your world's take):** the page tree. `tree` is `TreeNode[]` with
  `{ id, title, icon?, status?, children? }`. Render recursively (2 levels), highlight the node
  whose `id === openNodeId`, show a status dot when `status === 'active'`.
- **Editor (main, scrollable):** breadcrumb = `contextLabel` → `<h1>` = `openPage.title` →
  `openPage.blocks` where `block.type` ∈ `text` (paragraph), `todo` (checkbox list), `metric`
  (a stat chip). Constrain reading width (~640–720px) and center it.
- **AI terminal / steward (bottom, ~300px):** `contextLabel` → `transcript` (`Message[]`, each
  `{ role:'user'|'assistant', content }` as bubbles) → the **diff card** (`diffCard` has
  before/after/reason; render before→after with a reason line and **Accept / Edit / Reject**
  buttons) → an input row with a **Send** button. This panel is the app's soul — make the
  steward's presence *felt* in your world (glow, ink, lantern, ripple, ember, etc. per catalog).

Verify the exact field names by reading `content.ts` first (do not guess shapes).

## Before you write — read these (in this order)
1. `src/app/proto/visual-language/content.ts` — exact data shapes.
2. `src/app/proto/visual-language/types.ts` — the `Variant` interface.
3. `src/app/proto/visual-language/Shell.tsx` — the reference IA + `ShellTheme`.
4. `src/app/proto/visual-language/variants/v15-dreamscape.tsx` — the bold + animated-backdrop pattern (copy this structure).
5. `src/app/proto/visual-language/variants/v06-parchment.tsx` — a custom light/editorial `View()` example.
6. Root `AGENTS.md` — this is a modified Next.js; these are client components with inline styles
   (low risk), but if you touch any Next API, check `node_modules/next/dist/docs/`.

## Quality bar
- Each world must be **instantly distinguishable** from the others and from the R1 set — commit to
  the material (paper/glass/clay/water/light), the palette hexes in the catalog, and one bold move.
- Living backgrounds should be **calm** (slow, 12–30s loops, low contrast) — this app's north star
  is *zen*, not spectacle. Prefer `prefers-reduced-motion` fallbacks if cheap (optional).
- Real content legibility matters — it's a daily productivity app. Beautiful but readable.

## When done
Report back: the list of files you created, each as `id · name · one-line`, and flag anything you
couldn't render faithfully. Do not edit the registry.
