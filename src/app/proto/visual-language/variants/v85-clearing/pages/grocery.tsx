'use client'

/**
 * v85 CLEARING — the "Grocery List" page.
 *
 * A calm, full checkable list. ONE focal element: an oversized Instrument-Serif
 * numeral = the count of things still to get, updating live as items are checked.
 * The list groups by aisle under mono kickers over hairline-separated rows. LIME
 * appears exactly once as a button (Add) and as the checkbox "checked" fill; RUST
 * is a single "running low" punctuation dot; sage ACCENT stays ambient. Gentle
 * staggered rise on mount, honoured only where motion is welcome.
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
  LINE,
  HAIR,
  ACCENT,
  LIME,
  LIME_INK,
  RUST,
  DONE,
  DONE_INK,
  EASE,
  radius,
  kicker,
  Receipt,
} from '../ui'
import type { SurfaceCtx } from '../shell-types'

interface Item {
  id: string
  name: string
  note: string
  done: boolean
}

interface Group {
  aisle: string
  items: Item[]
}

/** Seed list — grouped by aisle. Marathon oats, real dinners, coffee, wood-shop. */
const SEED: Group[] = [
  {
    aisle: 'Produce',
    items: [
      { id: 'p1', name: 'Bananas', note: 'bunch of 6', done: true },
      { id: 'p2', name: 'Spinach', note: 'for omelettes', done: false },
      { id: 'p3', name: 'Lemons', note: '×4', done: false },
      { id: 'p4', name: 'Garlic', note: '', done: false },
    ],
  },
  {
    aisle: 'Dairy & Eggs',
    items: [
      { id: 'd1', name: 'Eggs', note: 'two dozen', done: true },
      { id: 'd2', name: 'Whole milk', note: '', done: false },
      { id: 'd3', name: 'Parmesan', note: 'wedge, for pasta', done: false },
    ],
  },
  {
    aisle: 'Pantry',
    items: [
      { id: 'n1', name: 'Rolled oats', note: 'the big bag', done: false },
      { id: 'n2', name: 'Pasta', note: '×3 · tempo-week', done: false },
      { id: 'n3', name: 'Olive oil', note: '', done: false },
      { id: 'n4', name: 'Coffee beans', note: 'the darker roast', done: false },
    ],
  },
  {
    aisle: 'Meat & Fish',
    items: [
      { id: 'm1', name: 'Chicken thighs', note: '2 lb', done: false },
      { id: 'm2', name: 'Salmon', note: 'two fillets', done: false },
    ],
  },
  {
    aisle: 'Frozen',
    items: [
      { id: 'f1', name: 'Peas', note: '', done: true },
      { id: 'f2', name: 'Berries', note: 'for the oats', done: false },
    ],
  },
  {
    aisle: 'Household',
    items: [
      { id: 'h1', name: 'Wood glue', note: 'for the shelf', done: false },
      { id: 'h2', name: 'Sandpaper', note: '220 grit', done: false },
    ],
  },
]

/** Pantry staples running low at home — one RUST dot on the most urgent. */
const RUNNING_LOW: { name: string; note: string; urgent?: boolean }[] = [
  { name: 'Salt', note: 'nearly out', urgent: true },
  { name: 'Honey', note: 'one spoon left' },
  { name: 'Dish soap', note: 'getting low' },
]

