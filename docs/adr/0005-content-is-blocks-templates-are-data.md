# ADR 0005 — The content area is blocks. Templates are data, not code.

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** the user
- **Related:** ADR 0004, `AGENTS.md` § two kinds of component, #111, #222, #228, #234

## The decision

**Everything in the content area is a block.** `Pond 03 Concepts`: _"The only container. A page holds blocks, and pages nest inside pages… Life is the page at the top."_ There are no content-area components beyond the block set itself. The chrome — rail, composer, breadcrumb, menus, pickers — is the component library; the content area is **block vocabulary plus arrangement**.

**A template is a block composition. It is data, not code.** The twelve premade shapes (page, notes, list, project, tracker, journal, collection, database, dashboard, meeting notes, reading list, habit) are arrangements of blocks that a person or Pond could have built by hand. They exist so nobody has to build a common case from scratch — that is their whole purpose. **No template may require bespoke rendering code.**

## The consequence that matters: this is a test of the block set

If the twelve premade templates can be built from blocks alone, the block vocabulary is complete. **If any template needs special code, a block is missing.** That turns template work from a judgement call into a falsifiable check on the block set.

Running that check against the boards today, the missing blocks are:

| block           | status                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`highlight`** | nothing. `#FFEFAE` ground, `#1B1D14` text, serif 200/16, pad `4px 8px`. **Wheat's one legal job** — its absence is why wheat has been leaking into banners and select swatches. |
| `props`         | nothing — label/value rows at a 70px label column                                                                                                                               |
| `entries`       | nothing — 52px date column; serif 200/16/1.55 when the journal kind sets `serif: 1`                                                                                             |
| `bars`          | nothing inline — a 72px strip, last bar full ink, the rest ink .28                                                                                                              |
| `heat`          | the 12×7 inline grid (ink / .45 / .07)                                                                                                                                          |
| `gallery`       | exists only as a view mode, not a block                                                                                                                                         |
| `gantt`         | `timeline` is close — map it                                                                                                                                                    |

**Build the blocks before the templates.** A template that needs a block we lack is the signal, not a problem to code around.

## What Pond generating templates does and does not mean

**Does not:** the premade twelve are **authored to match `PondTemplate.dc.html`**, which specifies each one's exact block list in both an `empty` and a `filled` variant — 24 renderings, with exact values. Letting Pond invent them would reintroduce exactly the divergence this project spent 2026-10-01 eliminating.

**Does:** Pond composing a page from blocks, and a person saving that composition as a template, is a real product feature — `Pond 06.08` (Pond proposes a template) and `Pond 06.09` (save as a template, #157). The same machinery serves both: **if templates are data, Pond writing one is just Pond writing blocks**, which it already does through the diff path. No new mechanism.

## Why this reduces error

Every bespoke surface is a place the code can drift from a board. Today's audit found the divergence concentrated in exactly those places — the pickers, the block shell, the Life overview — while the parts built as composition over a correct engine held up. Fewer bespoke surfaces, fewer places to be wrong.

It also means a template is **inspectable and editable by the person**, which `PROJECT_RULES.md`'s stance requires: nothing is locked in, and a template keeps no tie to the page made from it (`AUDIT.md` 6f).

## Consequences

- **#228** (PondTemplate) is re-scoped: author the twelve as **block data**, and build the missing block kinds first. No template rendering code.
- **#222** (PondBlock shell) is unchanged and becomes more important — it is the frame every block renders in, and it is currently absent.
- **#234** (Life is a page) follows directly: Life has no bespoke surface; it is blocks like any other page.
- A template requiring bespoke code is a **defect report against the block set**, to be raised rather than worked around.
