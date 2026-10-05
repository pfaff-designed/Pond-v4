# Command palette — rest to open

Reference: `PondCommand.dc.html` (live: `Pond 05 Shell.dc.html#5al`). Open states for content: `PondPicker` kind `palette`.

## Rule

The breadcrumb and the palette are one element. ⌘K or a click on the breadcrumb animates that element into the palette in place. Do not mount a modal, dialog, portal or scrim. The page underneath stays rendered and unchanged.

## State machine

```
rest ──(⌘K | Ctrl K | click pill)──▶ opening ──▶ open
open ──(esc | ⌘K | click outside | esc chip | ↵ on result)──▶ closing ──▶ rest
opening/closing can reverse at any time; the animation continues from the current t.
```

- `t`: number 0..1. 0 = rest, 1 = open. Single source of truth for every animated value.
- On open: clear query, selection 0, focus the input (`preventScroll`).
- On close: blur the input. ↵ on a page navigates; the path then shows that page.
- Global listeners only on the one live instance.

## Geometry (px)

Rest
- Position: top 20, horizontally centred over the canvas (`left: calc(50% + 13px); translateX(-50%)` in a 1180 frame with a 206 rail).
- Box: height 40, radius 20, glass: `linear-gradient(160deg, rgba(255,255,255,.86), rgba(255,255,255,.64))`, `backdrop-filter: blur(24px) saturate(1.3)`, border `1px solid rgba(255,255,255,.9)`, shadow `inset 0 1px 0 rgba(255,255,255,.7), 0 20px 54px rgba(40,34,24,.14)`.
- Width hugs content: `restW = 36 (left inset) + measured(path + 10 gap + 1px divider) + 10 gap + 22 (mode) + 10 gap + 38 (chip) + 8 (right inset)`.
- Contents, left to right: area glyph 12×12 at left 14 / top 14 (glyph of the current page’s area, `life` → `waves-02`); ancestors in 68% ink, `›` in 80% ink, current page in full ink weight 500; PP Neue Montreal 11px, letter-spacing .04em, gap 10; divider 1×14 at 9% ink; mode toggle 22×22 at right 56 / top 9 (hand-drawn 13px half-filled circle, 68% ink; switches light/dark, does not open the palette); ⌘K chip 38×22, radius 999, bg 7% ink, 68% ink text, 11px 500, at right 8 / top 9.

Open
- Width 560. Height = 40 + body content height (measured).
- Top 40px row: glyph, mode toggle and chip do not move. Path is replaced by an input at left 36, right 88: PP Neue Montreal Mono 14px, placeholder `jump to a page, or > for actions` at 68% ink. Chip label becomes `esc`.
- Body: hairline 9% ink inset 10; rows in a 10px-padded column, gap 2; group labels 10.5px 500 uppercase .1em 68% ink; rows 9/12 padding, radius 14, 13.5px, selected row bg 7% ink with `↵` at right; key hints row (mono 10.5px, 68% ink, top hairline): `↑↓ move  ↵ open  > actions only  esc close`.

## Timing

- Open: 280ms, `cubic-bezier(.22,.8,.2,1)` (ease-press).
- Close: 150ms, `cubic-bezier(.4,0,1,1)` (ease-in). Snappy exit, weighted entrance.
- Duration scales by distance remaining when reversed mid-way.
- `prefers-reduced-motion: reduce` → set t to 0 or 1 immediately.

## Values mapped from t

`e = ease(t)`; `clamp` to 0..1.

| property | value |
|---|---|
| box width | `lerp(restW, 560, e)` |
| box height | `lerp(40, openH, e)` |
| radius | 20 constant (pill becomes card with no shape change) |
| path opacity | `1 - e / .35` |
| input opacity | `(e - .25) / .4` |
| body opacity | `(e - .3) / .3` |
| row i opacity | `(e - .45 - .035·i) / .4`, translateY `(1 - k)·4px` |
| key hints opacity | `(e - .6) / .4` |
| chip label | `⌘K` when e ≤ .5, else `esc` |

Pointer events follow opacity (> .5 = interactive).

## Rest hover

translateY(-1px), shadow `inset 0 1px 0 rgba(255,255,255,.7), 0 24px 60px rgba(40,34,24,.18)`, 150ms ease-press. Only at t = 0.

## Content

- Empty query: `recent` (3 pages) then `suggested` (2 actions).
- Query: `pages`, `records`, `actions`, then always `ask pond about “q”` last. No page or record match: a mono note `no page or record called “q”` first.
- Query starting with `>`: actions only.
- Matched substring underlined (1px, offset 3).
- Pages carry the area glyph; records a hand-drawn database mark; actions a mono `>`.

## Do not

- Do not dim, blur or block the page.
- Do not move the glyph, mode toggle or chip during the transition.
- Do not animate radius, or use a scale transform for the growth (text would stretch).
