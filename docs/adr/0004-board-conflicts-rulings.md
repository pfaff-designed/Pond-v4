# ADR 0004 — Rulings on board-vs-board conflicts and two places the handoff contradicts its own law

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** the agent, under the autonomy granted in ADR 0003
- **Related:** ADR 0003 (and its 2026-10-01 type amendment), `AGENTS.md` § THE DESIGN IS THE SOURCE OF TRUTH

## Context

A full conformance audit of the nine child DCs against the code found the component layer **bimodal and chronological**: everything built since the handoff landed conforms closely, everything built before it diverges structurally. Rebuilding the divergent half is the plan.

The audit also found **six conflicts that no amount of measurement resolves**, because the handoff disagrees with itself or with its own stated law. Every rebuild would hit all six and land somewhere different. They are ruled here, once.

## The rulings

### 1. Composer answer prose — **13.5px / 1.55**

`PondComposer.dc.html` says `15 / 1.6`; `Pond 06.01` renders `13.5 / 1.55`; the handoff README says _"Composer answers are 13.5px / 1.55."_ Two independent sources against one. **13.5 / 1.55.**

### 2. The `pond` eyebrow over an answer — **mono**

`PondComposer.dc.html` sets it in sans. But measuring `Pond 06.01` directly gives **PP Neue Montreal Mono**, and `PROJECT_RULES.md` § Design language puts the composer squarely in the machine surface, which is mono. Measurement plus law against one board. **Mono** — `machineEyebrowClass`, as `atoms/kicker.ts` already has it.

### 3. Composer width — **534px**

`PondComposer.dc.html` says 560; the `Pond 05 Shell` frame says 534. Same shape as the rail-header decision already recorded in ADR 0002/0003: **the composed context outranks the isolated component card**, because the Shell is unanimous across its frames and is what a person actually sees. **534.**

### 4. ⌘K palette rows — **sans rows, mono chrome** (follow the board)

`PROJECT_RULES.md` names the command palette as a machine surface, which reads as "all mono". The board is finer-grained: palette **chrome** (group labels, hint keys, the foot legend, the scope chip) is mono; palette **rows** — which are page names — are **sans 13.5 at full ink**.

The board is the more specific statement and it is also the more coherent rule: the medium split is about _what the text is_, not which surface it appears on. A page's name is page content quoted inside a machine surface. It stays sans.

### 5. The big figure on a data page — **52px / 700, as drawn**

`PondTemplate.dc.html`'s `number` block is 52px at weight 700 (44 mobile), which is off the README's UI scale and off the sans weights the rules name. Per ADR 0003's 2026-10-01 amendment, **a value written in a board is final** and the README's scale is a default for cases no board covers. Build it at 52/700. It is the biggest figure in the handoff and `PROJECT_RULES.md` explicitly wants data pages to lead with one oversized figure.

### 6. `PondRail`'s sage row hover — **rejected; keep ink 5%**

`PondRail.dc.html` paints the row hover `rgba(100,143,123,.07)` light / `.14` dark — **sage as a row background**. `PROJECT_RULES.md` is unambiguous: area colours apply **to marks only** — the area glyph and page kind dots — "never text, grounds, cards or buttons."

This is the one case where a board loses, because the conflict is with **product law**, not with another value. `AGENTS.md`'s source order puts `PROJECT_RULES.md` above the mockups for roles and colour jobs. The code's existing `bg-mn-text/5` is the compliant reading. **Do not patch the rail toward the board here.**

## The principle these share

A board wins on **values**. `PROJECT_RULES.md` wins on **roles and law** — what a colour's job is, which register a medium takes, what the product calls a thing. When two boards disagree on a value, prefer the one corroborated by a second source, and prefer the composed context over the isolated component card.

This is the inverse of the mistake in ADR 0003's original type ruling, where prose was applied over measured values. Prose governs roles; boards govern values.

## Consequences

