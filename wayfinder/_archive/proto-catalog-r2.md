---
id: 14-r2-catalog
label: wayfinder:prototype
status: build-spec
north-star: zen
count: 40
---

# R2 Prototype Catalog — 40 Bold Zen Worlds

Master build spec. Each entry = one prototype rendering the **same Pond three-panel shell**
(sidebar tree · page editor · AI terminal / steward) in a fully art-directed world. Boldness ×10,
aimed at **zen**. Themes cover **light + dark**, static + **living backgrounds**, literal → abstract.

Builder agents: implement each as its own variant in `src/app/proto/visual-language/` following the
harness contract (see `proto-catalog-r2-BUILD.md` for the exact code pattern). Keep the shell's
information architecture identical across all — only the _world_ changes. `globals.css` stays untouched.

Per entry: **mode** · **soul** · **palette (hexes)** · **type** · **container/material** ·
**the steward (AI panel)** · **living bg?** · **motion** · **the ×10 move**.

Legend — mode: ☀️ light · 🌙 dark · 🌗 either/themed. LIVE = animated background.

---

## Family A — Ink & Paper (calm earthiness)

**A1 · Sumi-e Ink Garden** ☀️
Soul: brush-and-rice-paper scroll you type into. Palette: paper `#F4EFE6`, sumi `#1A1714`, vermilion seal `#C8492F`.
Type: humanist serif + hand-mono labels. Material: paper-on-paper, deckled shadow edges, dry-brush dividers.
Steward: ink column that bleeds onto the page then settles. Motion: ink-diffusion reveals. ×10: 60%+ ma / emptiness.

**A2 · Letterpress Journal** ☀️
Soul: artisan-printed literary book. Palette: cream `#F3EAD8`, ink brown `#3A2E24`, rust `#A8442A`.
Type: display serif + drop caps, old-style body, ruled margins. Material: debossed headings, hairline rules only.
Steward: rust marginalia in the outer margin. Motion: page-turn + text-set settle. ×10: reads as a printed object, not software.

**A3 · Shoji Backlit Paper** 🌗 LIVE
Soul: sliding rice-paper screens, light diffusing through. Palette: rice-white `#F2ECDD`, sumi lattice `#2B2721`, amber backlight.
Type: restrained grotesk. Material: translucent shoji = warm frosted glass over fine black lattice; content backlit.
Steward: warmest-glowing panel, slides open to speak. Motion: shoji horizontal slide + light bloom. ×10: glass-as-paper-and-light.

**A4 · Riso Print Grain** ☀️
Soul: risograph zine, two warm inks, gentle imperfection. Palette: cream `#F0E9D6`, riso red `#E4573C`, slate blue `#4E6A8A`.
Type: chunky rounded grotesk, overprint at ink overlaps. Material: grainy ink-blocks, hair of misregistration, halftone shading.
Steward: overprinted red+blue block. Motion: grain shimmer + ink-press stamp. ×10: analog print texture as the whole material.

**A5 · Ukiyo-e Woodblock** ☀️
Soul: a Hokusai print as an interface. Palette: indigo `#2E4A6B`, off-white `#EFE7D6`, coral `#D6805E`, wave-foam white.
Type: flat display serif. Material: flat woodblock color fields, carved outline edges, a stylized wave motif in the canvas.
Steward: a cresting-wave block. Motion: flat cel-style slides. ×10: fine-art print, zero gradients, pure flat blocks.

**A6 · Washi Collage** ☀️
Soul: torn-paper collage journal. Palette: kraft `#D9C7A8`, bone `#F1EBDD`, ochre `#C9973F`, charcoal.
Type: typewriter mono + serif. Material: layered torn washi edges, tape corners, slight rotation on cards.
Steward: a note taped to the surface. Motion: cards settle with a paper flutter. ×10: handmade collage, nothing perfectly aligned.

---

## Family B — Earth & Stone (tactile calm)

**B1 · Clay Soft Body** ☀️
Soul: warm clay pressed into UI. Palette: oat `#EAE0D2`, terracotta `#C57B57`, deep clay `#6B4E3D`.
Type: soft rounded sans. Material: extruded clay tiles, thick double-shadow neumorphism, fat corners.
Steward: debossed well, words rise from the clay. Motion: putty squash-and-settle. ×10: full claymation depth, anti-flat.

