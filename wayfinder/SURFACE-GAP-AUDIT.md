# Surface gap audit — the built spine vs `design_handoff_pond`

_Measured on `b49bd36`, 2026-10-01. Scope: the surfaces named as "not looking like the
designs" — Life page, rail, composer/chat, and floating chrome. **Reskin only**; anything
the design adds that has no code yet is listed under "Net-new, filed separately" and is
not part of this pass._

Every number below was read off the running app (computed styles, not source) or off the
design files. Nothing here is inferred.

---

## The finding that explains all of it: nothing was lifted off the paper

**Corrected 2026-10-01 — the first version of this audit got the cause wrong. See
"How this audit went wrong" below before trusting any older summary.**

`design_handoff_pond/PROJECT_RULES.md` §Design language is the bundle's top-priority
rule — its `README.md` §"Read these first" says PROJECT_RULES "**overrides anything in a
mockup that disagrees with it**" and tells you to copy it into your own `CLAUDE.md`:

> **Paper, not frames.** The wall and the modules are the **same paper (`#FAF9EF`)**,
> separated by shadow rather than by borders or a page frame. The rail, the breadcrumb
> and the composer are floating objects over the canvas.

`README.md` §Design tokens states it independently: "`#FAF9EF` paper: **the ground and the
cards** (one sheet, separated by shadow)."

So there is **one paper on light**, and what separates a module from the ground is
**shadow plus the 20px window inset** — never a colour step. Dark genuinely is two values
(ground `#1B1D14`, cards one ramp step up to `#30312A`), per the same rule. Light is one
paper, dark is two; that asymmetry is the design.

The app's flatness was therefore **geometry, not colour**. Measured live on `b49bd36`, the
rail was at `0,0 252×900` — flush to the top, left and bottom edges, with no shadow and no
radius. A card flush against three window edges shows nothing, so every surface read as one
sheet. The fix is the inset, the radius and the card shadow.

The §1c numbers and the `Pond 09` shell agree exactly:

```
rail  left:20 top:20 bottom:20 width:206  #FAF9EF  radius:20  + card shadow
main  left:246 right:20 top:20 bottom:20  padding:56 0 96  — no bg, no shadow, no radius
```

(§1c: "20 window inset · 56 page top · 96 clear of composer".)

### How this audit went wrong

The first version claimed the app was missing a `#EDECD8` wall, citing `Pond 01` §1a
("light wall #EDECD8 · card #FAF9EF"), and concluded `AGENTS.md` was "a lossy paraphrase"
that had to be corrected. All of that was wrong, and it is worth recording why:

- **`AGENTS.md` was right.** Its "same paper" line was a faithful port of PROJECT_RULES
  §Design language — exactly what the README instructs. It was deleted and its opposite
  implemented.
- **§1a and §1g are mockup files**, and PROJECT_RULES overrides them. `Pond 05 Shell`,
  which the README rates high-fidelity, uses `#EDECD8` **zero** times in 334KB.
- **`#EDECD8` is the Make Noise `.theme-press` ground**, not Pond's default — and
  `_ds/mn/tokens/themes.css` records its own source as "Pond-v4 src/app/globals.css (R6)",
  so citing it back as the spec is circular.
- **The "tell" was read backwards.** The first version argued that `AGENTS.md` getting the
  dark pair right proved light was a paraphrase. PROJECT_RULES gives that asymmetry
  deliberately.

**Root cause: the bundle's own precedence rule was never read.** `README.md` names
`PROJECT_RULES.md` and `AUDIT.md` as "read these first" and both were skipped in favour of
grepping the mockups. Read `README.md` → `PROJECT_RULES.md` → `AUDIT.md` before any further
surface work.

## Every surface the person named is transparent

Read live off `/workspace`:

| surface             | background      | shadow | blur | should be                       |
| ------------------- | --------------- | ------ | ---- | ------------------------------- |
| rail                | `rgba(0,0,0,0)` | none   | none | floating object over the canvas |
| main panel          | `rgba(0,0,0,0)` | none   | none | card paper, lifted              |
| composer / terminal | `rgba(0,0,0,0)` | none   | none | **glass** (§1px)                |
| breadcrumb          | `rgba(0,0,0,0)` | none   | none | **glass** (§1px)                |

