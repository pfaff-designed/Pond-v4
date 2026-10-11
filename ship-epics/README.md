# ship-epics — how a session builds

One session works Pond's Jira epics and ends in merges. The chat is the **conductor**; it never
builds, reviews or verifies anything itself. Everything below it is a subagent or a loop, and only
four kinds of thing come back to you.

The role prompts and scripts in this directory name no tools. Each harness has a head of its own —
`.claude/skills/ship-epics/` and `.cursor/skills/ship-epics/` — whose `harness.md` is the only file
that names one.

## Who runs what

```mermaid
flowchart TD
    U(["You"])
    C["<b>Conductor</b> — this chat<br/>reads the queue · launches · collects<br/>brings you one batch"]
    U <--> C
    C -->|"one per epic, at most 3"| O1["<b>Epic orchestrator</b> · opus<br/>owns git, Jira, CI, merge"]
    C --> O2["Epic orchestrator · opus"]
    C --> O3["Epic orchestrator · opus"]
    O1 --> BL["<b>Build loop</b> — ralph.sh<br/>a fresh claude-sonnet-5 pass per item"]
    O1 --> RV["<b>Reviewer × 2</b> · opus<br/>standards + spec, in parallel"]
    O1 --> VE["<b>Live verifier</b> · opus<br/>a real browser, one at a time"]
    O2 -.-> D1["same three"]
    O3 -.-> D2["same three"]
```

Orchestrators run in parallel because each epic owns its own files and migration numbers. The
browser does not: there is one shared tab, taken through `/tmp/pond-browser.lock`.

## One ticket, nine steps

```mermaid
flowchart TD
    Q["<b>The queue</b><br/>labels = now · statusCategory != Done · ORDER BY rank"]
    Q --> P["<b>1 · Pick</b><br/>first Workstream ticket whose every after: is Done,<br/>with no branch and no open PR"]
    P --> G{"<b>2 · Reachability gate</b><br/>write the person's path.<br/>Does every step exist on main<br/>or get built here?"}
    G -->|"a step belongs to a later ticket"| NU1["Comment a re-split on the ticket<br/><b>→ needs-user</b>"]
    G -->|"yes"| S["<b>3 · Set up</b><br/>worktree off origin/main"]
    S --> B["<b>4 · Build</b> — the Ralph loop"]
    B --> BR{"loop result"}
    BR -->|"a pass flagged a blocker"| NU1
    BR -->|"an item missed twice"| STOP["<b>→ stopped</b><br/>with the step and both approaches"]
    BR -->|"green, gates pass"| R["<b>5 · Review</b><br/>standards + spec in parallel.<br/>Every finding is checked before it is acted on."]
    R --> RF{"confirmed<br/>blocking findings?"}
    RF -->|"yes"| CAP{"<b>6 · Fix round</b><br/>two already spent?"}
    CAP -->|"yes"| NU2["<b>→ needs-user</b><br/>a ruling, not a third round"]
    CAP -->|"no"| FIX["One plan item per finding,<br/>each its own fresh pass"]
    FIX --> B
    RF -->|"no"| V["<b>7 · Live verification</b><br/>walk the path by real click and keystroke,<br/>measure against the board, light and ink"]
    V --> VF{"pass?"}
    VF -->|"fail"| CAP
    VF -->|"pass"| M{"<b>8 · a migration?</b>"}
    M -->|"yes"| NU3["PR + In Review, then stop<br/><b>→ needs-user: 'push NNNN'</b>"]
    M -->|"no"| L["<b>9 · Land it</b><br/>rebase → gates → push → PR → In Review"]
    L --> CI{"CI"}
    CI -->|"red"| CAP
    CI -->|"green"| MERGE["Squash-merge · ticket Done<br/>refill now · sweep the worktree"]
    MERGE --> P
```

The two gates that exist because of 9 October 2026, when seven tickets merged and three could not be
used by anyone:

- **Step 2** writes the person's path _before_ any code. An engine-only ticket never passes it alone.
- **Step 7** only clicks. A verifier that evaluates script in the page can make an unreachable
  feature look finished.

## Inside the build loop

`ralph.sh` is a dumb loop around a fresh agent: the same prompt every pass, no memory between
passes, all state in files and git. **Progress is measured from git, so a pass cannot report itself
done.**

```mermaid
flowchart TD
    ST["ralph.sh LOOP WORKTREE HB RESULT"] --> HAS{"PLAN.md<br/>has items?"}
    HAS -->|"no"| PLAN["<b>Planning pass</b><br/>writes thin items, each one green step.<br/>Commits nothing."]
    PLAN --> HAS
    HAS -->|"yes"| ITEM["<b>Item pass</b> — fresh agent, first unticked item.<br/>Default-deny tools: cannot push,<br/>reach Supabase or start a server."]
    ITEM --> PROG{"did HEAD move,<br/>or the plan grow?"}
    PROG -->|"yes"| MORE{"items left?"}
    PROG -->|"no — first miss"| NOTE["Write the attempt into PLAN.md.<br/>The next fresh pass is told what failed<br/>and takes another route."]
    NOTE --> ITEM
    PROG -->|"no — second miss"| SM["<b>stop</b>: missed twice"]
    MORE -->|"yes"| ITEM
    MORE -->|"no"| GATES{"gates.sh<br/>tsc · jest · eslint ·<br/>storybook · pglite"}
    GATES -->|"red"| ADD["Add a gates: item"]
    ADD --> ITEM
    GATES -->|"green"| DONE["<b>status: green</b>"]
    ITEM -.->|"a step another ticket owns"| BL["<b>stop</b>: blocker"]
```

**Use a loop when all four hold:** the work is a list of items; each is proven by a command, not by
judgement; the state survives in git and a plan file; and nothing in it needs you, the shared
browser, or a one-way door. Picking, the reachability gate, review, live verification, migrations,
pushes, merges and Jira are therefore **not** loops.

## The clock

No task runs more than ten minutes on one approach. Every agent beats a heartbeat before each task;
its supervisor keeps its own clock alive with `heartbeat.sh relay`, which reads the child's current
step in the same breath it writes its own — so a supervisor's clock moves when its child's work
does, and cannot go stale.

A step's clock runs from the first of a run of _identical_ beats. That is deliberate: an agent stuck
in a retry loop still reads as stalled even while it keeps beating.

## What reaches you

Only four things, batched once every orchestrator has returned:

|                |                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------ |
| **merged**     | what landed, and what a person can now _do_ — the path, not the ticket title                     |
| **needs-user** | a production migration, a failed reachability gate with a proposed re-split, or a genuine ruling |
| **stopped**    | a stall, or a failure after two fix rounds                                                       |
| **blocked**    | nothing in the epic is ready, and what each candidate waits on                                   |

Everything else — picking, planning, building, reviewing, fixing, verifying, rebasing, merging and
sweeping — happens without you.