- The rebuilds of PondPicker, the chart card and PondTemplate, and the patches to PondRail and PondComposer, all start from settled ground.
- One board instruction is deliberately not implemented (#6) and that is recorded here so it is not "fixed" later by someone measuring the board and finding the code wrong.

---

## Amendment, 2026-10-02 — rulings 7, 8 and 9, plus the principle that decides this whole family

The six rulings above were made in one sitting from one audit. Three more have been made since, during M0's
block-layer slices, and they had been recorded **only in code comments** — which is the thing this ADR exists
to prevent. Its stated purpose is that _"one board instruction is deliberately not implemented and that is
recorded here so it is not 'fixed' later by someone measuring the board and finding the code wrong."_ A comment
in one file does not do that job.

### The principle first, because 8 and 9 both fall out of it: the level ladder

`Pond 02 Component library` states its own hierarchy, and it resolves most board-vs-board conflicts in the
component layer:

| level | component      | the board's words                                          |
| ----- | -------------- | ---------------------------------------------------------- |
| 2     | `PondMolecule` | "atoms composed into items: rows, cards, entries"          |
| 3     | `PondBlock`    | "molecules composed into **the blocks a page is made of**" |
| 4     | `PondTemplate` | "**blocks arranged into a page** with placeholders"        |

**A level-4 layout composes level-3 blocks; it does not redefine them.** The board proves this itself:
`PondTemplate.dc.html`'s `kanban` case **imports** `PondMolecule kind="task-card"` rather than redrawing it.
Where it draws a row inline instead, that is shorthand for the composed block at the layout's own tighter
scale — not a competing specification.

So, stated as narrowly as the measurements support:

> Where a block's rows exist as a `PondMolecule` kind **and** the molecule can express every case the twelve
> templates need, the block renders **the molecule**. Where the molecule **cannot** express a case the
> templates need, `PondTemplate`'s inline row is the specification for that block.

This is why the template's card padding (`14px 16px` / `gap 10`) and `PondBlock`'s (`16px 18px` / `gap 12`)
are **both final and not reconciled**, and the same for the template's block head (`gap 10`) against
`PondBlock`'s (`gap 12`).

### 7. The error `notice`'s 440px hint-size inside a 400px card — **clamp it** (`max-w-full`)

`PondBlock.dc.html` gives the error state's `notice` a fixed **440px** hint-size inside cards as narrow as
**400** — a 76px overflow.

**Evidence:** every _other_ hint-size in that board is fitted to its host content box — list rows 360 in a 400
card, table rows 460 in a 500, log entries 420 in a 460, record-cards 170. The notice's 440 is its own
intrinsic width restated from `PondMolecule.dc.html` and is the one value pasted in unreconciled. The `W` map
does not widen on `error`, so the card cannot grow, and a card whose content overflows its edge contradicts the
paper-and-shadow language. `table` and `gallery`, being wider, still get the full 440.

Shipped in #238.

### 8. `PondMolecule kind="entry"` is **not** the `entries` block's row

The molecule exists, and `PondBlock.dc.html`'s `log` card imports it at a 420px hint-size — so the reflex is to
build the `entries` block on it.

**Evidence that it cannot be:** the molecule is **always serif 16.5 / 1.6 at a fixed 420px width**, while
`PondTemplate.dc.html`'s `entries` row is **conditional** — serif `200 / 16 / 1.55` when the kind sets
`serif: 1` (the journal), else sans `13.5 / 1.5` (the project's `updates`). A block built on the molecule
**cannot render `project › updates` at all**, which would fail ADR 0005's falsifiable check on the very slice
meant to satisfy it. Its fixed 420 is also wrong inside a 460 card, per ruling 7.

So `entries` follows `PondTemplate` — the only board covering both the serif and the sans case, and therefore
the only one that can be internally consistent. **The molecule is untouched and is not a duplicate to delete:**
a board describes it and the `log` demo card imports it.

**The cost, accepted and recorded:** `entries` renders journal prose at serif 16 / 1.55 while
`PondMolecule entry` renders 16.5 / 1.6 — two registers for the same kind of content. Shipped in #250.

### 9. A row's meta column is `PondAtom kind="date"` — **sans 13.5 at full ink**, not mono 10.5

This one is recorded because **the orchestrator got it wrong first** and a builder caught it by measuring.

The claim was that `PondMolecule`'s `cellMeta` and `PondAtom kind="date"` are the same register, mono `10.5` at
ink `.68`. They are not. From `PondAtom.dc.html`'s `renderVals()`: `date` is not a chip
(`isChip = kind === 'relation' || kind === 'tag'`), is not numeric
(`['number','money','percent','duration','time']`), and the per-kind `T` table has **no `date` entry** — so it
falls through to the base `text` style: **sans, `fs` = 13.5 desktop, weight 400, `color: fg` (full ink)**,
nowrap, tabular-nums, plus an orange `#D96629` dot when `due`. `cellMeta` appears **nowhere** in
`PondMolecule.dc.html`; it is an invention of `PondMolecule.tsx` for `table-row`, `entry` and `record-card`.

**Ruling: `list-row`'s meta is the atom**, and a `check-row`'s meta — which `PondMolecule.dc.html` does not draw
at all — takes the same atom.

**Evidence:** `PondMolecule.dc.html`'s `list-row` markup _explicitly imports_ it and passes `due` into it, so
the atom **is** what the composed board draws. And the due dot is semantic work a mono span cannot express,
which is _why_ the board composes an atom rather than writing a span. `PondTemplate`'s mono-10.5 `bStyle` is the
level-4 rendering and stays unreconciled, per the principle above. Four other molecules agreeing with each
other on mono 10.5 is not evidence about a fifth row type.

Shipped in #219.

## The failure mode these three share, and the one rule that catches it

Rulings 8 and 9 were both nearly decided the wrong way, and in both cases the thing that settled it was
**reading the board's markup to see what it composes**, not reading a sibling's values and generalising.
Ruling 9 in particular is the **fourth** instance of the pattern ADR 0003's third amendment names — _a
plausible generalisation, written from partial reading, applied across call sites, condemning values that were
already correct_ — and the second instance where the author of the wrong rule was the orchestrator rather than
a builder.

**So, for anyone resolving the next one of these:** before ruling that a component's value is wrong, open the
`.dc.html` and read what that component's own frame **composes**. A `dc-import` is the board telling you which
part owns the value, and it outranks any number of siblings that happen to agree with each other.

And ADR 0003's rule continues to hold without exception: **when a builder reports that a stated rule
contradicts a board, believe the board.** It has now been right five times out of five, including twice
against the orchestrator.

---

## Ruling 10, 2026-10-02 — what selects a heat cell's full ink, and the divergence it leaves

### The conflict

`PondTemplate.dc.html` draws the compact `heat` grid's 84 cells at three levels:

```js
const on = filled && (i > 71 || (i * 37) % 11 > 3)
background: on ? (i > 71 ? fg : a(0.45)) : a(0.07)
```

The grid is **`grid-auto-flow: column`** over 12 columns × 7 rows, so cells 0–6 are column 0, 7–13 column 1, and
so on. **`i > 71` is cells 72–83 — column 11 plus the last five cells of column 10.** It straddles two columns,
which is not a calendar unit of anything, and paired with `on`'s pseudo-random term it makes all twelve of those
cells full ink _regardless of the data_. It is fixture noise of the same kind as `(i * 37) % 11 > 3`.

So the literal cannot ship, and ADR 0005's `heat` bullet records only the three **levels** — never what selects
the top one. That inference is what this ruling fixes in place.

### The ruling

**Full ink marks the current period; the mark's geometry carries the value.**

For `heat`: an active day in the **current week's column** is full ink, an active day earlier is `ink .45`, an
inactive day is `ink .07`. Seven cells, a clean unit in a column-major week grid.

### Why, and it is the sibling that decides it

The obvious alternative is intensity — a heatmap conventionally colours by value, `heatmap-data.ts`'s
`HeatmapCell` carries a `value`, and the Bklit **card** feeds `count` to `HeatmapCells`. I was about to rule
that way. **The board's other compact mark settles it the other way:**

```js
// bars
background: i === v.length - 1 ? fg : a(0.28)
```

**The last bar is full ink** — recency — while the bar's **height** carries the value. So within this family the
board's own convention is: geometry encodes the value, full ink marks the current period. `heat` has no height
to spend, so its value becomes on/off and recency takes the ink. Internal consistency with the board's sibling
mark is stronger evidence than a convention imported from outside the handoff.

### The consequence, recorded rather than treated as a defect

**The Bklit heatmap card colours by intensity, so the same view reads differently when a person toggles
`Show: Card ↔ Compact`.** That is a genuine divergence and it is deliberate for now, because the card's scale
comes from **Bklit**, not from any handoff value — no board specifies it. If the handoff ever does, the two
should converge, and that is **#227**'s territory (the chart card's chrome and states), not the compact mark's.

### A precision correction to ADR 0007 while this is open

#259's body states that ADR 0007 is "wrong" to call `heat` _"a new `view` mode"_. That is overstated: ADR 0007's
own text reads **"a new `view` mode (or chart kind)"**, so the shipped reading — `heat` is the existing `chart`
mode at the existing `heatmap` kind — is inside the ADR's text and needs no amendment. What was genuinely
unrecorded is only the full-ink selector above. **ADR 0007 stands as written.**

### The pattern, for the fifth time

This would have been the fifth instance of the failure ADR 0003's third amendment names, and the third with the
orchestrator as the author of the wrong rule. The check that caught it is the one appended with rulings 7–9
today, and it generalises past `dc-import`: **before ruling a value wrong, read what the board does for the
sibling case.** A board's internal consistency is evidence; a convention from outside it is not.

---

## Ruling 11, 2026-10-03 — the dark floating glass is the Shell's, through one `.mn-glass`, for every consumer

### The conflict

Two component cards each restate the dark glass with their own ink delta, and neither agrees with the
composed Shell:

| source                                | background                                                      | border                  | shadow                                                             |
| ------------------------------------- | --------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| `Pond 05 Shell.dc.html` (dark frames) | `linear-gradient(160deg,rgba(72,73,64,.86),rgba(48,49,42,.66))` | `rgba(250,249,239,.2)`  | `inset 0 1px 0 rgba(250,249,239,.12), 0 20px 54px rgba(0,0,0,.44)` |
| `PondPicker.dc.html` (`theme=ink`)    | `linear-gradient(160deg,rgba(48,49,42,.92),rgba(48,49,42,.78))` | `rgba(250,249,239,.09)` | `inset 0 1px 0 rgba(250,249,239,.06), 0 20px 54px rgba(0,0,0,.42)` |
| `PondComposer.dc.html` (dark)         | `rgba(48,49,42,.92) → .78`                                      | `rgba(250,249,239,.09)` | — (restated in #230's body as a divergence to fix)                 |

`globals.css`'s dark `--mn-glass-*` trio is the Shell's row, annotated _"Pond 05 dark frames, computed
verbatim"_. The #278 spec review read the picker card against it and called the picker wrong; #230's
issue body reads the composer card against the same trio and calls the composer wrong. Same pair of
values, two cards, two tickets.

### The ruling

**On the dark theme the whole floating-glass family takes the Shell's values, through the one shared
`.mn-glass` / `--mn-glass-bg` / `--mn-glass-border` / `--mn-glass-shadow`.** The per-component ink deltas
in `PondPicker.dc.html` and `PondComposer.dc.html` are isolated restatements and are **deliberately not
implemented**. No consumer forks a dark glass of its own.

This binds every consumer, present and future: the rail cluster, the breadcrumb pill, the composer, the
selection bar, the `/` menu, the palette (#279) and the source picker (#280). **#230 must not "fix" the
composer's dark glass toward its component card** — that is exactly the re-litigation this ADR exists to
prevent, and the divergence line in its body is withdrawn by this ruling.

### Evidence

1. **The Shell draws it five times.** `Pond 05 Shell.dc.html` carries the `.86 → .66` / `.2` recipe at five
   occurrences across its dark frames — one value for every floating object on the screen. The component
   cards each carry their delta once, in isolation, and the two cards do not even cite each other.
2. **Ruling 3 is the precedent, exactly.** The composer's width was ruled 534 over the card's 560 because
   _the composed context outranks the isolated component card_: the Shell is unanimous across its frames
   and is what a person actually sees. The dark glass is the same shape of conflict on the same two
   boards, and the same reasoning gives the same answer.
3. **A fork would split one visual object across one screen.** Four surfaces already consume `.mn-glass`.
   A picker-only (or composer-only) dark trio would put the `/` menu, the rail cluster and the breadcrumb
   on one dark screen in three glasses that differ by a few hundredths of alpha — a difference no board
   draws and no person could name, but one that would read as the chrome not agreeing with itself.

### What this does not decide

The **light** glass is not in conflict: `.mn-glass`'s paper recipe is byte-for-byte the picker card's
`glass` (`rgba(255,255,255,.86) → .64`, border `.9`, shadow `.7` + `rgba(40,34,24,.14)`), and the Shell's
light frames agree. Only the dark theme has two readings, and only the dark theme is ruled here.

**It also does not cover the chart card's hover tooltip** (`PondChart.dc.html`'s `tip`, built in #227). That
readout forks the family deliberately: its dark base is `74,73,64` where the family's is `48,49,42`, and its
shadow is `0 8px 24px` in **both** themes where the family's is `0 20px 54px`.

Three reasons it is outside the family, recorded here rather than in a code comment — ADR 0004's own
2026-10-02 amendment exists precisely because three rulings had been left in comments and were re-litigated:

1. **The ruling's own reasoning does not reach it.** Ruling 11 is "the composed Shell outranks the isolated
   component card". **The Shell never draws a chart tooltip** — `PondChart` appears in exactly two files in
   the whole handoff, its own board and the `Pond 02` catalogue — so there is no composed context to
   outrank `PondChart.dc.html`, and its card is the only board there is.
2. **It is a different kind of object.** Every consumer ruling 11 names — the rail cluster, the breadcrumb
   pill, the composer, the selection bar, the `/` menu, the palette, the source picker — floats **over the
   canvas**. The tip is a readout **inside a card**, at `top 2 / right 34`, `pointer-events: none`. The
   "three glasses on one dark screen" argument does not apply: it is never beside another glass.
3. **The smaller shadow is what makes it read as inside.** `0 20px 54px` is the lift of an object above the
   page; a 24px shadow is the lift of a label above a plot. Copying the family's shadow would make the tip
   float off the card it belongs to.

So: **before measuring `.mn-glass` against the chart tip and finding the tip wrong, read this.** It is the
one deliberate exception, and it is one because the family's own argument does not cover it.

### The pattern, for the record

This is the family-wide version of ruling 3. The thing that would have gone wrong is the thing
rulings 7–10 warn about: reading one card's value, finding the code different, and "fixing" the code —
once per card, once per ticket, each time away from the composed frame every card sits inside. The
check is the same as before: **before ruling a value wrong, read what the composed board draws.** Here
it draws the Shell's glass, five times.