Not "styled differently" — these have no surface treatment at all. They are invisible
divs on a flat wall, and they inherit whatever the wall happens to be.

---

## Glass is built, correct, and almost entirely unused

`.mn-glass` (`globals.css:625-638`) matches §1px exactly — `blur(24px) saturate(1.3)`, a
`1px rgba(255,255,255,0.8)` edge, `0 20px 54px rgba(40,34,24,0.14)`, the 84%→62% gradient.
Someone built it to spec.

§1px says who gets it:

> **glass** Floating chrome **only: breadcrumb, composer, palettes, menus.**

Live count of `.mn-glass` elements on `/workspace`: **2**, both the TopBar cluster
(`TopBar.tsx:56`). So of the five things entitled to glass, one has it. `CommandPalette`,
`SlashMenu`, `RelationValue` and the composer all use flat `bg-mn-surface shadow-mn-lg`.

**This also corrects a mistake made during #103's review.** A floating panel there carried
`border border-mn-line`; review flagged it as violating "paper, not frames" and the border
was removed. §1px is clear that floating chrome _does_ carry a 1px white edge — as part of
the glass recipe. The right fix was `.mn-glass`, not removing the edge. #134's picker
popover inherited the same wrong pattern. Both are small corrections, but the reasoning
matters: "no frames" is about modules on the wall, not about floating chrome.

---

## Cheap vs costly

**Cheap — token/role layer, no component surgery.** Do these first; several surfaces will
start looking right without being touched individually.

1. **Correct `AGENTS.md` §Design language** to §1a's two papers. Text only, and it unblocks
   correct judgement for every later item.
2. **Introduce a wall role** — wire `#edecd8` to `--mn-wall`, point `body`/the canvas at it,
   leave `--mn-card` on `#faf9ef`. Check the dark pair in §1a before assuming it mirrors.
3. **Apply `.mn-glass`** to the breadcrumb, composer, `CommandPalette`, `SlashMenu`, and the
   two popovers from #103/#134. The class already exists; this is swapping classes.
4. **Give the rail the §1c geometry** — the 20px window inset, radius 20 and the card
   shadow, which is what actually separates it from the paper. **The main panel stays
   bare:** §1g scopes card paper to "modules, rail, composer", §1c says "nothing frames the
   page", and the `Pond 09` shell's main region has no background, shadow or radius. Giving
   `DocumentPanel`'s column card paper would be a spec violation.

**Costly — structure, not style.** Each wants its own issue and its own review.

5. **Life page / `OverviewSurface`** — compare against `Pond 05 Shell` 5af/5ag and
   `09 examples`. Needs its own pass; the focal-numeral layout and the areas grid are
   structural, not a retint.
6. **Composer / `AITerminal`** — §1b's register split (machine surface stays mono) crosses
   the transcript, the proposal cards and the input. Largest single surface in the app.
7. **Proposal / diff cards** — their own entry on #114's checklist.
8. **Spacing audit** against §1c's scale (`4 8 12 16 24 32`, 20 window inset, 56 page top,
   96 clear of composer). Mechanical but wide; worth its own pass with a grep gate.

---

## Net-new, filed separately (NOT this pass)

The design specifies these and there is no code for them. They are features, not reskins:

- **The cover homepage** (`Pond 05` §5a) — ASCII pond drifting behind, one wordmark, one
  place to ask, "nothing else".
- **Pond-name header + switcher** — the other half of #96; "pond name is not surfaced today".
- **"Pond offers to start it" empty states** (§5af/5ag) — _"Nothing on this page yet. Add a
  block, or say what this page is for and I will lay it out"_, with `＋ checklist ＋ table
＋ note` affordances and a Pond update beneath.

---

## What this does NOT cover

- Dark mode. §1a gives a dark pair and §1g eight themes; the audit only measured light.
- `Pond 02 Component library` atom-by-atom (#93/#95). The named surfaces were the ask.
- Charts (#94) and the `press-*` → `color-*` migration (#92), both already on #114.

## Relationship to what is already filed

Nothing here is new work — it is **#114's unstarted checklist**, with evidence attached and
an order. `GAP-ANALYSIS.md` §02 already said "~70% structurally present, **100% needs
reskin**"; that remains true, and this audit says _which 100%_ and _in what order_. The MN
work that shipped (tokens, charts, glyph marks) never reached the surfaces.
