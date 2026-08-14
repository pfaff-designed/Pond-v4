---
id: 14-r2
label: wayfinder:prototype
status: exploration
feeds: [14, 15, 18]
north-star: zen
---

# Design Exploration R2 — 15 Bold Zen Directions

> Round 1 gave us a boldness ladder (Paper → Dreamscape) that landed **too safe** in the
> middle and too gimmicky at the top. This round throws out the ladder's timidity. The brief:
> **take the boldness you'd normally reach for and multiply it by 10**, then aim every gram of
> that boldness at a single feeling — the **zen** Charles wants to feel while using Pond every day.
>
> Bold here does **not** mean loud. It means *art-directed*: a committed material world, a real
> point of view, no defaults. Restraint taken to an extreme is bolder than noise.

---

## Inputs this round is built from

**The Pinterest board** (`pinterest.com/cmp7c/app-ui`, 34 pins pulled + read). Its DNA:
monochrome-dominant · **big rounded containers, cards-within-cards** · black pill controls &
segmented toggles · neumorphic soft surfaces (funnels, fitness dashboard pins) · Swiss/editorial
typography (Bloco studio, "Grid One 06", Model Discovery) · **blurred-motion photography** as hero
· **Liquid Glass** (the frosted capsule over 3D floral glass, pin "LiquidGlass.psd") · one restrained accent.

**Charles's three loves (from the R1 protos):**
1. **6 / 7 — calm earthiness** (`proto-06-parchment`, `proto-07-sage`)
2. **10 — everything in its own curved-rectangle container** (`proto-10-aurora`)
3. **15 — the glass effect** (`proto-15-dreamscape`)

These three are the load-bearing DNA. Every direction below carries at least one; the strongest carry all three.

