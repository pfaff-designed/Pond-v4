# Pond → Notion-parity roadmap

_Authored 2026-08-30. Source of truth for the vision + every banked finding. Detailed
per-finding notes live in the cycle-3/4 findings log; this doc organizes them into
epics, maps them to the Notion-parity thesis, sizes them, and proposes a build order._

---

## 1. The thesis: Notion is one primitive on a foundation you already built

Decompose Notion to what's load-bearing:

| Notion primitive                                                                                                                                        | Pond today                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Everything is a page, infinitely nestable                                                                                                               | **Have it** — `pages` tree + `parent_id`, "everything is a page" |
| Pages are typed blocks (slash-insert, reorder, drag)                                                                                                    | **Have it** — module registry + `BlockCanvas` + palette          |
| An AI that can author all of the above                                                                                                                  | **Have it — and Notion largely doesn't. This is the edge.**      |
| **Databases** — collections of pages sharing a typed property schema, shown as table/board/calendar/gallery, with filter/sort/group + relations/rollups | **The gap.**                                                     |
| @mentions / backlinks / synced blocks; multiplayer/permissions                                                                                          | Secondary gaps                                                   |

**Key insight:** the expensive ~50–60% of "being Notion" — the page-tree spine + block
system + composition gate — is **already done and hard to retrofit**. Almost every banked
nitpick that touches structure (kanban cards → pages, drag-reparent, create-placement,
cross-page rollups) is a **facet of the one missing primitive: the database.** You're not
collecting a scattered wishlist; you keep hitting the same absent primitive from different
angles.

**Strategic stance:** don't clone Notion's manual, fiddly configuration UX. Build the
**underlying database primitive and let Pond drive it** conversationally, with just enough
manual UI to inspect and tweak. The live tell that this is the right cut: **Pond already
scaffolds card→page links and has to warn the user they don't work** (Finding 27) — the AI is
ahead of the UI and wants this primitive to exist.

---

## 2. Scope boundary

- **In scope:** single-user, AI-native Notion flexibility — the database primitive, richer
  blocks, manual authoring parity, the thinking-partner lifecycle, capture surfaces.
- **Out of scope (for now):** the collaboration platform — realtime multiplayer, comments,
  granular permissions, public sharing. Notion's single most expensive area, and likely
  unnecessary for a personal thinking partner. Revisit only if the product goal changes.

---

## 3. The crown epic — the Database Primitive (NEW, the real lift)

The one architectural system that unlocks "be Notion." Four pieces, in dependency order:

1. **Page properties / typed metadata** — pages gain a schema of typed fields (select, date,
   number, status, relation) beyond their blocks. _Foundational; everything below rides on it._
2. **The collection** — a page whose children share a property schema (a Notion "database" is
   just a page whose kids are homogeneous). Builds on the tree you already have.
3. **Views** — table / board / calendar / gallery are _renderings of one collection_, not
   separate static blocks. Today's `table` and `kanban` blocks **become views over a
   collection.** Filter/sort/group are per-view config.
4. **Relations & rollups** — a property pointing at pages in another collection, plus
   aggregations over it. Last and hardest 20%. (Finding 14's cross-page bindings is the
   rollup seed.)

**Sizing:** medium-large, multi-wave — a schema migration + real design per piece — but
_bounded_: one coherent system, not sprawl. Grill-first before committing.

**Down-payments already banked:** F27 (kanban card→page link) = the first view-over-pages
behavior; F25 (reparent) + F26 (create-placement) = structural prerequisites so the tree the
collection rides on is trustworthy.

---

## 4. Epics & the full nitpick backlog

Status legend: **Banked** = cycle-4, not started · **Prior-wave** = targeted in waves 1–3,
**needs a verification sweep** (user reported "a lot didn't take") · **Bug** = regression/defect.

### Epic A — Structural integrity (prereqs for the database primitive)

| #   | Finding                                                                                                                                                                                          | Status          | Size |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ---- |
| 26  | New page lands at ROOT until manual refresh — client refetch/reveal race; fix = optimistic `setQueryData` insert carrying correct `parent_id`, then reconcile (both rail-＋ and AI-accept paths) | **Bug, Banked** | S–M  |
| 25  | Drag pages into pages to reparent (**MOVE**, sets `parent_id`; guard against descendant-cycle; auto-expand)                                                                                      | **Banked**      | S–M  |