**B2 · Karesansui Stone & Sand** ☀️ LIVE
Soul: dry zen rock garden you tend. Palette: sand `#E7E0D3`, river-stone grays, moss `#7A8B6F`.
Type: quiet mono + serif. Material: organic river-stone shapes on raked sand; sidebar = row of stones.
Steward: still pond-stone, ripples when it responds. Motion: cursor leaves fading rake lines; focus ripples. ×10: navigation-as-gardening.

**B3 · Celadon Glazed Ceramic** ☀️
Soul: a hand-thrown celadon bowl. Palette: cream body `#EDE7DA`, celadon glaze `#9DBCB0`, iron speck.
Type: refined humanist sans. Material: thick-walled vessels, matte body + glossy glaze rim where light pools, speckle.
Steward: fullest vessel, wettest glaze. Motion: light pools/slides on glaze rims. ×10: bespoke matte-body/specular-glaze material.

**B4 · Kintsugi Wabi-sabi** 🌙
Soul: broken ceramic repaired with gold — beauty in the seam. Palette: charcoal clay `#26221E`, bone, gold seam `#C9A24B`.
Type: serif. Material: dark crackle-glaze panels, gold-leaf seams as the dividers/connectors.
Steward: the most gold-veined vessel. Motion: gold seams draw themselves in. ×10: cracks-as-structure, imperfection as luxury.

**B5 · Concrete Calm** 🌗
Soul: warm poured concrete, soft brutalism. Palette: warm concrete `#D8D2C8` / dark `#2A2724`, ember accent `#C0743E`.
Type: grotesk, tight. Material: matte concrete slabs, chamfered corners, soft ambient occlusion at seams.
Steward: a lit recess in the wall. Motion: minimal, heavy, weighted. ×10: massive tactile material honesty, no ornament.

**B6 · Marble Slab** 🌗
Soul: cool veined marble luxe. Palette: white marble `#F0EEE9` / noir `#1E1C1B`, gold hairline, sage vein.
Type: elegant serif. Material: real marble veining in surfaces, gold hairline inlays, polished edges.
Steward: the panel with the richest vein running through it. Motion: subtle sheen slide. ×10: fine-stone material, quiet opulence.

**B7 · Salt Flat** ☀️ LIVE
Soul: vast pale minimalism, mirror horizon. Palette: bone `#F2EFE8`, faint sky mirror, thin horizon line.
Type: airy grotesk, huge margins. Material: near-nothing; a mirrored reflection beneath floating elements.
Steward: its reflection ripples faintly. Motion: slow heat-shimmer on the mirror. ×10: emptiness + reflection as the entire design.

---

## Family C — Water (the Pond namesake)

**C1 · Pond Surface** 🌗 LIVE ⭐ namesake
Soul: the app is literally a pond. Palette: water teal-green `#4E6E63`, sky reflection, lily-pad greens, sand edge.
Type: humanist sans. Material: sidebar = reeds; pages = **lily-pad containers**; terminal = ripples from a dropped stone.
Steward: a stone dropped on the water — thoughts ripple outward. LIVE: gentle water surface + drifting reflections.
Motion: everything responds in concentric ripples. ×10: the metaphor made whole — you work _on water_.

**C2 · Depths** 🌙 LIVE
Soul: underwater stillness, light shafts from above. Palette: deep teal `#0F2A2E` → ink, caustic light, bioluminescent cyan `#6FE3D0`.
Type: light grotesk. Material: panels suspended in water, god-rays from top, soft particulate.
Steward: a glowing deep-sea light. LIVE: slow light shafts + drifting motes. Motion: buoyant float. ×10: deep-focus as literal depth & quiet.

**C3 · Tidepool** ☀️ LIVE
Soul: a sunlit rockpool — wet glass, caustics, sand. Palette: aqua `#7FB6AE`, wet sand `#E4D7BE`, stone.
Type: rounded sans. Material: wet-glass panels with caustic light dancing across them; pebble accents.
Steward: the clearest pool, caustics brightest. LIVE: caustic ripple projection. Motion: water-wobble on tap. ×10: living caustics as the light system.

