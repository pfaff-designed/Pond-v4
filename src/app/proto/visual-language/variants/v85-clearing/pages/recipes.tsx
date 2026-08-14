'use client'

/**
 * v85 CLEARING — the "Recipes" page.
 *
 * One focal moment: the featured recipe's large serif title. Prose (intro, method)
 * is FLAT serif on paper — never a card. Only the structured bits (the ingredient
 * list, the recipe grid) sit in soft-shadow Cards. LIME appears exactly once ("Add
 * to grocery list"). RUST not at all. Sage ACCENT is the ambient tint — KindDots,
 * tags, the method numerals. Clicking a "Your recipes" card swaps the featured
 * recipe. Slow staggered rise on mount, honoured only where motion is welcome.
 */

import { useState } from 'react'
import {
  sans,
  serif,
  display,
  mono,
  INK,
  BODY,
  MUTED,
  FAINT,
  HAIR,
  ACCENT,
  LIME,
  LIME_INK,
  EASE,
  radius,
  kicker,
  Card,
  KindDot,
  Receipt,
} from '../ui'
import type { SurfaceCtx } from '../shell-types'

// ── seed data (inline; nothing imported from ../data) ────────────────────────

interface Recipe {
  id: string
  area: string
  tag: string
  title: string
  intro: string
  time: string
  serves: string
  difficulty: string
  note: string
  ingredients: [string, string][] // [item, quantity]
  method: string[]
}