### Epic B — The composition vocabulary (registry growth → richer "databases" & blocks)

| #   | Finding                                                                                                                                                                                | Status                  | Size |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---- |
| 4   | Kanban board module (columns/cards, drag, add/edit/archive)                                                                                                                            | **Prior-wave — verify** | —    |
| 27  | Kanban cards **linkable to pages** (click → navigate; optional mint-new-child-page-and-link). **Closes the AI-scaffolds-but-UI-can't-honor gap.** First step of Views-over-collections | **Banked**              | M    |
| 1   | Gantt/timeline module + **loud accept-skip** (accepted-but-never-landed must say what didn't land & why)                                                                               | **Prior-wave — verify** | M    |
| 13  | Promote the whole Bklit chart library into the registry (line/bar/area/heatmap/stat) — AI-composable; kills the ~80-item lint baseline                                                 | **Prior-wave — verify** | M    |
| 14  | **Cross-page bindings** — metric/ring on a parent bound to child-page checklists/tables (live rollups). Rollup seed for the database primitive                                         | **Prior-wave — verify** | M    |
| 15  | metric-ring render bug — title stacked over ring, cramped label, floating ×, double → arrow                                                                                            | **Bug — verify**        | S    |
| 16  | CSV upload + ingest + AI-propose-what-to-make (table/summary/chart)                                                                                                                    | **Prior-wave — verify** | M–L  |

### Epic C — Manual authoring & editor ergonomics (user ↔ AI as equal authors)

| #   | Finding                                                                                                         | Status                  | Size |
| --- | --------------------------------------------------------------------------------------------------------------- | ----------------------- | ---- |
| 21  | Insert ANY registry module manually (repeal "text-only" law); sane empty states; insert-between + reorder       | **Prior-wave — verify** | M    |
| 22  | `/` slash menu at caret — chat commands in the terminal, block palette on the page (one SlashMenu, two sources) | **Prior-wave — verify** | S–M  |
| 7   | Resizable content/drawer via a **visible** drag grip (discoverability; verify t24 handle survives)              | **Prior-wave — verify** | S    |
| 5   | User messages **left-aligned** (shared reading edge; keep quiet treatment)                                      | **Prior-wave — verify** | S    |
| 8   | No surface a human reads shows **raw markdown** (todo/table cells, diffs typeset)                               | **Prior-wave — verify** | S–M  |

### Epic D — The AI thinking-partner & project lifecycle (the soul)

| #   | Finding                                                                                                                                             | Status                  | Size |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---- |
| 19  | **Project lifecycle: grill → wayfinding → build-out** (crown; AskUserQuestion-style pausing; persisted project brief). Orchestrates F2/3/9/10/11/12 | **Prior-wave — verify** | L    |
| 11  | Real thinking-partner personality + project-completeness awareness + per-project memory                                                             | **Prior-wave — verify** | M–L  |
| 2   | Plan mode for building projects (absorbed by F19)                                                                                                   | **Prior-wave — verify** | —    |
| 9   | Multi-step instruction handling (decomposition loop; tool budget; eval re-run)                                                                      | **Prior-wave — verify** | M    |
| 10  | Activity indicator while a proposal is being **built** (stage line during tool-arg gen; ghost card)                                                 | **Prior-wave — verify** | S    |
| 12  | Honest confirmation/receipt on apply (toast; reports applied AND skipped)                                                                           | **Prior-wave — verify** | S    |
| 3   | Follow-up chips after replies (refine/extend; quiet Press language)                                                                                 | **Prior-wave — verify** | S–M  |
| 23  | **Pond too positive/sycophantic** — persona tuning: candor + pushback, warmth without servility (`prompt.ts` persona)                               | **Banked**              | S    |

### Epic E — Capture & navigation surfaces (second-brain reach)

| #   | Finding                                                                                                   | Status                  | Size                 |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------- |
| 18  | ⌘K = real **command palette** (search pages, quick actions, recents) — fix regression + upgrade           | **Prior-wave — verify** | M                    |
| 20  | Kill "ask Pond →"; **highlight-to-ask** selection gesture (quoted context, block-scoped)                  | **Prior-wave — verify** | M                    |
| 6   | Voice — input (mic → composer) first; optional TTS output; capture-anywhere                               | **Prior-wave — verify** | M                    |
| 24  | **Text (SMS) Pond** — inbound webhook (Twilio) → capture/lifecycle; optional 2-way; async durable capture | **Banked**              | M–L (own mini-cycle) |

### Epic F — Motion & polish

| #   | Finding                                                                                                           | Status                  | Size |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------- | ---- |
| 17  | Motion system — tokens + micro-interactions across daily touchpoints (60fps MCP research; reduced-motion guarded) | **Prior-wave — verify** | M    |

---

## 4b. Verification sweep results (2026-08-31 — DONE)

Ran a two-layer sweep (live browser on `/sandbox` + code-evidence agent). Verdict: **the "a
lot didn't take" fear was largely unfounded** — nearly every prior-wave finding shipped and
works. Demote all SHIPPED rows to **Done**; only two genuine gaps remain, plus housekeeping.

- **DONE (verified shipped):** F3 chips+ghost, F4 kanban, F5 left-align, F6 voice, F7 resize
  grip, F8 inline-markdown (todo/table/diff), F9/F10 step-budget + stage indicator, F11/F19
  lifecycle + brief-memory + completeness, F12 honest receipt toast, F14 cross-page rollups,
  F15 metric-ring render (**bug fixed** — clean ring, `—` not `→`), F16 CSV, F17 motion tokens,
  F18 ⌘K **real** command palette, F20 highlight-to-ask (+ old header button removed), F21
  manual insert-any-module, F22 `/` menu both surfaces.
- **RE-OPEN — genuine gaps:**
  - **F1 — Gantt/timeline module still MISSING** (not in registry/palette). NOTE: the "loud
    accept-skip" half of F1 **did** ship (`accept.ts` applied/skipped/skippedReasons). So F1
    narrows to just "build the timeline module."
  - **F13 — Bklit promotion PARTIAL.** chart-line/bar/area are modules; **heatmap + stat
    exist as components but aren't module types.** F13 narrows to "promote heatmap/stat."
- **Housekeeping (trivial):** delete stray duplicate `src/lib/modules/metric/use-cross-page-metric 2.tsx`
  (accidental " 2" copy). Metric-ring shows its % twice (in-ring + caption) — by design per the
  fix comment, not a bug; glance if it bothers you.

## 5. Proposed build order

1. ~~Verification sweep~~ **— DONE (§4b).** Backlog is now honest: 20 findings Done, F1 & F13
   narrowed to small module-additions, cycle-4 items (25/26/27/23/24) still Banked.
2. **Epic A — structural integrity.** Fix F26 (create-placement) and ship F25 (reparent). The
   database primitive rides on a trustworthy tree; fix the tree first. Small and high-leverage.
3. **Epic B start — F27 (kanban card→page links).** Closes the live AI/UI mismatch and is the
   first taste of Views-over-pages — a cheap down-payment on the crown epic.
4. **The Database Primitive (§3), grilled.** Properties → collection → views → relations, as its
   own multi-wave arc. Fold F14 (rollups) and the rest of F27 (board-as-view) into it.
5. **Epic D — lifecycle & personality** (F23 de-sycophancy is a quick early win; F19 the large arc).
6. **Epics C / E / F** interleaved as polish and reach — several are small and can ride along.

---

## 6. Bottom line

"Mirror Notion's capability and flexibility" for a **single-user, AI-native** tool is
**substantial but tractable**: one architectural system (the database primitive) on a
foundation already the right shape, plus a well-understood backlog of ergonomics and
thinking-partner work. "Mirror Notion including the collaboration platform" is a different,
much larger animal — deliberately out of scope. The differentiator isn't parity; it's that
**Pond can author these structures conversationally**, which is _more_ flexible than Notion for
someone who'd rather describe than configure.
