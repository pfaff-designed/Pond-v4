# Build Brief — Deep Proposal Store

**Status:** grilled + specced, ready to build in a fresh session.
**Origin:** `/improve-codebase-architecture` review (2026-09-10), Candidate 1. Grilled via `/grilling` (AGENTS.md: grill → spec → build).
**Branch off:** `main` (current working branch is `feat/ui-audit-slice2` — do NOT build on top of it).

---

## Why (the friction, precisely)

The proposal **correctness** work is done and shipped (ticket-19 persistence envelope, ticket-30 target stamping, ticket-39 the spine, #52 honesty maps). The pure layer — `src/lib/conversation/resolutions.ts`, `parts.ts`, `proposals.ts` — is well-factored: one envelope, tolerant parse, jest-pinned.

What stayed **shallow** is the terminal's _client state_. A single proposal concept is fanned across ~20 flat `useState` maps, and **each proposal type must be touched in 5 coordinated edit-sites with zero exhaustiveness checking**:

| Edit-site          | File · lines                      | What lives there                                            |
| ------------------ | --------------------------------- | ----------------------------------------------------------- |
| Declaration        | `AITerminal.tsx` 374–467          | 2–3 `useState` maps per type (decision + destination + aux) |
| `resetResolutions` | `AITerminal.tsx` 515–538          | one setter per map                                          |
| Re-seed on load    | `AITerminal.tsx` 840–855          | one setter per map, from `conversation.resolutions.*`       |
| Projection memo    | `AITerminal.tsx` 474–513          | 13-dep `useMemo` assembling `ConversationResolutions`       |
| Accept + Reject    | `AITerminal.tsx` ~1150, 1284–1962 | per-type write paths + `setXxxDecisions`                    |

Plus two pure per-type if-chains: `unresolvedProposalIds` (`proposals.ts` 49–102) and `resolvePart` (`resolutions.ts` 251–411).

**Net:** adding one proposal type ≈ 7 scattered edits. The stamping decision that guards the "wrong-target accept" fix sits inside a `useEffect` (`AITerminal.tsx` ~883–911) and is only reachable by mounting the terminal.

**Goal of THIS refactor:** locality + testability, NOT behaviour change. Concentrate the proposal state behind one deep, pure, jest-testable interface. The on-disk envelope shape must stay byte-identical (legacy transcripts + `parseResolutions` are load-bearing).

---

## Resolved design (grilling decisions)

- **Scope = B.** Pure `proposalReducer` + thin `useProposalStore` hook. The two pure if-chains and the accept-handler write paths keep their current shape; they just call the store. **No type-registry** in this pass (deferred follow-on).
- **State shape = A.** ONE reducer state object whose fields **mirror the envelope's logical groups** — `changes`, `creates`, `schemas`, `rows`, `views`, `links`, `promotions`, `targets`, `skipped`, `questions`, `lifecycle` — PLUS the session-scoped aux the envelope does not persist: `skipReasons`, `linkErrors`, `promotionSnapshot`, the destination-picker maps (`createParent`, `schemaTarget`, `rowTarget`, `viewTarget`, `linkTarget`, `promotionTarget`), and `proposalRefIds`. Projection and re-seed stay **near-identity** (no bidirectional normalization).
- **Action surface = A.** One polymorphic `resolve({ type, id, decision, index?, ...aux })` (discriminated by proposal type; `index` carries `propose_changes`'s per-change `${id}:${index}` keying), plus distinct verbs: `answerQuestion`, `stampTarget`, `pickDestination`, `advanceLifecycle`, `reseed`, `reset`. The reducer's ONE internal switch is the single enumeration home for per-type aux placement.
- **Placement.** Pure reducer + types in `src/lib/conversation/proposal-store.ts` (React-free, server-safe, jest-pinned like its neighbours). `useProposalStore` hook co-located with the terminal (`src/components/organisms/`). Reducer's `project()` returns `ConversationResolutions` (reuse the existing type — one home for the wire shape).
- **Streaming target-stamp effect stays** as the React↔stream adapter; it becomes a one-line `dispatch(stampTarget(...))`. The decision logic is already pure in `resolveStampTarget` (`resolutions.ts` 194–210) — do not move it.

### Target interface (what the terminal sees)

```ts
// src/lib/conversation/proposal-store.ts  (React-free)
export interface ProposalState {
  /* fields mirror ConversationResolutions groups + session aux */
}
export type ProposalAction =
  | {
      kind: 'resolve'
      type: ProposalType
      id: string
      index?: number
      decision: ProposalDecision
      aux?: ResolveAux
    }
  | { kind: 'answerQuestion'; id: string; answer: string; via: 'option' | 'free' }
  | { kind: 'stampTarget'; id: string; target: ProposalTarget }
  | { kind: 'pickDestination'; type: ProposalType; id: string; destinationId: string }
  | { kind: 'advanceLifecycle'; lifecycle: LifecycleState }
  | { kind: 'reseed'; resolutions: ConversationResolutions }
  | { kind: 'reset' }
export function proposalReducer(state: ProposalState, action: ProposalAction): ProposalState
export function initialProposalState(): ProposalState
export function projectResolutions(state: ProposalState): ConversationResolutions // replaces the 13-dep memo
```

The terminal replaces ~20 setters + the memo + reset + re-seed with `const [state, dispatch] = useReducer(...)` and `const resolutions = useMemo(() => projectResolutions(state), [state])`.

---

## Slice plan (small, independently landable)

1. **Reducer skeleton + tests (pure, no terminal changes).** Author `proposal-store.ts` with `ProposalState`, actions, `proposalReducer`, `initialProposalState`, `projectResolutions`. Write the jest suite (see Done). Nothing imports it yet. — _green tsc + jest before touching the terminal._
2. **Wire the terminal onto the store.** Replace the ~20 `useState` with one `useReducer`; swap `resetResolutions`, the re-seed effect (840–855), and the projection memo (474–513) for reducer equivalents; convert accept/reject handlers' `setXxxDecisions` to `dispatch(resolve(...))`; convert the stamping effect to `dispatch(stampTarget(...))`. Keep `unresolvedProposalIds`/`resolvePart` call-sites unchanged (feed them from the projected `resolutions`).
3. **Verify + delete.** Remove dead setter/state declarations. Run `/verify`.

Keep each slice a tiny commit (orchestrator convention).

---

## Done (testing bar = B)

- New jest suite for `proposalReducer`:
  - `resolve` settles a decision (accepted/rejected) for each proposal type incl. per-change `propose_changes` via `index`.
  - `projectResolutions(state)` **byte-equals** the current 13-dep memo's output for the same inputs (drop a fixture captured from the old path).
  - `reseed(resolutions)` round-trips: `project(reduce(reseed R)) === R` for a representative envelope.
  - `reset` returns `initialProposalState()`.
  - pending/settled semantics: only settled decisions project (mirrors current `settled()` filter); reseeded-but-pending ids stay excluded (ticket-24/-19 contract).
- Existing `conversation-*` + terminal jest suites stay green; `tsc` clean.
- One live `/verify`: accept a proposal → reload → card still resolved (inert), model does not re-propose; confirm a cross-page target still commits to the stamped page, not the open one.

---

## Invariants that MUST NOT regress (the hard-won fixes)

- **Byte-identical envelope.** `projectResolutions` must emit the exact `ConversationResolutions` shape, including the additive-only maps carried **only when non-empty** (`schemaInertRollups`, `viewReplaced`, `lifecycle` gated by `isLifecycleActive`). A legacy transcript must stay byte-clean.
- **'pending' is never persisted** — only settled decisions project (`resolutions.ts` doc + memo `settled()` 474–479).
- **Write-once target stamp, deferred while pages load** — `stampTarget` must preserve the `!changeTargets[id]` guard and the `'defer'` semantics of `resolveStampTarget` (ticket-30 must-fix 1). A `missing:true` stamp still makes Accept skip, never falls back to the open page.
- **Re-seed scoping** — `excludeMessageIds` (session scope) still drives `unresolvedProposalIds`/`openQuestionIds` so prior-session cards don't pin the drawer open.
- **Session-scoped aux stays session-scoped** — `skipReasons`, `linkErrors`, `promotionSnapshot`, `proposalRefIds` must NOT leak into the persisted envelope.

## Out of scope (explicit)

- Type-registry / folding `unresolvedProposalIds` + `resolvePart` into descriptors (Candidate 1 follow-on).
- Collapsing the 6 per-type accept/reject handlers into one dispatch (that was scope D — rejected for now).
- Any change to the pure envelope layer's wire format, the chat route, or tool definitions.

---

## Ground-truth references

- Terminal state: `src/components/organisms/AITerminal.tsx` — decls 374–467, projection 474–513, reset 515–538, re-seed 840–855, save effect 864–867, stamping effect ~883–911, accept handlers 1150 / 1284–1560, reject handlers 1755–1962.
- Pure layer (unchanged, the projection contract): `src/lib/conversation/resolutions.ts` — `ConversationResolutions` 45–83, `emptyResolutions` 85–98, `parseResolutions` 102–147, `resolveAcceptTarget` 159–167, `resolveStampTarget` 194–210, `applyResolutions`/`resolvePart` 229–411.
- If-chains that consume the projection: `proposals.ts` `unresolvedProposalIds` 49–102; `parts.ts` `openQuestionIds` 155–169.
