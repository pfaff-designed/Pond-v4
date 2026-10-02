# ADR 0007 — The seven "missing blocks" are not all blocks. #111's law decides which.

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** the agent, under the autonomy granted in ADR 0003
- **Refines:** ADR 0005 (content is blocks, templates are data)
- **Related:** #111, #228, ADR 0004 (precedent for the agent ruling a conflict itself), ADR 0006

## Context

ADR 0005 lists **seven missing blocks** — `highlight`, `props`, `entries`, `bars`, `heat`, `gallery`,
`gantt` — and #228 is scoped to build them. Read literally, that instruction collides with the law #111 was
built to enforce, and which it spent 8,952 deleted lines enforcing.

`src/lib/modules/ai-composition.ts` records that law at the point it bites:

> The nine data-HOLDING display blocks (metric, metric-ring, stat, the three charts, heatmap, timeline,
> kanban) are DELETED, not merely absent from the emit unions. Each carried its own copy of the data, which
> the design forbids — _"the record is the source of truth… nothing holds a copy"_ — so a chart, a board and
> a headline figure are MODES of the `view` block, aggregated from the records at read time.

Four of ADR 0005's seven are data displays. Building `bars`, `heat`, `gantt` and `gallery` as blocks that
hold their own series would **reintroduce `heatmap`, `timeline` and the charts** — four of the nine #111
deleted, under new names. The emit vocabulary today is exactly five types: `text`, `todo`, `table`, `view`,
`image`.

## The decision

**ADR 0005's list is a list of missing _renderings_, not of missing persisted block types.** It says so
itself for two of the seven: `gallery` _"exists only as a view mode, not a block"_ and `gantt`
_"`timeline` is close — **map it**."_ Mapping is not building a block. So ADR 0005 already contemplates that
some of the seven resolve to view modes; this ADR finishes that sort for all seven.

**The sorting rule — one line, from #111:**

> A thing that **aggregates records** is a mode of the `view` block. A thing that **holds authored content**
> is a block.

Applying it, with what each actually needs:

| ADR 0005 calls it | What it is                                                                                                                                                                                                                        | Work                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **`highlight`**   | **a block.** Authored prose — a line the person kept.                                                                                                                                                                             | **Build.**                             |
| **`entries`**     | **a block.** Authored dated prose.                                                                                                                                                                                                | **Build.**                             |
| `props`           | **already built.** `PropertyInspector` (#17) renders a page's `_schema` as `field-row` molecules at the page eyebrow + sans 13.5, which is `PondBlock.dc.html`'s `properties` kind. It derives from the schema and holds no copy. | **Frame it** in the `properties` card. |
| `gallery`         | **already** a `view` mode.                                                                                                                                                                                                        | **Map.**                               |
| `gantt`           | **already** a `view` mode, with `gantt-shared.ts` (`buildTicks`, `GANTT_BAR_SHELL`) shared against the deleted standalone timeline so the two cannot drift.                                                                       | **Map.**                               |
| `bars`            | the existing **`chart` view mode at `kind: 'bar'`** (`CHART_KINDS` already carries `bar`), in a compact inline presentation — the board's 72px strip.                                                                             | **Add the compact presentation.**      |
| `heat`            | a **new `view` mode** (or chart kind). `heatmap` was deleted as a _block_ for holding data; as a read-time aggregation over records it is legitimate.                                                                             | **Build as a view mode.**              |

So the seven resolve to **two new blocks, one new view mode, one new presentation of an existing mode, and
three mappings** — not seven blocks. Net-new persisted types: `highlight` and `entries` only.

**`kanban` and `number`, which appear in `PondTemplate.dc.html` but not in ADR 0005's seven, are also view
modes** and already exist: `board` and `big-number`. `block-frame.ts`'s `VIEW_KIND` already maps both.
Nothing new is needed for either.

## Why this is a refinement and not a reversal

ADR 0005's real claim is its falsifiable one, and it survives intact:

> If the twelve premade templates can be built from blocks alone, the block vocabulary is complete. If any
> template needs special code, a block is missing.

That check still runs, and it still governs #228. This ADR only says that **"a block" in that sentence means
"an entry in the page's content vocabulary"**, and a `view` in a given mode is such an entry — it is a
persisted block of type `view`, with a mode. A template composed of `text`, `todo`, `table`, `view`, `image`,
`highlight` and `entries` blocks is still built _from blocks alone, with zero bespoke template code_.

What would violate ADR 0005 is a template needing a **renderer written for that template**. Nothing here
does.

## Consequences

- **#228 shrinks and changes shape.** It is re-scoped to: build `highlight`; build `entries`; add the `heat`
  view mode; add the compact `bars` presentation; map `props`, `gallery` and `gantt` into their
  `PondBlock` cards; then author the twelve templates as data. Split per the sizing rule — it is still
  several slices.
- **`ai-composition.ts` gains exactly two new entries in `moduleDataSchema`** (`highlight`, `entries`), plus
  whatever `viewSchema` needs for the `heat` mode. This is much less than "seven new emit types", and it is
  still the named work item ADR 0006 warns is easy to forget: a block absent from the emit union is a block
  Pond cannot use.
- **#111 is not partially undone.** Anyone later measuring `PondTemplate.dc.html`, finding a `heat` grid and
  concluding "we are missing a `heat` block" should read this ADR first. That is the re-litigation this
  record exists to prevent.
- The `view` block becomes the busiest type in the system — seven modes plus chart kinds. That is the
  intended shape, not accidental complexity: it is the single place record aggregation lives.

## Measured values, so the next agent does not re-derive them

All from `PondTemplate.dc.html`'s `renderVals()`, which holds every value as a literal. **Read that script
rather than serving the page** — these frames render under a CSS transform, so geometry read from the DOM
lies.

- **`highlight`** — filled: `align-self: flex-start`, `padding 4px 8px`, `background #FFEFAE`,
  `color #1B1D14`, serif `200 / 16 / 1.5`. Empty: serif `200 / 16` at `ink .68` with **no wheat ground**.
  So wheat appears **only when there is a passage**, which is exactly `PROJECT_RULES.md`'s
  "highlighted passages only, always carrying ink text". The absence of this block is why wheat has been
  leaking into banners and select swatches.
- **`entries`** — serif `200 / 16 / 1.55` at full ink **only when the kind sets `serif: 1`** (the journal);
  every other kind is sans `13.5 / 1.5`. Do not make the serif unconditional.
- **`bars`** — heights normalised to the max (`round(h / max * 100)%`), last bar **full ink**, the rest
  `ink .28`, radius 3.
- **`heat`** — **84 cells** (12×7), `aspect-ratio 1`, radius 2, three levels: full ink / `ink .45` /
  `ink .07`.
- **`gallery` card** — image `height 64` (70 mobile), radius 12; filled ground `ink .07`, empty
  `inset 0 0 0 1.4px ink .14`; title `13.5 / 500`, meta mono `10.5 / ink .68`.
- **`props` row** — label column `width 70`, `12.5` at `ink .68`; value full ink when filled.
- **The template card** — card paper, `border-radius 20`, card shadow, `padding 14px 16px`
  (`14px 14px` mobile), `gap 10`. Note this is **not** `PondBlock.dc.html`'s `16px 18px`. Two boards, two
  values; **do not reconcile them.** A value in a board is final (ADR 0003's amendment).
- A `text` block with **no label** is **bare** — `padding 2px 4px`, no card. Already implemented by #237's
  `blockFrame()` returning `null`.