const RECIPES: Recipe[] = [
  {
    id: 'ragu',
    area: 'health',
    tag: 'Sunday cook',
    title: 'Sunday ragù',
    intro:
      'The one worth the whole afternoon. Low and slow until the pork gives up entirely and the sauce turns the colour of old brick. Make double — Tuesday-you will be grateful.',
    time: '3 hr 20 min',
    serves: 'Serves 6',
    difficulty: 'Patient',
    note: 'Freezes beautifully in thirds.',
    ingredients: [
      ['Pork shoulder, diced', '900 g'],
      ['Pancetta, chopped', '120 g'],
      ['Whole peeled tomatoes', '2 tins'],
      ['Dry red wine', '250 ml'],
      ['Yellow onion, soffritto', '1 large'],
      ['Carrot + celery, fine', '1 each'],
      ['Whole milk', '150 ml'],
      ['Bay, salt, black pepper', 'to taste'],
    ],
    method: [
      'Brown the pork hard in batches — crowd the pan and you steam it. Set aside.',
      'Soften the soffritto with the pancetta until sweet, about 12 minutes on low.',
      'Deglaze with the wine, scrape the fond, and let it reduce by half.',
      'Return the pork, add tomatoes and bay, then barely simmer — a lazy blip — for three hours.',
      'Finish with the milk in the last twenty minutes. Season, rest, toss through pappardelle.',
    ],
  },
  {
    id: 'carbload',
    area: 'health',
    tag: 'Marathon fuel',
    title: 'Tempo-night pasta',
    intro:
      'The night-before-a-long-run plate: gentle on the gut, generous on the glycogen. Nothing acidic, nothing heavy — just clean carbs and a little salt to hold water.',
    time: '25 min',
    serves: 'Serves 2',
    difficulty: 'Easy',
    note: 'Skip the chilli the night before a race.',
    ingredients: [
      ['Dried spaghetti', '250 g'],
      ['Good olive oil', '3 tbsp'],
      ['Garlic, sliced thin', '3 cloves'],
      ['Parmesan, grated', '40 g'],
      ['Flat parsley', 'small handful'],
      ['Sea salt', 'generous'],
    ],
    method: [
      'Salt the water like the sea and boil the pasta a minute shy of the box.',
      'Warm the oil and garlic gently — pale gold, never brown.',
      'Toss the drained pasta through with a ladle of starchy water.',
      'Off the heat, fold in the parmesan and parsley until glossy. Eat early, sleep well.',
    ],
  },
  {
    id: 'oatmeal',
    area: 'health',
    tag: 'Morning fuel',
    title: 'Race-morning oats',
    intro:
      'Two hours before the gun. Warm, plain, and predictable — the whole point is that your stomach already knows it.',
    time: '10 min',
    serves: 'Serves 1',
    difficulty: 'Easy',
    note: 'Banana in, coffee alongside.',
    ingredients: [
      ['Rolled oats', '80 g'],
      ['Whole milk + water', '300 ml'],
      ['Banana, sliced', '1'],
      ['Honey', '1 tbsp'],
      ['Pinch of salt', '—'],
    ],
    method: [
      'Simmer oats in the milk and water, stirring, until just creamy.',
      'Stir the honey and salt through off the heat.',
      'Top with banana. Eat slowly, then let it settle before you lace up.',
    ],
  },
  {
    id: 'smoothie',
    area: 'health',
    tag: 'Recovery',
    title: 'Recovery smoothie',
    intro:
      'The thirty-minute window. Carbs and protein cold and fast, before the legs seize up and the appetite disappears.',
    time: '5 min',
    serves: 'Serves 1',
    difficulty: 'Blitz',
    note: 'Frozen fruit = no ice needed.',
    ingredients: [
      ['Frozen berries', '150 g'],
      ['Banana', '1'],
      ['Greek yoghurt', '150 g'],
      ['Whey or milk', '250 ml'],
      ['Oats', '30 g'],
      ['Honey', '1 tsp'],
    ],
    method: [
      'Load everything into the blender, softest first.',
      'Blitz until smooth — thin with milk if it stalls.',
      'Drink within the hour. Refill your water while you are up.',
    ],
  },
  {
    id: 'chicken',
    area: 'wood',
    tag: 'Dinner',
    title: 'Sunday roast chicken',
    intro:
      'Salt it the night before, roast it hot, let it rest longer than feels reasonable. The rest of the week eats off the carcass.',
    time: '1 hr 30 min',
    serves: 'Serves 4',
    difficulty: 'Steady',
    note: 'Save the bones for stock.',
    ingredients: [
      ['Whole chicken', '1.6 kg'],
      ['Butter, softened', '40 g'],
      ['Lemon, halved', '1'],
      ['Garlic head', '1'],
      ['Thyme + bay', 'a few sprigs'],
      ['Flaky salt', 'the night before'],
    ],
    method: [
      'Dry-brine overnight, uncovered, in the fridge for crackling skin.',
      'Rub with butter, stuff with lemon and garlic, and truss loosely.',
      'Roast hot until the juices run clear at the thigh.',
      'Rest twenty minutes under foil. Carve, spoon over the pan juices.',
    ],
  },
  {
    id: 'sourdough',
    area: 'reading',
    tag: 'Weekend bake',
    title: 'Weekend sourdough',
    intro:
      'Mostly waiting, a little folding. Start Friday night, bake Saturday, and let the house smell like something worth staying home for.',
    time: '24 hr (mostly rest)',
    serves: 'One loaf',
    difficulty: 'Slow',
    note: 'Feed the starter the night before.',
    ingredients: [
      ['Bread flour', '450 g'],
      ['Active starter', '100 g'],
      ['Water', '330 ml'],
      ['Fine salt', '9 g'],
    ],
    method: [
      'Mix flour and water; autolyse an hour. Add starter and salt.',
      'Stretch-and-fold four times over the first two hours, then bulk overnight.',
      'Shape, cold-proof, and score.',
      'Bake in a hot Dutch oven — lid on, then off — until deep and hollow-sounding.',
    ],
  },
]

// The "Cook next" hairline queue.
const QUEUE: [string, string][] = [
  ['Tue', 'Tempo-night pasta'],
  ['Thu', 'Sunday roast chicken'],
  ['Sat', 'Weekend sourdough'],
]

// ── mount stagger + reduced-motion ───────────────────────────────────────────

