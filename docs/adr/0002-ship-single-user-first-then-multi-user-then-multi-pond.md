# ADR 0002 — Ship single-user complete, then multi-user, then multi-pond

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** the user
- **Resolves:** `wayfinder/OPEN-QUESTIONS.md` §1, and issue #112
- **Related:** ADR 0001 (continue, do not rebuild)

## Context

`wayfinder/design_handoff_pond/` specs the whole product as if other people are in the pond:
storyboard 14 is share & invite, 16 is working together (comments, @mentions, presence, per-block
human↔human diffs), 13 is create-a-pond, and §03 carries a pond/members/roles/access substrate.

That is a different product from a single-user thinking partner, and it is where roughly a third of
the remaining work lives. The planning layer could not be decomposed without knowing whether it was
in scope, because the answer changes the issue count by around 70 and changes whether a roles/access
substrate is a load-bearing foundation that earlier phases must build against.

## Decision

**Nothing is cut. The work is ordered into three sequential milestones, and each is finished before
the next begins.**

- **M1 — single-user complete.** Everything the product does for one person on their own, finished.
- **M2 — multi-user.** Other people in a pond: roles, access, sharing, invites, comments, @mentions,
  presence, human↔human diffs.
- **M3 — multiple ponds and organizations.** The pond table, the switcher, create-a-pond, settings ›
  ponds, and whatever org-level structure sits above a pond.

The milestones are a **completion gate, not a preference order.** M2 does not start because M1 is
mostly done.

## What belongs to M1

The whole of the original Phases 1–6 and 8, which are all single-user:

- **Phase 1** shell reskin + chart kinds (#96, #94)
- **Phase 2** core journeys (#97–#101)
- **Phase 3** change-log downstream, log views, session undo, memory, threads-as-a-database
  (#146, #147, #104, #105, #106)
- **Phase 4** the template system (#117)
- **Phase 5** onboarding wizard, settings, and the other 6 themes (#118)
- **Phase 6** external sources — Google Sheets connect, sync, read-only databases, break handling
  (#119). **This is single-user and stays in M1**; it is only "the secondary half" of the
  collaboration question in the sense that both were unscoped, not because it needs other people.
- **Phase 8** deep research, zen, freeform ink, agents & skills, reminders, offline, notifications
  (#121)

## Consequences

**Immediate scope corrections — these surfaces currently reach past M1 and must be trimmed:**

1. **#96 ships a pond _name_, not a pond _switcher_.** A switcher implies more than one pond, which
   is M3. The header shows the pond's name; the switching affordance lands in M3.
2. **Presence and access states come out of #96 and out of the Breadcrumb row.** Both are M2. The
   Breadcrumb's ⌘K affordance is single-user and stays.
3. **PondRail's roles state comes out.** M2. Its area marks and databases section are M1.
4. **The diff model's human↔human path comes out.** M2. The eight statuses, request-changes,
   outdated detection and show-original (#98) are all single-user and stay in M1 — "request
   changes" means asking Pond to revise its own proposal.

**#112 resolves:** leave the `workspace` column as the main/sandbox development toggle. Do **not**
overload it into a pond model, and do not build the pond model now — it is M3. The constraint the
issue was really protecting is honoured by _not_ touching the column.

**The roles/access substrate is not a foundation for M1.** Nothing in M1 may be designed as though
it will arrive. When M2 starts it will be a real migration against a populated single-user database,
and that is accepted as the cost of this ordering.

## Open sub-question

Comment cards are specced with an **@pond reply** (§02, storyboard 16). A comment that you leave and
Pond answers is single-user and would belong in M1; the same card with @mentions of other people is
M2. **Not yet decided** whether the single-user half of comments pulls forward. Tracked in
`wayfinder/OPEN-QUESTIONS.md`.
