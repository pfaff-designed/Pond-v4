# Findings: blank-slate AI creation gauntlet (2026-08-26)

## Setup

- Fresh Supabase user `blank-slate-test@pond.local` (id `2fdad0d1-0701-4dcc-8a04-9e10c9369a7f`) created via admin API; `DEV_EMAIL`/`DEV_PASSWORD` temporarily swapped in `.env.local`, dev server restarted. **Env restored and server restarted on the dev user afterward — nothing about the dev user's data was touched.** The test user + its 11 pages still exist in Supabase for reproducing findings (delete the auth user to clean up).
- A fresh user does NOT get a truly blank workspace: 5 empty root areas auto-seed (Personal, Professional, Health, Financial, Creativity). That's a good new-user baseline and gives parent inference something to aim at.
- Gotcha for future sessions: the Playwright MCP browser kept the dev user's session cookies, so autologin never fired until `context().clearCookies()` — first snapshot silently showed the WRONG user's workspace.
- Screenshots: `wayfinder/screens/blank-slate-*.png`.

## Scenario results

| #   | Ask                                        | Result                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Garage→woodworking-shop project with tasks | ✅ `project` page: overview text, metric-ring "0 of 6 phases", 6 phased todo lists, notes. Landed, editor fully editable.                                                                                                                                                                   |
| 2   | Gantt chart for that project               | ⚠️ No gantt module (expected). AI improvised well — table block as a week-grid with `██` bars via propose_changes, correctly targeting the scenario-1 page. **But Accept silently dropped it (BUG 1), then the AI insisted it had been added (BUG 2).** Re-accept while ON the page worked. |
| 3   | Simple notes page for manager 1:1s         | ✅ `document` "1:1s with Manager", meeting-log template, inferred **Professional**.                                                                                                                                                                                                         |
| 4   | Workout spot + 3-day dumbbell routine      | ✅ Two chained proposals: `area` "Workout Routines" → **Health**, then `routine` page with day tables, progression rules, week todos, metric + metric-ring.                                                                                                                                 |
| 5   | Article draft with outline                 | ✅ Best composition of the run: real writer's outline with per-section guidance in italics, drafting checklist, inferred **Creativity**.                                                                                                                                                    |
| 6   | Monthly budget tracker                     | ✅ Proposed as type `dashboard` (not a DB type — coerced to `page` on create). Metric total, real **table module** (Budgeted/Actual/Notes), emergency-fund metric-ring $500/$10k, monthly checklist. Inferred **Financial**.                                                                |

Final DB state verified: 11 pages, hierarchy correct (routine→Workout Routines→Health etc.), 0 console errors in-session.

## Bugs

### BUG 1 (high): accepting a propose_changes card from the wrong context silently drops the change

`AITerminal.tsx` `writeAcceptedChanges` writes to **`nodeId` — the currently open node** — not to the page the proposal targeted. The propose_changes payload carries no target-page id at all. Repro: from Life root (nodeId null), ask for a change to a named page → card renders → Accept → `writeAcceptedChanges` returns 0 silently, card still flips to "Accepted", nothing persists (verified at DB level). Any accept while viewing a _different_ page would presumably write the blocks onto the wrong page, which is worse. Fix direction: propose_changes needs an explicit target page id resolved server-side (like create_page's parent inference), and the accept path should commit to that id.

### BUG 2 (high, consequence of 1 + t19 stamping): the model gaslights about dropped accepts

Because ticket-19 stamps resolved cards with synthetic success tool-results, the model sees "accepted" and refuses to re-do the work: _"It looks like that Gantt chart was just added to this page!"_ — when nothing was written. User has to argue ("It is not on the page — I checked") to get a re-proposal. Fixing BUG 1 removes the lie, but the stamp wording could also carry applied/skipped counts.

### Paper cuts

- **Multi-page proposals can't chain parents up front**: the routine card's destination defaulted to Top level because "Workout Routines" didn't exist yet. Redeems itself: after creating the area, the sibling card's dropdown refreshed and auto-selected it. Accept-in-order works; accept-out-of-order strands the child at top level.
- **Parent inference misses**: woodworking project → Personal (Creativity felt right); everything else (Professional/Health/Financial/Creativity) was correct.
- **AI proposes non-DB page types**: `dashboard` shown on the card, coerced to `page` on create. Cosmetic now, but the card advertises a type the system doesn't have.
- **Markdown tables inside text blocks**: the routine's exercise tables are pipe-syntax markdown in `text` blocks (render as raw pipes in the editor), while the budget page used the real `table` module. Composition is inconsistent about when to reach for the table module.
- **Metric unit placement**: "3180 $" (unit after value) on the budget metric.

## Module gaps observed (findings, not failures)

- **gantt/timeline** — AI substitutes a table grid; fine, but a real timeline module is the obvious next module candidate.
- **date-stamped log/journal entries** — the 1:1s page fakes it with a `## [Date]` template in text.
- No failures to compose: every ask produced a sensible proposal on the first try; blocks re-render correctly after accept (registry serialization holding up).

## Not observed

- The unreproducible spontaneous navigation from the shell verify did not recur.
- Pending-card re-proposal after `/clear` didn't muddy anything (cards were resolved before each `/clear`).