**C4 · Rain on Glass** 🌙 LIVE
Soul: a warm room, rain on the window at night (TIDE-adjacent). Palette: charcoal `#1C1E22`, rain-blue, warm interior amber.
Type: grotesk. Material: fogged glass panels with real rain droplets running down; interior warmth behind.
Steward: the window that clears where you wipe it. LIVE: rain streaks + droplet refraction. Motion: droplet trails. ×10: cozy melancholy, rain as ambient companion.

**C5 · Koi & Reeds** ☀️ LIVE
Soul: a garden koi pond, playful-calm. Palette: jade water, koi orange `#E08A3C`, white, reed green.
Type: soft serif. Material: lily-pad cards, reed dividers; a single koi drifts through the canvas behind panels.
Steward: the koi surfaces near it when it speaks. LIVE: koi + water. Motion: fish-drift + ripple. ×10: a living creature inhabits your workspace.

---

## Family D — Light & Sky (atmosphere)

**D1 · Dawn (time-tracking)** ☀️ LIVE
Soul: the app has a sun; light moves through your real day. Palette: warm white warmed by a dawn gradient; long soft shadows.
Type: airy grotesk. Material: warm cards casting long directional shadows from one light source tracking local time.
Steward: brightest-lit surface, longest shadow. LIVE: shadows lengthen/hue-shift across the day. Motion: sun-through-cloud brighten. ×10: time-of-day as a first-class material.

**D2 · Golden Hour** ☀️ LIVE
Soul: endless magic-hour warmth. Palette: amber `#E8B87A`, rose `#E0A0A0`, cream, long gold light.
Type: elegant sans. Material: soft cards with warm lens bloom and gentle grain. LIVE: slow-drifting light leaks.
Steward: catches a lens flare when active. Motion: bloom breathe. ×10: cinematic warm light bath, always golden.

**D3 · Moonlight** 🌙 LIVE
Soul: cool silver night, everything asleep but you. Palette: slate `#20242B`, silver `#C7D0DA`, faint blue glow.
Type: light grotesk. Material: cool matte panels, soft moon-glow rim light. LIVE: drifting clouds dim/brighten the scene.
Steward: silver-lit, the one clearly awake. Motion: cloud-shadow drift. ×10: nocturne calm, silver instead of blue-black.

**D4 · Aurora Borealis** 🌙 LIVE ⭐
Soul: dark sky, living aurora ribbons overhead. Palette: night `#0C1220`, aurora green `#5FE0A8` + violet `#9B7FE0`.
Type: airy grotesk. Material: dark glass panels; aurora ribbons drift behind them, tinting the glass.
Steward: the panel the aurora pools brightest behind. LIVE: real flowing aurora shader. Motion: slow ribbon flow. ×10: a living sky as the whole background.

**D5 · Fog / Cloud** 🌗 LIVE
Soul: soft volumetric fog; things emerge and dissolve. Palette: white-gray `#EBEAE7` / dark mist, faint warm core.
Type: grotesk, quiet. Material: no hard edges — panels are density in the fog. LIVE: slow volumetric fog drift.
Steward: where the fog thins to reveal it. Motion: emerge/dissolve fades. ×10: nothing has a boundary; presence is density.

**D6 · Candlelight** 🌙 LIVE
Soul: writing by a single candle. Palette: near-black `#161310`, warm wax `#E8C98A`, deep amber glow.
Type: serif. Material: near-invisible panels lit by one flame; vignette darkness. LIVE: candle flicker modulates the whole scene.
Steward: the flame itself — your companion in the dark. Motion: organic flicker. ×10: one honest light source, everything else in shadow.

---

## Family E — Nature & Growth

**E1 · Herbarium (pressed botanical)** ☀️ LIVE
Soul: a naturalist's specimen book, alive at the edges. Palette: off-white `#F1EEE4`, sage `#8B9B7A`, ochre `#C9973F`.
Type: old-style serif + italic captions. Material: specimen-card frames, botanical line-art bleeding off one edge.
Steward: a vine in the margin; leaves unfurl as it adds thoughts. LIVE: slow line-art growth. Motion: draw-on. ×10: living illustration as a system.

**E2 · Moss Terrarium** 🌗 LIVE
Soul: a glass terrarium of deep green calm. Palette: forest `#233026`, moss `#7E9B6A`, glass, condensation.
Type: rounded sans. Material: glass-dome panels over living moss texture; dewdrops on the glass. LIVE: slow dew + subtle moss shimmer.
Steward: the terrarium that's flourishing most. Motion: dew slide. ×10: a tiny living ecosystem under glass.

