# HANDOFF — R2 visual-language prototypes (ticket-14)

**Status at handoff:** builder agents fanned out; Family C confirmed done. Registry NOT yet wired.
Context ran low mid-flight, so the finishing steps below are unstarted.

## Goal
Add 42 new art-directed "zen" prototypes (ids 16–57) to the existing harness at
`src/app/proto/visual-language/` (route `/proto/visual-language`, ←/→ to flip, `h` hides chrome).
They join the R1 set (1–15) → 57 total. North star = **zen**; both light & dark; many living
(CSS-`@keyframes`) backgrounds.

## Specs (source of truth)
- `wayfinder/proto-catalog-r2.md` — the 42 worlds (palette/type/material/steward/living-bg per id).
- `wayfinder/proto-catalog-r2-BUILD.md` — the technical contract builders followed.
- `wayfinder/design-exploration-r2-zen.md` — the writeup / rationale.

## Contract recap
Each prototype = `variants/vNN-<slug>.tsx` exporting `variant: Variant {id,name,pov,boldness,Component}`.
Custom `View()` components, `'use client'`, inline styles, shared content from `../content`
(`tree, openPage, transcript, diffCard, contextLabel, openNodeId`). Same 3-panel IA everywhere:
sidebar tree · editor (breadcrumb→h1→blocks) · AI terminal/steward (transcript→diff card
Accept/Edit/Reject→input+Send).

## ID → file map (expected)
A 16–21: v16-sumi-e, v17-letterpress, v18-shoji, v19-riso, v20-ukiyo-e, v21-washi
B 22–28: v22-clay, v23-karesansui, v24-celadon, v25-kintsugi, v26-concrete, v27-marble, v28-salt-flat
C 29–33: v29-pond-surface, v30-depths, v31-tidepool, v32-rain-on-glass, v33-koi  ✅ DONE
D 34–39: v34-dawn, v35-golden-hour, v36-moonlight, v37-aurora-borealis, v38-fog, v39-candlelight
E 40–44: v40-herbarium, v41-moss, v42-bamboo, v43-sand-dune, v44-bioluminescence
F 45–50: v45-liquid-glass-aurora, v46-dreamscape-nocturne, v47-aurora-frost, v48-prism, v49-onsen, v50-frosted-aurora-dark
G 51–57: v51-ma, v52-ember, v53-monospace-void, v54-grid-of-light, v55-particle-drift, v56-gradient-mesh, v57-neon-zen

## REMAINING STEPS (do these to finish)
1. **Verify files exist:** `ls src/app/proto/visual-language/variants/ | sort` — expect v16…v57
   (42 new). If any builder didn't finish, re-run just that family per the BUILD spec.
2. **Wire the registry** `variants/index.tsx`: add `import { variant as vNN } from './vNN-<slug>'`
   for 16–57 and append v16…v57 to the `variants` array (keep 1–15 first).
3. **Check `page.tsx` scales to N variants:** the earlier map noted a "15-dot pip strip" and
   number-jump `1–9`. Confirm the pip strip and jumps are derived from `variants.length`
   (map over the array), not hardcoded to 15. Fix if hardcoded. ←/→ cycling already wraps modulo length.
4. **Typecheck + build:** `npm run typecheck` then `npm run build`. Fix errors (most likely: a
   variant referencing a wrong content field, or a missing `'use client'`). This repo is a modified
   Next.js — see root `AGENTS.md`; bundled docs at `node_modules/next/dist/docs/`.
5. **Screenshot the new worlds** for review without a dev server: `npm run dev`, then use the
   Playwright MCP to visit `/proto/visual-language`, press `h` to hide chrome, and for each id press
   →/number keys and screenshot. Save to `wayfinder/screens/proto-16…57-<slug>.png`. (R1 screens
   used the same folder.) Batch-read them to give Charles a curated shortlist.
6. Report a shortlist. Predicted standouts (fuse Charles's 3 loves — earthy + curved-container +
   glass): **45 Liquid Glass–Aurora**, **18 Shoji**, **29 Pond Surface** (namesake), **37 Aurora
   Borealis**, **46 Dreamscape Nocturne**, **16 Sumi-e**.

## Notes
- Living effects use `backdrop-filter` + `mix-blend-mode` — great in Chromium/WebKit, degrade
  gracefully elsewhere (fine for throwaway).
- Don't resolve tokens here — that's ticket-15. Delete `src/app/proto/` once an aesthetic is chosen.
- Builder agent IDs (resumable via SendMessage if a family is incomplete):
  A a3635f31067c91309 · B a6610b55cb9441dc0 · C a72b5a8e2b0ffd263(done) · D a61c2f083e42ae14d ·
  E a11f532a836c5ea93 · F adb1490bbe9a76e8d · G a0adae931b7d225cf
