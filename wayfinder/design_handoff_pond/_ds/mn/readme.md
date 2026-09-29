# Make Noise — Design System

Make Noise is a design & technology studio in Richmond, VA, founded in 2025 by Charles Pfaff. It builds AI-powered products and interfaces — "the place where your customers actually meet your AI." Not chatbots, not automation: intelligent experiences where conversation is the interface and the output is specific to the individual.

This design system is the studio's own visual and verbal language, plus the product surfaces built on top of it.

## Sources

Everything here was read from these repositories. Nothing was invented. Explore them directly for deeper fidelity than this system can carry.

| Repo                                                                                                  | Role                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [pfaff-designed/Pond-v4](https://github.com/pfaff-designed/Pond-v4)                                   | The attached repo. Pond — a personal AI thinking/productivity environment. Ships its own "Press" theme, a locked R6 palette layered over shadcn semantics.                  |
| [pfaff-designed/make-noise-design-system](https://github.com/pfaff-designed/make-noise-design-system) | `@make-noise/ui` — the canonical token layer, the 8-voice type system, and the 11 component families reproduced here. Brand guidelines live at `design-docs/make-noise.md`. |
| [pfaff-designed/make-noise-site](https://github.com/pfaff-designed/make-noise-site)                   | [make-noise.studio](https://make-noise.studio) — the studio site. Source of the PP Neue Montreal font binaries, the Make Noise wordmark SVG, and the studio theme override. |

The design system repo describes a two-layer architecture that this project follows literally:

> **Layer 1 — Foundation.** Tokens, components, utilities. Never changes between projects.
> **Layer 2 — Design Doc.** A structured markdown file per project. Drop one in and the token layer shifts. No component code changes.

Make Noise ships as the default design doc. `tokens/themes.css` holds two real Layer-2 overrides read from the repos: `.theme-studio` (make-noise.studio) and `.theme-press` (Pond).

---

## The tension

The Make Noise aesthetic holds two things at once: **refined and DIY**. Not a compromise — a position.

The reference the brand guidelines give is a subway car. The wayfinding is Helvetica: precise, authoritative, legible at 60mph. The graffiti is on top of it. The tag doesn't apologize for being there; neither does the grid underneath it.

Primary references: **Nike** (statements that don't hedge, condensed display type, maximum whitespace) and **Apple** (utilitarian UI that disappears, every pixel justified).

If something feels too clean it isn't Make Noise. If something feels too chaotic it isn't Make Noise. The right place is the tension between them.

---

## Content fundamentals

### Voice

Short. Declarative. Outcome-first. The studio's own agent prompt states the rule plainly: _"Short responses. This is a conversation, not an essay. No bullet points or headers. Plain prose only. No filler affirmations — 'Great question,' 'Absolutely,' none of that."_

Write what the thing does for the person, not what it is made of. From the site's `llms.txt`:

> We own the moment your customer meets your technology. And every moment after.

> Site agents — AI representatives that learn your brand, evaluate conversations, and surface qualified leads

Both name an outcome. Neither names a framework.

### Casing

Lowercase is the studio-site default for navigation and utility copy: `/what i do`, `/what i've done`, `/who i am`, `/contact`, `design / technology studio`, `helping your technology meet your people`. The slash prefix marks a navigable or invokable thing — it reads as a command line, because on make-noise.studio it literally is one.

UPPERCASE is reserved: the `MAKE NOISE` pill, eyebrows, badges, labels. Uppercase is a _small-text tool_ — the voice tokens forbid it at body scale or larger.

Sentence case carries the actual prose. Title Case appears essentially nowhere.

### Person

"We" for the studio, "you"/"your" for the reader. The site never says "I" in product copy even though the studio is one person; the founder appears in third person in the about copy ("Founded in 2025 by Charles Pfaff"). Pond's product docs, written for an internal audience, use "the user."

### Punctuation and rhythm

Em dashes and en dashes both appear, used as breath marks: `RVA - 2025`, `email — hi@make-noise.studio`. Sentence fragments are allowed and frequent — "Not chatbots. Not automation." Questions are used as headers in the command menu: _what's your business?_, _what's your pleasure?_, _curiosities & other tinkerable things_.

### Emoji

None. Zero emoji appear in any of the three repositories' user-facing copy. Don't introduce them.

Unicode glyphs _are_ used as functional marks: `›` for breadcrumb separators, `＋` and `×` for row actions, `⌘K` for the palette, `>` for the terminal prompt, `|` for the blinking cursor. These are typographic characters doing typographic work — not decoration.

### The standard

The studio states one bar, and it is worth quoting because it should govern copy decisions too:

> Before anything ships: does this make the person on the other end feel taken care of? Not: is this impressive for something built with AI. Not: did we ship on time.

### Don't

Fabricate credentials, clients, testimonials, pricing, or benchmarks. Pond's product doc is explicit: there are no customers, no press, no public deployment claims. The studio site names real past-client context (Capital One, Coca-Cola, Delta, PMI, Tanger, Sony) only as agency background for the founder — not as Make Noise case studies.

---

## Visual foundations

### Color

**One palette for the whole house.** Every colour in the system lives in `tokens/colors.css`, named by what it is. Make Noise and Pond are each a _selection_ from it — a product picks values off the shelf and assigns them to roles. A product never invents a colour; if the palette doesn't have it, the colour goes in the palette first.

Eight values, plus the olive neutral ramp between the two grounds.

| Token                | Value               | Role                                                                                  |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| `--raw-ink`          | `#1B1D14`           | Primary text. CTA background (light). Page background (dark).                         |
| `--raw-paper`        | `#FAF9EF`           | Page background (light). CTA background (dark). Pond's card surface.                  |
| `--raw-burnt-orange` | `#D96629`           | The loud warm signal: direction and energy. Carries ink, never paper.                 |
| `--raw-red`          | `#C55347`           | The accent red: badges, tags, text accents, punctuation. Aliased as `--raw-accent`.   |
| `--raw-wheat`        | `#FFEFAE`           | Warm pale yellow. Markers, callouts, Pond's one action. Aliased as `--raw-highlight`. |
| `--raw-mist`         | `#A5C8D1`           | Pale cyan. Recedes: secondary actions, selected states. Aliased as `--raw-calm`.      |
| `--raw-sage`         | `#648F7B`           | Mid sea-green. The quiet ambient tint — washes, letterpress margins, dots.            |
| `--raw-navy`         | `#12354E`           | Deep sea-ink. Hover flips, links, focus rings, info.                                  |
| neutral ramp         | `#FAF9EF → #1B1D14` | Nine olive-tinted steps. `neutral-100` `#EDECD8` is Pond's wall.                      |

Rules that do not bend:

- **Ink and paper are the primary relationship.** Everything else serves that contrast. Never flatten it.
- **The warms are signals, not brand colours.** Neither burnt orange nor red ever appears on a primary CTA. Hard limit: no more than **3 instances per page** outside badge/tag contexts. A fourth reach means something else is wrong with the layout.
- **Wheat is atmospheric, not functional.** Pull-quote grounds, callouts, editorial hover. Never a primary indicator on an interactive element.
- **Mist recedes.** A secondary button in mist should feel like a suggestion, not a statement.
- **Neutrals are always olive-tinted** — `#FAF9EF → #EDECD8 → #D9D8C4 → #BFBDAC → #A3A294 → #6E6D61 → #4A4940 → #30312A → #1B1D14`. Pure gray is as wrong here as pure white.
- **Dark mode flips ink/paper.** Raw values never move; only semantic roles reassign. The warms and wheat are identical in both modes.
- **Error is `#A63228`, deliberately distinct from both warms.** Destructive is never styled to look primary.
- **Burnt orange carries ink, never paper** (ink 4.77:1, paper 3.31:1). **Red carries neither at small sizes** (paper 4.23:1, ink 3.74:1) — in product UI use it as a fill behind large type, a mark, or a dot, never as a label ground. (The palette specimen cards label it in place because naming a swatch on the swatch is the card's whole job.)
- **`--color-link` carries inline links** — burnt orange outside, navy inside Pond. A bare `<a>` and the `Link` component both read it.

### One house

Make Noise and Pond are the **exterior and the interior of the same house**. Different vibes, same material — because they draw from the same palette rather than owning separate ones.

Two warm notes against a **three-step cool ladder** — mist `#A5C8D1` pale, sage `#648F7B` mid, navy `#12354E` deep. They divide by job, not by taste: mist marks selection, sage does the ambient work (washes, the letterpress margin, area dots) because a mid value washes well, and navy does anything needing contrast — hover flips, links, focus rings, info. The utility ramps sit on sage (success) and navy (info), so the house has exactly one green and one blue.

- **Exterior (`.theme-studio`)** — make-noise.studio picks **five**: ink (page), paper (type, CTA, chrome frame), burnt orange (signal), wheat (interactive markers), navy (their hover flip). Red, mist and sage stay on the shelf.
- **Interior (`.theme-press`)** — Pond uses the whole palette quietly: ink (type), `neutral-100` (walls), paper (module cards), sage (ambient tint), navy (focus ring, links, info), wheat (the one action), mist (selected and secondary states), red (punctuation and destructive). Burnt orange stays on the shelf — the interior never shouts.

So a Pond card sitting on a Pond page is literally the studio's paper on the studio's wall. Walk outside and the same paper is the button on the ink.

**Writing a selection:** reassign semantic `--color-*` roles, plus your own private `--studio-*` / `--press-*` handles. **Never redefine a `--raw-*`.** And restate every role you change: CSS substitutes `--color-ink: var(--raw-ink)` where it is _declared_ — on `:root` — so a scoped override never reaches an alias it didn't restate. Both shipped selections list their roles explicitly for this reason.

### Typography

Three families.

- **PP Neue Montreal** (`--font-sans`) — the workhorse. Body, UI, labels, navigation, captions. It carries the Apple side and should feel invisible in functional UI. Weights 100/300/350(Book)/400/500/700 ship in `assets/fonts/`.
- **PP Editorial New** (`--font-display`) — the statement face, display moments only. Using it for a nav item, a button, or a form field is using it wrong. Ships at Ultralight 200 and Ultrabold 800, each with an italic, in `assets/fonts/`. There is no 400.
- **PP Neue Montreal Mono** (`--font-mono`) — texture. Code, data values, technical details, and deliberate zine-energy moments where mono type is a visual element. Weights 350/400/500/700 ship.

Eight named voices carry all type: `body`, `label`, `label-bold`, `mono`, `whisper`, `whisper-italic`, `punch`, `punch-italic`.

- **`punch-italic` is the signature move.** One per page maximum, hero scale only. If it isn't the most important thing on the page it's in the wrong place.
- `whisper` voices rely entirely on scale — only at `--text-display-whisper` (clamp 3.5–8rem) or larger.
- `label` voices are always uppercase, always small.
- `mono` in a non-code context must read as a decision someone made, not a forgotten font swap.
- **One dominant typographic element per section.** Stacking large voices in one viewport makes noise, not hierarchy.

UI scale is stepped and fixed: 11 / 13 / 16 / 18 / 22 / 28 / 36 / 46 px. Display scale is fluid `clamp()`. Never use `clamp()` for UI type.

Leading: 1.1 at display, 1.3 subheads, 1.5 body, 1.7 long-form. Never tight leading on body copy. Tracking: −0.03em display, 0 body, 0.06em caps, 0.1em eyebrows.

### Spacing

Two scales with a hard architectural boundary.

- **Component scale** — 4 / 8 / 12 / 16 / 24 / 32 px. Lives _inside_ components: button padding, card internals, input spacing.
- **Layout scale** — 48 / 80 / 120 / 160 / 240 / 320 px. Lives _between_ components: section gaps, page margins, hero breathing room. This is where the Nike-level whitespace lives.

Crossing the boundary is always wrong. A component that reaches into the layout scale doesn't know what it is; a layout that reaches into the component scale is afraid of whitespace. Default to more space. `--layout-5` and `--layout-6` are hero territory — statements, not gap-filling.

### Composition

The grid is always present, even in full-bleed editorial layouts where content appears to float. Alignment is never accidental: things sit on the grid or break it on purpose. Asymmetry, when used, is confident — a 2/3 + 1/3 split for a reason, not a div slightly off. One hero moment per page. Whitespace is not empty space; in a Nike ad it does as much work as the type.

### Backgrounds and texture

Flat color. No gradients as decoration anywhere in the sources.

The one texture in the system is **film grain**: make-noise.studio renders a full-viewport canvas of per-pixel random noise at ~10fps, `mixBlendMode: screen`, `globalAlpha: 0.036`, `pointerEvents: none`, `zIndex: 9999`. It is almost subliminal — the DIY half of the tension, applied as a physical surface rather than as ornament.

The site's other background is **live ASCII**: a full-screen character grid running boids, flow-field, wave, and cellular-automata algorithms, which dissolves into the chat surface on first message. Imagery in the studio surface is therefore generated and monochrome, not photographic.

Pond's surface is paper, not screen: the ramp one step below daylight (`#EDECD8`) with the studio's own paper `#FAF9EF` as its module cards.

### Cards

Make Noise core: `--radius-lg` (8px), a 1px `--color-border-subtle` hairline, **no shadow at rest**. Shadow is opt-in via `--shadow-md` and means the card genuinely floats. An `elevated` card inverts to the dark neutral-700 surface with paper text.

Pond's Press cards are softer and more physical — `20px` radius, paper on the ramp wall, and a two-layer ambient shadow `0 1px 2px rgba(40,34,24,.04), 0 8px 24px rgba(40,34,24,.06)`.

### Borders and radii

`--radius-sm` 2px, `--radius-md` 4px (buttons, inputs), `--radius-lg` 8px (cards), `--radius-full` for pills and avatars. Borders are hairlines, never heavy. Pond runs two fainter divider tones — `press-line` at 9% ink and `press-hair` at 5.5% — for calm rules inside a document.

### Shadow

Three steps, all ink-tinted rather than black: `0 1px 2px rgb(27 29 20 / .06)`, `0 4px 12px rgb(27 29 20 / .10)`, `0 12px 32px rgb(27 29 20 / .14)`. Dark mode swaps to true-black alphas at 0.20 / 0.30 / 0.40.

Pond adds two composite treatments worth knowing:

- **Letterpress** (`press-letter`) — a warm near-paper card with a sage-inked left margin like ruled correspondence, and a _debossed_ rather than floating shadow: `inset 0 1px 0 rgba(255,255,255,.55), 0 1px 2px rgba(33,31,27,.05)`.
- **Liquid glass** (`press-glass`) — floating chrome only (top-bar cluster, palettes): a 160° near-white gradient at 84%→62% opacity, `backdrop-filter: blur(24px) saturate(1.3)`, a white 1px border, an inset white top highlight, and a long `0 20px 54px rgba(40,34,24,.14)` drop.

### Transparency and blur

Rare and purposeful. Blur appears only on floating chrome that sits over content (Pond's glass cluster). Transparency otherwise appears as alpha-on-ink for text tiers (Pond's `body`/`muted`/`faint` at 80/52/30%) and for hairline rules — never as a decorative wash.

### Motion

The brand rule is **snappy exits, weighted entrances**. Things leave fast; they arrive with intention.

- Motion communicates state, never decoration. If you can't name what an animation communicates, remove it.
- UI interactions are **duration-based**: `--duration-fast` 150ms (button press, toggle), `--duration-base` 250ms (panel open, tab switch), `--duration-slow` 400ms (modal, drawer).
- Display moments are **spring-based**. Springs feel physical; duration curves feel digital. Know which register you're in.
- Easing: `--ease-out` `cubic-bezier(.16,1,.3,1)` for entries, `--ease-in` `cubic-bezier(.4,0,1,1)` for exits, `--ease-in-out` for symmetric transitions.
- **Reduced motion is not an afterthought.** The base stylesheet collapses every animation and transition to 0.01ms under `prefers-reduced-motion: reduce`, and every component must respect it.

Pond layers a second, calmer register on top — the Press motion ladder — with its own vocabulary: `instant` 90ms (reflex feedback), `quick` 150ms (a change the user caused), `settle` 280ms (a thing finding rest after a move), `calm` 460ms (one authored object arriving), `slow` 560ms (a page of surfaces staggering in), all on `--ease-press` `cubic-bezier(.22,.8,.2,1)`. Its house note: _nothing overshoots for show — things SETTLE._

The studio site is the loud end of the range: GSAP `power3.inOut` chrome panels sliding off over 1.5s, and a character-scramble reveal (1500ms, Fisher-Yates resolution order, cycling `MAKE NOISE ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·—`) on every piece of text that enters.

### Hover and press states

- **Buttons** — filled variants drop to 90% opacity on hover; ghost fills to `--color-bg-subtle`. Disabled is 40% opacity with pointer events off.
- **Links** — a link drops to 75% opacity on hover, whichever `--color-link` resolves to (accent outside, spine blue inside Pond); subtle links resolve _up_ from muted to primary.
- **Studio-site markers** — wheat-on-ink chips flip to a navy `#12354E` background with paper text over 150ms `power2.inOut`, and re-scramble their label on enter.
- **Press rows** — hover paints `press-accent-wash` (7% sage); the selected row holds `press-accent-soft` (14%). Hover CRUD controls rest at `opacity: 0` and reveal on `group-hover` / `group-focus-within`, so the resting rail stays quiet.
- **Press cards** — hover lifts 1px with a deeper shadow; active presses back to rest and scales to `0.994` at the `instant` duration, so a tap reads as cause rather than flourish.
- **Focus** — always `2px solid var(--color-calm)` at `2px` offset, keyboard-only (`:focus-visible`). Selection is calm-on-ink.

### CTAs

- **Primary: ink on paper (light), paper on ink (dark).** The highest-contrast relationship in the system. No accent. No calm. No exceptions.
- **Secondary: calm.** Recedes behind primary.
- **Ghost/tertiary: border only**, no fill — for actions that are available but not recommended.
- **Destructive: `--color-error`**, only when the action can't be undone.

### Density

`default` is the starting point. `compact` for dashboard and data-heavy contexts (efficient, not cramped). `editorial` for long-form and case studies. `feature` bridges into the layout scale for hero-level, full-bleed moments. Don't mix densities randomly; if a page has both a dashboard and an editorial section, be deliberate about where the boundary is.

---

## Iconography

The brand runs **three icon registers**, and they do not mix. Knowing which one you are in is most of the job.

### 1 — The glyph library (182 marks)

`assets/icons/` holds the studio's own Illustrator library: 182 **solid geometric silhouettes**, no strokes, no outlines, no detail. Stars, flowers, arcs, stairs, lobes, quadrants, waves. They are closer to a modular type specimen or a set of printer's dingbats than to a UI icon set — MSCHF and streetwear, not Material.

**They are expressive, not functional.** There is no "save", "settings" or "search" glyph, and you should not press one into that job. Use them as marks: a category stamp, a bullet, a section opener, a full-bleed graphic element, a repeating pattern, a hit of colour in a layout that needs one.

- Normalized to a 192px square with 6% padding, trimmed to content and centred, so every glyph shares an optical box.
- Rendered through a **CSS mask over a `currentColor` ground** — so a glyph inherits colour from its parent exactly like text does. Colour it with `color`, never `fill`.
- **42 carry descriptive names** (`star-01`, `heart`, `lightning-03`, `tulip-01`, `waves-02`…). The other **140 are numbered library shapes** (`asset-1` … `asset-161`). The source names are loose — `cake` is a grid of rounded lobes, `bird` is a stepped quarter-round — so browse the Glyph index card rather than guessing from a name.
- Use the `Icon` component (pass `base`, or set `window.MN_ICON_BASE` once), or in plain HTML a `<span data-icon="star-01">` plus `<script src="…/assets/icons/icon-mask.js">` — the loader defaults its base to its own script directory, so no path is needed.

Two implementation notes worth carrying. **`mask-image` cannot reference a file URL from a sandboxed origin**, so both the component and the loader fetch each PNG once and apply it as a data-URI mask, cached across instances — a glyph rendering as a solid square means the mask failed to load. And **paths must be page-relative**: the project is served under a path prefix, so an origin-absolute `/assets/icons` 404s and the glyph renders as nothing at all.

### 2 — Hand-drawn functional marks

Pond draws the handful of real UI icons deliberately, at small viewBoxes, `stroke="currentColor"`, `strokeWidth="1.4"`, `strokeLinecap="round"`: the tree chevron (9×9, `M3.5 2 L7 5 L3.5 8`, rotates 90° on expand), the add-child plus (12×12, `M6 2.4v7.2M2.4 6h7.2`), the delete × (12×12, `M3 3l6 6M9 3l-6 6`), and the Life root mark — a stylized lily pad on a 14×14 box: one solid sage disc with a wedge cleft cut to the centre, no stroke, `M7 7 L12.74 5.25 A6 6 0 1 1 8.75 1.26 Z`. Everything shares one weight and one cap style, so the set reads as one hand.

If you need a functional icon the product doesn't have, **draw it at this spec** — don't reach into the glyph library, and don't import Lucide or Heroicons, whose weight and terminals will not match.

### 3 — Unicode and colored geometry

`›` breadcrumb separator, `＋` new page, `×` close, `⌘K` palette, `>` terminal prompt, `|` blink cursor, `…` in-progress. Set in the sans or mono face, inheriting colour — typography doing an icon's job.

Pond also codes page types with a 7×7px, 2px-radius square in a palette accent (`KindDot`) rather than a glyph per type. A shape and a colour where another system would reach for a symbol.

**Emoji are never used.** None appear anywhere in the sources.

### Logo

`assets/logo/make-noise-wordmark.svg` — the real Make Noise wordmark, a single-path condensed italic-weighted logotype on a `0 30 1560.24 210` viewBox, `fill="currentColor"` so it takes the surrounding text color. On the studio site it is the `<h1>`, rendered full-bleed edge to edge at the top of the page with the three-column caption row beneath it. There is no icon-mark or monogram variant — none exists in the sources, and none was created.

---

## Ahead of the source repos

Both surfaces are real and both are mid-renovation. **This system is the consolidated target, not a record of what shipped.** Pond's locked R6 palette and the studio's `#F36107` orange were re-picked from one shared house palette, and the semantic ramps re-grounded on it. Structure, layout, motion and interaction are faithful to the source; colour values run ahead of it. `github.md` carries the full table — where a repo differs, the repo is what needs updating.

## Substitutions (flagged)

- **No icon set was substituted.** The studio supplied its own 182-glyph library (see Iconography); nothing came from a third-party set.

---

## Index

**Foundations**

- `styles.css` — the single entry point consumers link. Imports only.
- `tokens/fonts.css` — `@font-face` for PP Neue Montreal + Mono
- `tokens/colors.css` — raw palette, olive neutral ramp, semantic roles, dark mode
- `tokens/typography.css` — families, 8 voices, UI + display scale, leading, tracking
- `tokens/spacing.css` — component scale and layout scale
- `tokens/radius-shadow.css`, `tokens/motion.css`, `tokens/base.css`
- `tokens/themes.css` — `.theme-studio` and `.theme-press` product selections

**Components** — the inventory the `@make-noise/ui` package defines, plus one intentional addition.

| Component                                         | Group      |
| ------------------------------------------------- | ---------- |
| `Button`                                          | primitives |
| `Input`                                           | primitives |
| `Label`                                           | primitives |
| `Badge`                                           | primitives |
| `Avatar`                                          | primitives |
| `Separator`                                       | primitives |
| `Text`                                            | typography |
| `Eyebrow`                                         | typography |
| `Link`                                            | typography |
| `Card` (+ `CardHeader`, `CardBody`, `CardFooter`) | layout     |
| `Image`                                           | layout     |
| `Icon`                                            | icon       |

Each directory carries `<Name>.jsx`, `<Name>.d.ts`, `<Name>.prompt.md`, and one `@dsCard` HTML.

**UI kits**

- `ui_kits/make-noise-studio/` — the studio site: ASCII intro stage, composer, chat surface, command palette, footer nav
- `ui_kits/pond/` — the Pond workspace: rail file tree, document editor, overview surface, AI terminal with proposal cards

**Guidelines** — `guidelines/` holds the foundation specimen cards rendered in the Design System tab (color, type, spacing, motion, brand).

**Intentional additions**

- `Icon` — the `@make-noise/ui` package predates the glyph library and defines no icon component. One was needed to render the 182 supplied marks consistently and to solve the sandboxed-mask problem in a single place.

**Assets**

- `assets/fonts/` — 12 PP Neue Montreal + Mono `.otf` binaries
- `assets/logo/make-noise-wordmark.svg`
- `assets/icons/` — 182 normalized glyph PNGs + `icon-mask.js`, the shared mask loader

**Other**

- `SKILL.md` — Agent Skills entry point
- `github.md` — upstream sync record