**E3 · Bamboo Grove** ☀️ LIVE
Soul: filtered green light through swaying bamboo. Palette: bamboo green `#8AA06A`, paper `#F0EDE0`, shadow stalks.
Type: humanist serif. Material: vertical bamboo-line rhythm; panels are paper between stalks; dappled light. LIVE: gentle wind sway + light dapple.
Steward: where light filters brightest. Motion: sway. ×10: vertical natural rhythm + living dappled light.

**E4 · Sand Dune** ☀️ LIVE
Soul: warm desert dunes, wind-rippled. Palette: dune `#E3CDA4`, shadow `#B99A6B`, sky-pale, rust rock.
Type: airy grotesk. Material: soft dune-gradient surfaces, wind-ripple texture. LIVE: slow wind ripples reshape the sand.
Steward: a shaded hollow. Motion: sand-drift. ×10: vast warm minimalism, wind as the living element.

**E5 · Bioluminescence** 🌙 LIVE
Soul: a dark forest floor / sea glowing softly with life. Palette: near-black `#0A0F0D`, glow cyan `#66E6C8`, violet spark.
Type: light grotesk. Material: dark panels edged with soft living glow; particles drift and light where you touch.
Steward: the brightest bloom of light. LIVE: drifting glowing particles that react to cursor. Motion: glow-on-touch. ×10: darkness that comes alive around your attention.

---

## Family F — Glass & Air (the glass love, maximized)

**F1 · Liquid Glass — Aurora Field** 🌗 LIVE ⭐ all-3-loves
Soul: Apple Liquid Glass, whole app is glass on a living dawn. Palette: peach `#F7C9A8` → sage `#BFD3B5` → lilac `#C9BEE0`, shifting.
Type: grotesk with specular sheen. Material: EVERY surface a frosted rounded capsule, refraction + specular edge, real blur. No opaque UI.
Steward: clearest pane; brightens & lenses the aurora when speaking. LIVE: aurora breathes ~60s, tracks time of day. ×10: zero opaque UI + a living background.

**F2 · Dreamscape Nocturne** 🌙 LIVE ⭐
Soul: a lucid dream, twilight glow. Palette: plum→indigo `#2A2140`→`#3B2E5A`, blurred glow orbs, lilac/pink glass.
Type: airy grotesk, faint glow. Material: heavily blurred lilac glass panels, inner glow, parallax over out-of-focus orbs.
Steward: a luminous glass orb; orbs drift toward it when it speaks. LIVE: parallax glow drift. ×10: dreamlike depth & light as the world.

**F3 · Aurora Frost Field** ☀️ LIVE
Soul: weightless lava-lamp calm. Palette: dawn peach → sage → periwinkle `#B7C0E6`, white frost.
Type: soft grotesk. Material: floating white-frost cards (heavy blur), each in its own curved container, drifting a few px.
Steward: floats slightly forward, catches more gradient. LIVE: 60s gradient drift + parallax. ×10: living never-repeating ambient field.

**F4 · Prism / Spectrum** ☀️ LIVE
Soul: white light through glass, subtle rainbow refraction. Palette: white `#F7F6F3`, prismatic edge spectrum, graphite text.
Type: precise grotesk. Material: clear glass panels that refract a faint spectrum at their edges only. LIVE: spectrum shifts as light "moves."
Steward: throws the widest rainbow when active. Motion: refraction shimmer. ×10: color only exists as refracted light, never fill.

**F5 · Onsen Steam & Lantern** 🌙 LIVE
Soul: warm night bathhouse. Palette: warm charcoal `#211E1B`, steam-gray, amber lantern `#E0A24B`.
Type: warm off-white grotesk. Material: fogged glass panels, volumetric steam drifting between them, backlight through glass.
Steward: a paper lantern; glass warms, steam parts. LIVE: volumetric steam. Motion: glow breathe. ×10: warm+wet dark mode, glass+fog atmosphere.

**F6 · Frosted Aurora Dark** 🌙 LIVE
Soul: F1's night twin — dark glass over dark aurora. Palette: charcoal `#191C22`, deep glass, teal+violet aurora tint.
Type: grotesk, specular. Material: smoked-glass capsules, refraction, over a slow dark aurora. LIVE: dark aurora drift.
Steward: the pane the aurora lights up. Motion: settle + lens. ×10: premium dark glass, everything translucent.

