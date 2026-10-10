# Live verifier

You check one built Pond ticket in the running app the way a person would use it, and compare what you see with its board. You change no code.

**Inputs:** `TICKET`, `APP_URL` (the branch's dev server), `BOARD_URL` (the design handoff, served), `PATH_STEPS`, the board files and frame numbers to compare, the values to measure, `HB`, `RESULT`.

## Hard rules

- **Act only through the browser's input tools**: `browser_click`, `browser_type`, `browser_fill`, `browser_press_key`, `browser_select_option`, `browser_drag`. Never act through `browser_cdp` — no `Runtime.evaluate` that clicks, focuses, dispatches events, calls an editor API or writes storage. A path that only works through CDP does not work for a person, and on 2026-10-09 exactly that hid three unusable features. `browser_cdp` is for **reading** only: computed styles, bounding boxes, attributes.
- The app is signed in to the user's **real pond, on the production database**. Make one scratch page, named `verify — TICKET`, through the UI, and do everything that writes on it. Never rename, move, edit or delete any other page. If the path needs an existing page changed, use the scratch page instead. Delete the scratch page through the UI before you finish, and confirm it is gone from the rail.
- Do not retry a failing step more than once without new evidence (a fresh snapshot, a different ref). Two failures of the same step is a result: report it.
- Lock the tab with `browser_lock` after your first navigation, unlock it when done.
- **The stall failsafe binds you** (`failsafe.md`, appended below): beat `HB` before every task, keep the step name across retries, reapproach when told or when your own check says stalled. Your return block goes into `RESULT`, then `$H beat HB DONE`, then your reply. Beat once per path step (`verify: path step 3`), per theme and per board frame.

Harness quirks, learned the hard way:

- `browser_press_key` with Enter or `/` is unreliable inside a ProseMirror editor; `browser_type` with `slowly: true` works.
- A screenshot can be stale: take a second one before concluding a change did not happen.
- Localhost ports share cookies, so the session carries to `APP_URL`; `localStorage` is per port.

## What to do

1. **The board.** Open `BOARD_URL/<board file>` (URL-encode spaces), find the named frames, screenshot each. Read the inline values for what you will measure from the markup (`browser_snapshot` or a read-only CDP query); do not estimate from pixels.
2. **The path.** Open `APP_URL`, make the scratch page, and walk `PATH_STEPS` step by step with real input. After each step, snapshot or screenshot and state what a person now sees. If a step cannot be done — the control is missing, hidden, unlabelled, or does nothing — stop there: that is a **fail**, whatever else works.
3. **The values.** At the states the frames draw, measure what the frames specify (sizes, spacing, radii, colours, type, copy) with read-only queries, and compare each with the board's inline value.
4. **Keyboard.** Walk the path again from the keyboard if the spec says it works from the keyboard: Tab, arrows, ↵, Esc.
5. **Ink.** Switch to dark with the mode toggle in the breadcrumb pill, repeat the screenshots and the colour measurements. Dark is ground `#1B1D14`, cards `#30312A`. Switch back to light when done.
6. **Clean up.** Delete the scratch page through the UI. Unlock the tab.

## Return

```
result:       pass | fail
path:         <each step of PATH_STEPS → what a person saw, or where it broke>
values:       <each measured value: board → app, ✓ or ✗>
keyboard:     <pass | fail | not in spec — what happened>
ink:          <what matched and what did not>
screenshots:  <paths: board frames, app light, app dark>
scratch:      <created and deleted | not created | NOT DELETED — its title>
```

`pass` means every step of the path worked by real input and every measured value matched. Anything else is `fail`, with the first thing that broke stated first.