function Rise({ i, children, style }: { i: number; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        animation: `clearing-rise 560ms ${EASE} both`,
        animationDelay: `${i * 70}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ ...kicker, marginBottom: 16 }}>{children}</div>
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function Recipes(ctx: SurfaceCtx) {
  const { askPond } = ctx

  const [featuredId, setFeaturedId] = useState<string>('ragu')
  const featured = RECIPES.find((r) => r.id === featuredId) ?? RECIPES[0]
  const rest = RECIPES.filter((r) => r.id !== featured.id)

  let ri = 0

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent' }}>
      <style>{`
        @keyframes clearing-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-clearing] * { animation: none !important; }
        }
      `}</style>

      <div
        data-clearing
        style={{
          maxWidth: 820,
          margin: '0 auto',
          padding: '30px 32px 156px',
          fontFamily: sans,
        }}
      >
        {/* ── 1 · Header — ONE focal serif numeral (recipe count), matching the
              archetype every module-page uses ─────────────────────────────── */}
        <Rise i={ri++}>
          <div style={{ ...kicker, fontSize: 11, color: FAINT }}>Recipes</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 10 }}>
            <span
              style={{
                fontFamily: display,
                fontSize: 96,
                lineHeight: 0.82,
                color: INK,
                letterSpacing: '-0.02em',
              }}
            >
              {RECIPES.length}
            </span>
            <span style={{ fontFamily: serif, fontSize: 21, lineHeight: 1.35, color: BODY, maxWidth: 280, paddingBottom: 8 }}>
              recipes you actually cook.
            </span>
          </div>
        </Rise>

        {/* ── 2 · Featured recipe (a labeled section, not a second hero) ───── */}
        <div style={{ marginTop: 50 }}>
          <Rise i={ri++} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <KindDot area={featured.area} />
            <span style={{ ...kicker, color: MUTED }}>Featured · {featured.tag}</span>
          </Rise>

          {/* the featured title — secondary to the count hero above */}
          <Rise i={ri++}>
            <h2
              style={{
                margin: 0,
                fontFamily: display,
                fontSize: 44,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                color: INK,
                fontWeight: 400,
              }}
            >
              {featured.title}
            </h2>
          </Rise>

          {/* Warm serif intro — FLAT on paper, no card. */}
          <Rise i={ri++}>
            <p
              style={{
                margin: '20px 0 0',
                fontFamily: serif,
                fontSize: 19,
                lineHeight: 1.55,
                color: BODY,
                maxWidth: 620,
              }}
            >
              {featured.intro}
            </p>
          </Rise>

          {/* Meta line — mono. */}
          <Rise
            i={ri++}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 20,
              fontFamily: mono,
              fontSize: 11.5,
              letterSpacing: '0.04em',
              color: MUTED,
            }}
          >
            <span>{featured.time}</span>
            <span style={{ color: FAINT }}>·</span>
            <span>{featured.serves}</span>
            <span style={{ color: FAINT }}>·</span>
            <span>{featured.difficulty}</span>
          </Rise>

          {/* Two-column body: ingredients Card | method flat prose. */}
          <Rise
            i={ri++}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 0.85fr) 1.15fr',
              gap: 34,
              marginTop: 34,
              alignItems: 'start',
            }}
          >
            {/* LEFT — ingredients in a soft-shadow Card, hairline rows. */}
            <Card style={{ padding: '20px 22px' }}>
              <div style={{ ...kicker, marginBottom: 14 }}>Ingredients</div>
              {featured.ingredients.map(([item, qty], idx) => (
                <div
                  key={item}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 14,
                    padding: '10px 0',
                    borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                  }}
                >
                  <span style={{ fontSize: 14, color: INK, lineHeight: 1.35 }}>{item}</span>
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: 11.5,
                      color: FAINT,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {qty}
                  </span>
                </div>
              ))}
            </Card>

            {/* RIGHT — method as numbered flat serif prose, sage display numerals. */}
            <div>
              <div style={{ ...kicker, marginBottom: 16 }}>Method</div>
              {featured.method.map((step, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    gap: 16,
                    marginBottom: idx === featured.method.length - 1 ? 0 : 20,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      fontFamily: display,
                      fontSize: 24,
                      lineHeight: 1,
                      color: ACCENT,
                      flexShrink: 0,
                      width: 22,
                    }}
                  >
                    {idx + 1}
                  </span>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: serif,
                      fontSize: 16.5,
                      lineHeight: 1.6,
                      color: BODY,
                    }}
                  >
                    {step}
                  </p>
                </div>
              ))}

              {/* The single LIME CTA. */}
              <button
                onClick={() =>
                  askPond(`Add the ingredients for ${featured.title} to my grocery list`)
                }
                style={{
                  appearance: 'none',
                  cursor: 'pointer',
                  border: 'none',
                  borderRadius: radius.pill,
                  padding: '10px 20px',
                  marginTop: 26,
                  background: LIME,
                  color: LIME_INK,
                  fontFamily: sans,
                  fontSize: 13,
                  fontWeight: 600,
                  transition: `transform 200ms ${EASE}`,
                }}
              >
                Add to grocery list
              </button>
            </div>
          </Rise>
        </div>

        {/* ── 3 · Your recipes — responsive grid of Cards ─────────────────── */}
        <div style={{ marginTop: 64 }}>
          <Rise i={ri++}>
            <GroupLabel>Your recipes</GroupLabel>
          </Rise>
          <Rise
            i={ri++}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
              gap: 16,
            }}
          >
            {rest.map((r) => (
              <RecipeCard key={r.id} recipe={r} onClick={() => setFeaturedId(r.id)} />
            ))}
          </Rise>
        </div>

        {/* ── 4 · Cook next — hairline queue ──────────────────────────────── */}
        <div style={{ marginTop: 64 }}>
          <Rise i={ri++}>
            <GroupLabel>Cook next</GroupLabel>
          </Rise>
          {QUEUE.map(([day, meal], idx) => (
            <Rise key={meal} i={ri++}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 16,
                  padding: '13px 0',
                  borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                }}
              >
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 11.5,
                    letterSpacing: '0.06em',
                    color: MUTED,
                    width: 34,
                    flexShrink: 0,
                  }}
                >
                  {day}
                </span>
                <span style={{ fontFamily: serif, fontSize: 16, color: INK }}>{meal}</span>
              </div>
            </Rise>
          ))}
        </div>

        {/* ── 5 · Receipt — this week ─────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 56, maxWidth: 360 }}>
          <Receipt
            title="This week"
            rows={[
              ['Meals cooked', '6'],
              ['New recipes', '1'],
              ['Avg time', '48 min'],
              ['Groceries linked', 'Yes'],
            ]}
          />
        </Rise>
      </div>
    </div>
  )
}

// ── a "Your recipes" card — clicking swaps the featured recipe ────────────────

function RecipeCard({ recipe, onClick }: { recipe: Recipe; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <Card
      onClick={onClick}
      style={{
        padding: '16px 18px',
        cursor: 'pointer',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        transition: `transform 220ms ${EASE}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <KindDot area={recipe.area} />
        <span style={{ ...kicker, color: MUTED }}>{recipe.tag}</span>
      </div>
      <div
        style={{
          fontFamily: serif,
          fontSize: 20,
          lineHeight: 1.15,
          color: INK,
        }}
      >
        {recipe.title}
      </div>
      <div
        style={{
          fontFamily: mono,
          fontSize: 11,
          letterSpacing: '0.04em',
          color: FAINT,
        }}
      >
        {recipe.time} · {recipe.serves}
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.45,
          color: MUTED,
          marginTop: 2,
          paddingTop: 10,
          borderTop: `1px solid ${HAIR}`,
        }}
      >
        {recipe.note}
      </div>
      <span
        aria-hidden
        style={{
          fontFamily: mono,
          fontSize: 14,
          color: hover ? ACCENT : FAINT,
          alignSelf: 'flex-end',
          marginTop: 2,
          transition: `color 220ms ${EASE}`,
        }}
      >
        ›
      </span>
    </Card>
  )
}