**Shipped-app references** (Mobbin, iOS):
[Apple Journal](https://mobbin.com/screens/bf356291-cee2-4cbf-9ea4-79be184ab05a) ·
[Tolan](https://mobbin.com/screens/93999a94-a9a3-4ffe-bdb8-b0d862aec0f8) ·
[Alma](https://mobbin.com/screens/6ea822ea-fbfa-46da-b996-22c85056bb6e) ·
[Granola](https://mobbin.com/screens/978cd9f4-a931-4b41-8088-cbb7a5b2bf22) ·
[TIDE](https://mobbin.com/screens/3a6e3571-22fe-4659-80ac-7249374e4947) ·
[Calm](https://mobbin.com/screens/5236d3fc-154c-4a08-8eb1-8da87069582b) ·
[Opal](https://mobbin.com/screens/1b3deee1-a193-4e36-93b0-7e89740f9c5c) ·
[How We Feel](https://mobbin.com/screens/6ed5a84d-79d8-4688-b837-f8644d618b44).

**Motion references** (60fps, iOS):
[How We Feel onboarding](https://60fps.design/shots/how-we-feel-onboarding) (organic morph) ·
[Mindfulness inhale/exhale](https://60fps.design/shots/mindfulness-inhale-exhale-animation) &
[Unwind lotus](https://60fps.design/shots/unwind-lotus-breathing-animation) (breathing pulse) ·
[Avec button→video morph](https://60fps.design/shots/avec-button-morph-scale-to-video-interaction) &
[Canopi card→fullscreen](https://60fps.design/shots/canopi-new-collection-add-items) (shared-element expand).

---

## The zen thesis (the brief behind all 15)

Zen in a daily tool comes from four moves, and every direction below is scored on how hard it commits to them:

1. **Ma (間) — negative space as the primary material.** Emptiness is not "unused"; it is the design.
2. **One breath, one focus.** The app never shows you everything at once. What you're not doing recedes.
3. **A single honest material.** Paper, glass, clay, stone, light — pick one and be *devout* about it.
4. **Slow, weighted, organic motion.** Nothing snaps. Things settle, bleed, breathe, and pool.

The Pond shell rendered in all 15: **sidebar tree · page editor · AI terminal (the steward).** How each
direction treats *the steward's panel* is the tell — that's where the app's soul either glows or stays quiet.

---

## The 15 directions

Format per entry: **soul** · **palette** · **type** · **container & material** · **the steward** ·
**motion signature** · **the ×10 bold move** · **loves fused** · **boldness**.

---

### 01 · Sumi-e — Ink Garden
- **Soul:** A brush-and-rice-paper scroll painting you happen to be able to type into.
- **Palette:** Warm rice paper `#F4EFE6`, sumi black `#1A1714`, single vermilion seal `#C8492F`.
- **Type:** A humanist serif for body (literary), hand-adjacent mono for labels. Generous leading.
- **Container & material:** Panels are sheets of paper laid on paper — edges defined by a faint deckled
  shadow, never a hard border. Dividers are single dry-brush strokes, not lines.
- **The steward:** Speaks in a column of ink that **bleeds onto the page** as it "thinks," then settles.
- **Motion:** ink-diffusion reveals; focus = the rest of the page desaturates to a wash.
- **×10 move:** the entire UI obeys *ma* — 60%+ of every screen is intentional emptiness, and structure
  is implied by brushstrokes and alignment, not chrome.
- **Loves fused:** earthiness. **Boldness: 7/10.**

### 02 · Liquid Glass — Aurora Field  *(the R1 #10 + #15 fusion, taken all the way)*
- **Soul:** Apple's Liquid Glass, but the whole app is glass floating on a living dawn.
- **Palette:** Ambient gradient field — peach `#F7C9A8` → sage `#BFD3B5` → lilac `#C9BEE0`, shifting slowly.
- **Type:** Clean grotesk, white with a faint specular sheen; near-invisible until you rest on it.
- **Container & material:** **Every** surface is a frosted rounded capsule — refraction at the edges,
  specular highlight, real backdrop blur. No opaque panels anywhere. (Board pin: LiquidGlass.psd.)
- **The steward:** the clearest pane of glass on screen; when it speaks the glass **brightens and lenses**
  the aurora behind it.
- **Motion:** the gradient breathes on a ~60s loop; panels settle with a soft, weighted spring.
- **×10 move:** zero opaque UI + a background that is genuinely *alive* and tracks time of day
  (dawn palette in the morning, dusk at night).
- **Loves fused:** ALL THREE (glass + curved containers + earthy dawn). **Boldness: 9/10.** ⭐

### 03 · Clay — Soft Body
- **Soul:** A warm lump of clay pressed into an interface. Tactile, rounded, physical.
- **Palette:** Oat `#EAE0D2`, terracotta `#C57B57`, deep clay `#6B4E3D`.
- **Type:** Soft rounded sans (friendly, not childish).
- **Container & material:** Extruded clay tiles — thick soft double-shadow neumorphism (board's funnels
  & fitness pins), everything visibly *raised* from the surface. Corners are fat.
- **The steward:** a pressed-in well (debossed) where words rise up out of the clay.
- **Motion:** press = putty squash-and-settle; nothing has a hard edge in space or time.
- **×10 move:** commit fully to physical claymation depth — the anti-flat-design app.
- **Loves fused:** earthiness + curved containers. **Boldness: 7/10.**

### 04 · Karesansui — Stone & Raked Sand
- **Soul:** A Japanese dry rock garden. You tend it; it stays calm.
- **Palette:** Raked-sand beige `#E7E0D3`, river-stone grays, single moss `#7A8B6F`.
- **Type:** Quiet mono for structure, serif for content.
- **Container & material:** Items are smooth **river-stone** shapes (organic, not rectangles) resting on
  sand; the sidebar tree is a row of stones. Subtle raked concentric texture in the canvas.
- **The steward:** a still pond-stone in the corner; ripples radiate when it responds.
- **Motion:** the cursor **leaves rake lines** in the sand that fade; focus ripples outward like a dropped pebble.
- **×10 move:** navigation is *gardening* — reordering feels like placing stones; the whole surface is a tended space.
- **Loves fused:** earthiness + curved (organic) containers. **Boldness: 8/10.**

### 05 · Letterpress — Warm Literary Journal
- **Soul:** An artisan-printed book you write inside. (Evolves R1 Parchment + Editorial.)
- **Palette:** Cream `#F3EAD8`, ink brown `#3A2E24`, rust `#A8442A`.
- **Type:** A real display serif for headings (drop caps), old-style serif body, ruled margins.
- **Container & material:** Pages, not cards — deep paper texture, a faint letterpress *deboss* on headings,
  hairline rules as the only dividers.
- **The steward:** hand-written marginalia in the rust ink, in the outer margin, like an editor's notes.
- **Motion:** page-turn transitions; text sets (justifies) with a gentle settle.
- **×10 move:** reads as a fine printed object, not software — full editorial typographic discipline.
- **Loves fused:** earthiness. **Boldness: 6/10.**

### 06 · Onsen — Steam & Lantern
- **Soul:** A warm night bathhouse. Dark, misty, dimly glowing, deeply quiet.
- **Palette:** Warm charcoal `#211E1B`, steam-gray fog, amber lantern glow `#E0A24B`.
- **Type:** Warm off-white grotesk; amber only on the live element.
- **Container & material:** Fogged **glass panels** with volumetric steam drifting *between* them; light
  glows through the glass from behind.
- **The steward:** a paper lantern — its glass warms and the steam parts around it when it speaks.
- **Motion:** slow volumetric fog; glow swells and fades like breath ([Unwind lotus](https://60fps.design/shots/unwind-lotus-breathing-animation)).
- **×10 move:** a dark mode that feels *warm and wet*, not techy-black — glass + fog as the whole atmosphere.
- **Loves fused:** glass + earthiness. **Boldness: 8/10.**

### 07 · Herbarium — Pressed Botanical
- **Soul:** A naturalist's specimen book. Calm, studied, alive at the edges.
- **Palette:** Off-white `#F1EEE4`, sage `#8B9B7A`, ochre `#C9973F`, ink line.
- **Type:** Old-style serif + fine italic captions.
- **Container & material:** Content framed like **pressed-plant specimen cards** — thin ruled frames, a
  faint botanical line-drawing bleeding off one edge of each panel.
- **The steward:** a growing vine in the margin; new leaves unfurl as it adds thoughts.
- **Motion:** line-art *draws itself* slowly ([How We Feel](https://60fps.design/shots/how-we-feel-onboarding) morph energy, calmed).
- **×10 move:** living illustration as a system, not decoration — the app quietly grows.
- **Loves fused:** earthiness. **Boldness: 7/10.**

### 08 · Dawn — Kinetic Light
- **Soul:** The app has a sun. Everything is lit by it, and the light moves through your day.
- **Palette:** Near-white paper warmed by a real dawn gradient; long soft warm shadows.
- **Type:** Airy grotesk; shadow does the emphasis, not weight.
- **Container & material:** Simple warm cards, but every one casts a **long, soft, directional shadow**
  from a single light source that tracks real local time.
- **The steward:** the brightest-lit surface on screen; its shadow is the longest, anchoring it.
- **Motion:** shadows lengthen/shorten and hue-shift across the day; focus = a gentle "sun-through-cloud" brighten.
- **×10 move:** time-of-day is a first-class material — the UI at 7am and 7pm are visibly different moods.
- **Loves fused:** earthiness + curved containers. **Boldness: 8/10.**

### 09 · Ma — Radical Emptiness  *(Swiss-Zen)*
- **Soul:** Almost nothing on screen. What remains is perfect.
- **Palette:** Warm white `#F6F3EC`, one graphite text, one accent dot.
- **Type:** Small precise mono/grotesk, enormous margins.
- **Container & material:** **No containers at all** — alignment and whitespace are the only structure;
  a single hairline appears only where absolutely needed.
- **The steward:** invisible until addressed; a single dot pulses to signal presence, then a line of text.
- **Motion:** things fade in from nothing; nothing ever slides in from an edge.
- **×10 move:** 90% intentional emptiness — the boldest restraint on the board; content surfaces on focus, the rest dissolves.
- **Loves fused:** the *spirit* of all three via subtraction. **Boldness: 9/10 (by restraint).** ⭐

### 10 · Celadon — Glazed Ceramic
- **Soul:** A hand-thrown celadon bowl. Matte body, glossy pooled glaze, quiet green.
- **Palette:** Cream body `#EDE7DA`, celadon glaze `#9DBCB0`, iron-speck accent.
- **Type:** Refined humanist sans.
- **Container & material:** Thick-walled rounded vessels — a **matte ceramic** surface with a **glossy
  glaze rim** where light pools; subtle glaze speckle.
- **The steward:** a filled vessel — the glaze is deepest/wettest here, catching the most light.
- **Motion:** light pools and slides along glaze rims as panels settle.
- **×10 move:** a bespoke ceramic material system (matte body + specular glaze) no productivity app has.
- **Loves fused:** earthiness + curved containers + a whisper of glass (glaze). **Boldness: 8/10.**

### 11 · Shoji — Backlit Paper Screens
- **Soul:** Sliding rice-paper screens with light diffusing through. Glass, but *warm* glass.
- **Palette:** Warm rice-white `#F2ECDD`, sumi lattice `#2B2721`, soft amber backlight.
- **Type:** Restrained grotesk, generous.
- **Container & material:** Panels are **translucent shoji** — warm frosted glass over a fine black
  lattice; content is *backlit*, diffusing softly through paper.
- **The steward:** the panel that glows warmest from behind; slides open to speak.
- **Motion:** **shoji-slide** navigation — panels glide horizontally; light blooms as one opens ([Canopi](https://60fps.design/shots/canopi-new-collection-add-items)).
- **×10 move:** glass reimagined as *paper-and-light* instead of iOS blur — the most original take on the glass love.
- **Loves fused:** glass + earthiness + curved containers. **Boldness: 9/10.** ⭐

### 12 · Aurora — Living Gradient Field
- **Soul:** A weightless lava-lamp calm; UI floating on slow moving color. (R1 #10, ×10.)
- **Palette:** Full-bleed slow gradient: dawn peach → sage → periwinkle `#B7C0E6`.
- **Type:** Soft grotesk, white frost cards.
- **Container & material:** Content in **floating white-frost cards** with heavy blur, drifting a few px,
  never touching edges. Everything is *in its own curved container* (the exact #10 love, maximized).
- **The steward:** a card that floats slightly forward, catching more of the gradient behind it.
- **Motion:** ambient 60s gradient drift + parallax float; nothing docked.
- **×10 move:** the background is genuinely animated and never repeats within a session — living ambient calm.
- **Loves fused:** curved containers + glass + earthy dawn palette. **Boldness: 8/10.**

### 13 · Riso — Warm Print Grain
- **Soul:** A risograph zine. Tactile grain, two warm inks, gentle imperfection.
- **Palette:** Cream `#F0E9D6`, riso red `#E4573C`, slate blue `#4E6A8A`, halftone grain.
- **Type:** Chunky rounded grotesk; overprint where the two inks meet.
- **Container & material:** Chunky rounded ink-blocks with a **visible paper grain** and a hair of
  misregistration; halftone shading instead of gradients.
- **The steward:** an overprinted block where red+blue mix — the one "warm" spot on the page.
- **Motion:** grain shimmers faintly; blocks stamp in with a soft ink-press.
- **×10 move:** analog print texture as the entire material — imperfect on purpose, deeply human.
- **Loves fused:** earthiness + curved containers. **Boldness: 7/10.**

### 14 · Ember — Warm Zen Terminal  *(dark, focused)*
- **Soul:** A campfire in the dark. The AI steward glows like embers; everything else is quiet night.
- **Palette:** Warm near-black `#17140F` (not blue-black), warm-white text, single ember `#E07A3C`.
- **Type:** A calm mono for the terminal, warm serif for the page.
- **Container & material:** Near-invisible panels; the one **glass command bar** at the base glows warm.
- **The steward:** the emotional center — a softly **glowing ember panel** that pulses as it thinks
  ([Mindfulness breathing](https://60fps.design/shots/mindfulness-inhale-exhale-animation)).
- **Motion:** ember glow breathes; text arrives one calm line at a time.
- **×10 move:** a dark mode built around *warmth and firelight*, inverting the cold-terminal cliché — deep-focus night writing.
- **Loves fused:** glass (command bar) + earthy warmth. **Boldness: 8/10.**

### 15 · Dreamscape — Liquid Glass Nocturne  *(R1 #15, ×10)*
- **Soul:** A lucid dream. Twilight depth, blurred glow, ethereal glass.
- **Palette:** Deep twilight plum→indigo `#2A2140` → `#3B2E5A`, blurred glow orbs, lilac/pink glass.
- **Type:** Airy grotesk, faint outer glow.
- **Container & material:** Heavily blurred **lilac glass panels** with inner glow, floating in soft
  parallax over out-of-focus light orbs.
- **The steward:** a luminous orb of glass; it brightens and the orbs behind it drift toward it when it speaks.
- **Motion:** slow parallax glow drift; panels breathe; the most "meditative fantasy" of the set.
- **×10 move:** dreamlike depth and light as the whole world — the most escapist, night-time zen.
- **Loves fused:** glass + curved containers. **Boldness: 9/10.**

---

## Read of the field

- **Fuses all three loves hardest:** **02 Liquid Glass–Aurora**, **11 Shoji**, then **10 Celadon** & **12 Aurora**.
- **Boldest by restraint (most zen):** **09 Ma**, **01 Sumi-e**.
- **Most original material (nobody ships this):** **11 Shoji** (paper-as-glass), **10 Celadon** (glaze), **08 Dawn** (time-as-material).
- **Best dark/night mode:** **06 Onsen**, **14 Ember**, **15 Dreamscape**.

### Recommended shortlist to prototype next (build the shell in each, `←/→` to flip)
1. **02 · Liquid Glass — Aurora Field** — the maximal fusion of all three loves; highest ceiling.
2. **11 · Shoji — Backlit Paper Screens** — the most *original* answer to the glass love, and deeply calm.
3. **01 · Sumi-e — Ink Garden** — the purest zen; proves whether extreme restraint feels premium or empty.
4. **06 · Onsen — Steam & Lantern** *(or 14 Ember)* — the warm-dark direction, so we're not only testing light modes.

A blend is likely the endgame: e.g. **Shoji structure + Aurora light field + Sumi-e restraint**. Prototype
the four as distinct worlds first, then graft.

---

## Open questions for Charles
1. **One material or a light/dark pair?** Several here (Onsen, Ember, Dreamscape) are inherently dark — do you want the *primary* mood to be light-and-earthy with a warm dark mode, or is a dark-first zen on the table?
2. **How literal should the metaphor be?** Sumi-e ink-bleed and Karesansui rake-lines are gorgeous but flirt with skeuomorphism — is that the delightful edge you want, or a step too whimsical for a daily driver?
3. **Living backgrounds** (Aurora drift, Dawn time-tracking) cost GPU and can distract during deep work — worth it for the ambient calm, or should motion be strictly on-interaction?
4. Which **3–4** should I actually build as R2 protos in the `/proto/visual-language` harness?