/** Small round check control — empty ring → LIME filled check. */
function Check({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={done}
      style={{
        width: 22,
        height: 22,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: radius.pill,
        border: done ? `1px solid ${DONE}` : `1.5px solid ${LINE}`,
        background: done ? DONE : 'transparent',
        cursor: 'pointer',
        padding: 0,
        transition: `background 220ms ${EASE}, border-color 220ms ${EASE}`,
      }}
    >
      <svg
        width={12}
        height={12}
        viewBox="0 0 12 12"
        fill="none"
        style={{
          opacity: done ? 1 : 0,
          transform: done ? 'scale(1)' : 'scale(0.6)',
          transition: `opacity 220ms ${EASE}, transform 220ms ${EASE}`,
        }}
      >
        <path d="M2.5 6.2 L5 8.6 L9.5 3.6" stroke={DONE_INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export default function Grocery(_ctx: SurfaceCtx) {
  void _ctx
  const [groups, setGroups] = useState<Group[]>(SEED)

  const toggle = (gi: number, id: string) =>
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gi ? { ...g, items: g.items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)) } : g,
      ),
    )

  const all = groups.flatMap((g) => g.items)
  const left = all.filter((it) => !it.done).length
  const total = all.length

  // Rise-on-mount: assign an incrementing index across all rendered blocks.
  let rise = 0
  const nextRise = () => rise++

  const rowNote: React.CSSProperties = {
    fontFamily: mono,
    fontSize: 11,
    color: FAINT,
    flexShrink: 0,
    letterSpacing: '0.01em',
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent' }}>
      <style>{`
        @keyframes grocery-rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .grc-rise { animation: grocery-rise 560ms ${EASE} both }
        @media (prefers-reduced-motion: reduce) { .grc-rise { animation: none !important } }
      `}</style>

      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '30px 32px 156px',
          fontFamily: sans,
        }}
      >
        {/* ── Header: kicker + focal numeral + serif caption */}
        <header className="grc-rise" style={{ animationDelay: `${nextRise() * 70}ms`, marginBottom: 40 }}>
          <div style={{ ...kicker, marginBottom: 14 }}>Grocery · Whole Foods · Sunday</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
            <span
              style={{
                fontFamily: display,
                fontSize: 108,
                lineHeight: 0.86,
                color: INK,
                fontFeatureSettings: '"tnum" 1',
              }}
            >
              {left}
            </span>
            <div style={{ paddingBottom: 12 }}>
              <div style={{ fontFamily: serif, fontSize: 22, color: BODY, lineHeight: 1.2 }}>things to get.</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: FAINT, marginTop: 6, letterSpacing: '0.04em' }}>
                {total - left} of {total} in the cart
              </div>
            </div>
          </div>
        </header>

        {/* ── The list, grouped by aisle */}
        {groups.map((g, gi) => (
          <section
            key={g.aisle}
            className="grc-rise"
            style={{ animationDelay: `${nextRise() * 70}ms`, marginBottom: 30 }}
          >
            <div style={{ ...kicker, marginBottom: 10 }}>{g.aisle}</div>
            <div>
              {g.items.map((it, ii) => (
                <div
                  key={it.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '13px 2px',
                    borderTop: ii === 0 ? 'none' : `1px solid ${HAIR}`,
                  }}
                >
                  <Check done={it.done} onClick={() => toggle(gi, it.id)} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: sans,
                      fontSize: 16,
                      color: it.done ? MUTED : INK,
                      textDecorationLine: it.done ? 'line-through' : 'none',
                      textDecorationColor: FAINT,
                      transition: `color 220ms ${EASE}`,
                    }}
                  >
                    {it.name}
                  </span>
                  {it.note && <span style={rowNote}>{it.note}</span>}
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* ── Add item: borderless input + one LIME button */}
        <section
          className="grc-rise"
          style={{ animationDelay: `${nextRise() * 70}ms`, marginBottom: 44 }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 2px',
              borderTop: `1px solid ${HAIR}`,
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                flexShrink: 0,
                borderRadius: radius.pill,
                border: `1.5px dashed ${LINE}`,
              }}
            />
            <input
              type="text"
              placeholder="Add an item…"
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontFamily: sans,
                fontSize: 16,
                color: INK,
                padding: 0,
              }}
            />
            <button
              style={{
                flexShrink: 0,
                fontFamily: sans,
                fontSize: 13,
                fontWeight: 600,
                color: LIME_INK,
                background: LIME,
                border: 'none',
                borderRadius: radius.pill,
                padding: '7px 16px',
                cursor: 'pointer',
                transition: `transform 200ms ${EASE}, opacity 200ms ${EASE}`,
              }}
            >
              Add
            </button>
          </div>
        </section>

        {/* ── Running low at home — hairline mini-list, one RUST dot */}
        <section
          className="grc-rise"
          style={{ animationDelay: `${nextRise() * 70}ms`, marginBottom: 36 }}
        >
          <div style={{ ...kicker, marginBottom: 10 }}>Running low at home</div>
          <div>
            {RUNNING_LOW.map((r, ri) => (
              <div
                key={r.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 2px',
                  borderTop: ri === 0 ? 'none' : `1px solid ${HAIR}`,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    flexShrink: 0,
                    borderRadius: radius.pill,
                    background: r.urgent ? RUST : FAINT,
                  }}
                />
                <span style={{ flex: 1, minWidth: 0, fontFamily: sans, fontSize: 15, color: BODY }}>{r.name}</span>
                <span style={rowNote}>{r.note}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── This trip receipt */}
        <section
          className="grc-rise"
          style={{ animationDelay: `${nextRise() * 70}ms`, maxWidth: 340 }}
        >
          <Receipt
            title="This trip"
            rows={[
              ['items', String(total)],
              ['still to get', String(left)],
              ['store', 'Whole Foods'],
              ['est. total', '$96'],
              ['budget', '$120'],
            ]}
          />
        </section>
      </div>
    </div>
  )
}
