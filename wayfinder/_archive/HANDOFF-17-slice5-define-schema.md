# Handoff: #17 slice 5 — `define_schema` AI tool via proposal card

**Session date:** 2026-09-01
**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4` · branch **`feat/17-page-properties`** (NOT pushed).
**Why handoff:** slices 1–4 shipped green; slice 5 is a 13-seam multi-file integration and the session hit its context limit before starting it. Everything below is fully traced and ready to build in a fresh session.

## Done this session (all committed green: tsc · eslint · jest 862 · story tests)

| Slice | Commit    | What                                                                                                                                                                                                                                                                                                    |
| ----- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `9e7f125` | `src/lib/properties/schema.ts` — Zod for 7 property types + `_schema` array + `valueSchemaFor`/`emptyValue`/`coerceValue` + reserved-key merge helpers `readSchema`/`isCollection`/`readValues`/`withSchema`/`withValue`. 13 unit tests (`property-schema.test.ts`).                                    |
| 2     | `a8fa0ba` | `props` threaded through `pages/client.ts`: on `PondPage`, `PAGE_COLUMNS`, `mapRow`, `createPage`, `matchPages`; new merge-safe read-modify-write writers **`setProperty(id,key,value)`** and **`defineSchema(id,schema)`** (client.ts ~line 377). No-op on missing page.                               |
| 3     | `cde209d` | Retired legacy `status` column from the domain (decision 4). Removed from `PondPage`/`CreatePageInput`/`PAGE_COLUMNS`/`mapRow`/`createPage`/`matchPages` and from `context/assemble.ts` (`ChildSummary`/`NodeContextData` + context line). **Empty DB column left in place, dormant** — zero migration. |
| 4     | `2bbf0c7` | `PropertyInspector` molecule (`components/molecules/`, built from scratch per atomic-design convention) + 4 story play-tests; mounted in `DocumentPanel` above BlockCanvas, gated on `readSchema(page.props)`; edits write **optimistically** via `setProperty` (decision 17, never a proposal card).   |

**Convention confirmed:** repo uses atomic design (atoms/molecules/organisms), each with `.stories.tsx`; `components/ui/` (shadcn) holds only `button.tsx` — components are built from scratch with Tailwind + Press tokens (`press-line`, `press-body`, `press-muted`, `press-faint`, `press-accent`, `press-hair`, `pressKickerClass`). Story tests run via `npx vitest --project=storybook run <name>`.

## Slice 5 goal

New discrete AI tool **`define_schema(pageId, props[])`** that mirrors `create_page` end-to-end: model calls it → **proposal card** (no immediate write) → user Accept/Reject → on Accept persists via the existing `defineSchema()` client fn. Rides the ticket-19 `{messages, resolutions}` envelope so resolved proposals go inert and the model stops re-proposing. **Batched one card per logical change** (decision 22). The write fn already exists (`pages/client.ts` `defineSchema`) — slice 5 is the _AI-surface wiring only_.

## The 13 seams (mirror `create_page` exactly)

1. **Tool def** — `src/app/api/chat/tools.ts` (~L28–89 is `createPageTool`). Add `defineSchemaTool`: Zod input `{ pageId: string, props: <PropertySchema, id optional> , reason?: string }`, `description`, **no execute** (client-resolved). Reuse `propertyDefSchema` from `@/lib/properties/schema` (consider an AI variant where option/property `id` is optional and minted on accept, like blocks are hydrated).
2. **Tool registration** — `src/app/api/chat/route.ts` L175–213: add `define_schema: tool(defineSchemaTool)` (no execute).
3. **Prompt** — `src/app/api/chat/prompt.ts` ROUTING section (~L52–60): teach when to propose (user wants to turn a page into a collection / add columns), name target via `pageId`, one schema per card.
4. **Resolutions type** — `src/lib/conversation/resolutions.ts` L45–59 `ConversationResolutions`: add `schemas: Record<string, ProposalDecision>`.
5. **Resolutions stamp** — same file, `resolvePart()` L242–256: add a `part.type === 'tool-define_schema'` branch that stamps `output = { decision, note }` (accepted → "schema was defined. Do not propose it again."). Also update `emptyResolutions()` and `parseResolutions()` to include `schemas`.
6. **Proposal constant** — `src/lib/conversation/proposals.ts` L23–24: `DEFINE_SCHEMA_TYPE = 'tool-define_schema'`.
7. **Unresolved-cards derive** — same file `unresolvedProposalIds()` L44–72: add a define_schema branch (drives drawer auto-grow).
8. **Domain apply fn** — `src/lib/pages/create-page.ts` (~+L120): add `defineSchemaFromProposal(supabase, { pageId, schema }, workspace)` → validate page exists, mint any missing prop/option ids, call existing `defineSchema(supabase, pageId, schema)`.
9. **Card component** — new `src/components/molecules/DefineSchemaProposalCard.tsx` (+ `.stories.tsx` with play-tests). Props mirror `CreatePageProposalCard`: target-page picker (like its "Save to"), schema preview (name + type per column), `status`, `onAccept`/`onReject`/`onTargetChange`. Pending vs resolved (inert, opacity-reduced status line).
10. **AITerminal wiring** — `src/components/organisms/AITerminal.tsx`: state maps `defineSchemaDecisions`/`defineSchemaTarget` (near L239); `acceptDefineSchema()` callback (mirror `acceptCreatePage` L975–1017, incl. optimistic `['page', pageId]` cache seed of `props._schema` + `invalidateQueries(['pages'])`); card render block (mirror `createPageParts.map` L1183–1212); add `schemas: settled(defineSchemaDecisions)` to the `resolutions` useMemo (L259–275); restore in the mount effect (L540–560); reset in `resetResolutions()` (L277–286).
11. **UI test** — new `src/__tests__/define-schema-flow-ui.test.tsx` (mirror `create-page-flow-ui.test.tsx`): render card, Accept flow (calls `defineSchemaFromProposal`), Reject flow (inert).
12. **Unit test** — new `src/__tests__/define-schema-from-proposal.test.ts`: target resolution + schema write + missing-page handling.
13. **Resolutions test** — `src/__tests__/conversation-resolutions.test.ts` (~L76): add accepted/rejected/pending stamping cases for `tool-define_schema`.

## Gotchas (carried)

- **Don't clobber `_schema`** — `defineSchemaFromProposal` must go through the existing merge-safe `defineSchema()` (which uses `withSchema`), never a raw props overwrite.
- **`serialize` stays sync** (relevant #19, not slice 5).
- Supabase free-tier auto-pauses ~1wk idle → NXDOMAIN; restore via mgmt API `POST /v1/projects/ifhahsvgqedvygpdeaix/restore` (token in keychain "Supabase CLI"), ~4 min. Local dev `DEV_AUTOLOGIN=1` on :3000 for /verify.
- After slice 5: run tsc + full jest + storybook + `/verify` live (needs a schema created via the new tool). Then #17 is complete → PR, then **#18 collections**.

## To resume (paste into fresh session)

> Finish Pond-v4 #17 slice 5 (`define_schema` AI tool via proposal card) on branch `feat/17-page-properties`. Read `wayfinder/HANDOFF-17-slice5-define-schema.md` — slices 1–4 are shipped+committed green, slice 5 is fully traced (13 seams, mirror `create_page`). The `defineSchema()` write fn already exists in `pages/client.ts`. Build it, commit green, then open the #17 PR.