---

## Family G — Radical & Abstract (bold POV)

**G1 · Ma — Radical Emptiness** ☀️
Soul: almost nothing on screen; what remains is perfect. Palette: warm white `#F6F3EC`, one graphite, one accent dot.
Type: small precise mono/grotesk, enormous margins. Material: NO containers — alignment + whitespace only; one hairline max.
Steward: invisible until addressed; a dot pulses, then one line of text. Motion: fade from nothing, never slide. ×10: 90% intentional emptiness.

**G2 · Ember — Warm Terminal** 🌙 LIVE
Soul: a campfire in the dark; the steward glows like embers. Palette: warm near-black `#17140F`, warm-white, ember `#E07A3C`.
Type: calm mono + warm serif. Material: near-invisible panels; one glowing glass command bar at base.
Steward: the emotional center — a glowing ember panel that breathes. LIVE: ember glow pulse. Motion: line-by-line arrival. ×10: firelight dark mode, warm not cold.

**G3 · Monospace Void** 🌙
Soul: pure zen terminal, warm and infinite. Palette: void `#121110`, warm gray text `#B8B2A8`, single teal cursor.
Type: one beautiful mono, everything. Material: no chrome at all; text floating in void; a blinking cursor is the only ornament.
Steward: indistinguishable from you — same void, its text a shade warmer. Motion: cursor blink only. ×10: the whole app is one calm text field.

**G4 · Grid of Light** 🌙 LIVE
Soul: minimal dark with a faint living grid of light. Palette: black `#0B0C0E`, thin cyan grid `#3FA9A0` at 15%, white text.
Type: precise grotesk. Material: content floats over a subtle glowing grid; panels are grid-aligned voids. LIVE: grid pulses slowly.
Steward: the grid brightens around it. Motion: grid ripple on action. ×10: structure made of light, not surface.

**G5 · Particle Drift** 🌗 LIVE
Soul: slow dust motes in a sunbeam; meditative drift. Palette: warm dim `#EAE4D8` / dark, motes catching light.
Type: airy grotesk. Material: content barely-there; thousands of slow drifting motes are the atmosphere. LIVE: particle field.
Steward: motes gather toward it. Motion: drift + gather. ×10: the background is alive dust; UI is a whisper.

**G6 · Gradient Mesh Blob** 🌗 LIVE
Soul: a soft living mesh-gradient blob breathing behind everything. Palette: sage+peach+lilac mesh / dark twin.
Type: soft grotesk. Material: frosted cards over one big slow morphing mesh-gradient blob. LIVE: mesh morph.
Steward: sits at the blob's warm heart. Motion: blob breathe. ×10: one enormous living color-cloud as the entire world.

**G7 · Neon Zen** 🌙 LIVE
Soul: restrained synth calm — vaporwave with the volume way down. Palette: deep indigo `#191436`, soft magenta `#D18AD8`, teal glow.
Type: clean grotesk. Material: dark glass with thin neon rim-light; subtle scanline. LIVE: slow neon hue drift.
Steward: the warmest neon glow. Motion: hue breathe. ×10: neon as _calm_ not loud — the anti-cyberpunk.

---

## Coverage check

- **Light-primary:** A1 A2 A4 A5 A6 B1 B2 B3 B7 C3 C5 D1 D2 E1 E3 E4 F3 F4 G1 (19)
- **Dark-primary:** B4 C2 C4 D3 D4 D6 E2 E5 F2 F5 F6 G2 G3 G4 G7 (15)
- **Themed/either:** A3 B5 B6 C1 D5 G5 G6 (7) → both light+dark since we'll have themes
- **Living backgrounds:** A3 B2 B7 C1 C2 C3 C4 C5 D1 D2 D3 D4 D5 D6 E1 E2 E3 E4 E5 F1 F2 F3 F4 F5 F6 G2 G4 G5 G6 G7 (30)
- **Most literal metaphor:** C-family (water), E-family (nature), B2 (garden), D6 (candle)
- **Most abstract:** G1 G3 G4 G6, F4

40 total. Room to grow toward 100 later (each new world = one variant file). Recommended first build wave: the ⭐ set (C1, D4, F1, F2) + one from each family for breadth.
