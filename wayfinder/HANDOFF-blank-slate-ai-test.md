# Handoff: blank-slate AI creation gauntlet

## Where things stand (2026-08-26)

Shell harvest is **DONE and live-verified** — 5 commits on `main` (`daa44a4..273d6d2`, **not pushed**), per `wayfinder/BUILD-BRIEF-shell-harvest.md`:

1. `daa44a4` Press tokens global (Inter/Fraunces/JetBrains Mono/Instrument Serif via `--font-press-*`; R6 palette on shadcn vars + `press-*` Tailwind namespace + `.press-glass`/`.press-rise` in `src/app/globals.css`)
2. `2f4af7d` `src/components/organisms/Rail.tsx` (RailView + container) replaced Sidebar/PageTreeItem — data-driven `['pages']`, area = collapsible folder, hover CRUD, Life entry
3. `819630a` `src/components/organisms/TopBar.tsx` — glass ＋ (create-top flow in `src/lib/pages/create-top.ts`) + ⌘K → terminal focus via `src/lib/terminal-focus.ts` window event
4. `dcf24c2` type-switch in DocumentPanel: `type='area'` → `OverviewSurface` (model in `src/lib/pages/overview.ts`, accents in `src/lib/pages/accent.ts`), else editor
5. `273d6d2` `LifeOverviewPanel` replaces the root "Select a page" empty state

Green: tsc 0 · eslint clean · jest 252 · story tests 47 · live /verify passed (0 console errors).

## The next task (user's words, paraphrased)

Test the product the way a new user would: **start from a BLANK workspace** and do normal things purely through the AI terminal, verifying Pond can create all of it:

- a project with tasks
- a gantt chart
- a page for notes
- a page for workout routines + an actual workout routine
- an article page
- …and similar everyday asks

The point: exercise the create_page / propose_changes composition arc end-to-end from empty, not against the accumulated junk data.

## Suggested approach

1. **Blank slate**: either a fresh test user (seed pages will auto-create — decide whether to delete those too) or delete all pages for the dev user first (rail hover ×, or SQL). Note the current workspace has junk: "Terminal Test" ×3, "Woodworking" ×2, etc. — consider whether the user wants that data preserved. **Ask before mass-deleting the existing dev user's data.**
2. Drive via Playwright against `npm run dev` (server may already be on :3000). `DEV_AUTOLOGIN=1` in `.env.local`.
3. For each ask, send the natural-language request in the terminal, then verify: proposal card renders → sensible parent inference → accept → page lands in rail/overview → open it and check blocks render (module registry: text/todo/table/metric/metric-ring; **gantt may not exist as a module — finding, not failure; record what the AI does when asked for one**).
4. Also probe `/clear` between scenarios so pending-card re-proposal (known ticket-19 edge) doesn't muddy results.
5. Capture screenshots per scenario + a findings list: what Pond composed well, what module types are missing, where inference failed.

## Gotchas

- Supabase free tier auto-pauses (~1wk idle) → NXDOMAIN; restore: `POST https://api.supabase.com/v1/projects/ifhahsvgqedvygpdeaix/restore` (token in macOS keychain "Supabase CLI"), ~4 min.
- Read `node_modules/next/dist/docs/` before Next.js code changes (repo rule).
- Known edge: model re-proposes PENDING (unresolved) proposal cards on the next message.
- One unreproducible anomaly from the shell verify: a single spontaneous navigation to the "Browser Test" area during a create_page stream. Watch for it recurring.
- `main` is 5 commits ahead of origin — push when the user says so.
