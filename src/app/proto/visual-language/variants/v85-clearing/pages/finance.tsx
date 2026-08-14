'use client'

/**
 * v85 CLEARING — the "Finance" page.
 *
 * One focal element: an oversized Instrument-Serif numeral = "Safe to spend" this
 * month. Everything else recedes into air, hairlines, and mono. Charts are calm:
 * a sage Ring of budget used, a sage Spark of daily spend. Category bars are thin
 * hairline-track bars with sage fill — exactly ONE over-budget bar carries RUST,
 * the page's single note of alarm. LIME appears once (Log expense). Gentle staggered
 * rise on mount, honoured only where motion is welcome.
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
  RUST,
  LIME,
  LIME_INK,
  EASE,
  radius,
  kicker,
  Card,
  Ring,
  Spark,
  Receipt,
  Segmented,
} from '../ui'
import type { SurfaceCtx } from '../shell-types'

/** Staggered rise-on-mount wrapper. index drives the delay. */
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

/** A small group heading — mono kicker over a hairline of air. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ ...kicker, marginBottom: 14 }}>{children}</div>
}

interface Cat {
  label: string
  spent: number
  budget: number
}

const CATEGORIES: Cat[] = [
  { label: 'Rent', spent: 1850, budget: 1850 },
  { label: 'Groceries', spent: 412, budget: 500 },
  { label: 'Dining', spent: 268, budget: 220 }, // the single over-budget category
  { label: 'Running gear', spent: 96, budget: 140 },
  { label: 'Woodworking', spent: 184, budget: 300 },
  { label: 'Subscriptions', spent: 58, budget: 70 },
  { label: 'Savings', spent: 600, budget: 600 },
]

// Daily spend trend (deterministic — no Math.random).
const DAILY = [42, 18, 96, 24, 210, 60, 12, 148, 33, 88, 40, 176, 22, 64]

// ── net worth / assets ──────────────────────────────────────────────────────
interface Account {
  label: string
  kind: 'Checking' | 'Savings' | 'Investments'
  balance: number
}
const ACCOUNTS: Account[] = [
  { label: 'Everyday checking', kind: 'Checking', balance: 4820 },
  { label: 'Emergency fund', kind: 'Savings', balance: 12400 },
  { label: 'House down-payment', kind: 'Savings', balance: 18650 },
  { label: 'Brokerage — index', kind: 'Investments', balance: 41280 },
  { label: 'Roth IRA', kind: 'Investments', balance: 22940 },
]
// net worth over the last 8 months — the spark
const NET_WORTH = [78200, 81400, 83900, 85100, 88600, 91200, 96400, 100090]

interface Owned {
  label: string
  meta: string
  value: string
  n: number
}
const OWNED: Owned[] = [
  { label: 'Woodworking tools', meta: 'Track saw, planes, clamps', value: '$3,400', n: 3400 },
  { label: 'Running & race gear', meta: 'Watch, shoes rotation', value: '$1,150', n: 1150 },
  { label: 'Desk & standing setup', meta: 'Monitor, chair, keyboard', value: '$2,200', n: 2200 },
  { label: 'Bike', meta: 'Commuter + trainer', value: '$1,900', n: 1900 },
]
const OWNED_TOTAL = OWNED.reduce((s, o) => s + o.n, 0)
const fmtUsd = (n: number) => '$' + n.toLocaleString('en-US')

interface Txn {
  date: string
  merchant: string
  amount: string
  big?: boolean
}

const RECENT: Txn[] = [
  { date: '08·12', merchant: 'Blue Bottle Coffee', amount: '−$6.50' },
  { date: '08·11', merchant: 'Rockler Woodworking', amount: '−$184.00', big: true },
  { date: '08·10', merchant: 'Whole Foods', amount: '−$78.20' },
  { date: '08·09', merchant: 'Design retainer — Aria', amount: '+$3,200.00' },
  { date: '08·08', merchant: 'Bar Bianchi (dinner)', amount: '−$62.00' },
  { date: '08·06', merchant: 'Bandit Running', amount: '−$96.00' },
]

type MonthKey = 'jul' | 'aug'

export default function Finance(ctx: SurfaceCtx) {
  const { askPond } = ctx

  const [month, setMonth] = useState<MonthKey>('aug')
  void month // month toggle is ambient; the seed view is calm and singular.

  const budget = CATEGORIES.reduce((s, c) => s + c.budget, 0)
  const spent = CATEGORIES.reduce((s, c) => s + c.spent, 0)
  const usedPct = spent / budget
  const netWorth = ACCOUNTS.reduce((s, a) => s + a.balance, 0)

  let ri = 0

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent' }}>
      <style>{`
        @keyframes clearing-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes clearing-bar {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-clearing] * { animation: none !important; }
        }
      `}</style>

      <div
        data-clearing
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '30px 32px 156px',
          fontFamily: sans,
        }}
      >
        {/* ── Header: kicker · focal "Safe to spend" numeral · calm serif line ─ */}
        <Rise i={ri++} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ ...kicker, fontSize: 11, color: FAINT }}>Finance · August</div>
          <Segmented<MonthKey>
            value={month}
            onChange={setMonth}
            options={[
              { value: 'jul', label: 'July' },
              { value: 'aug', label: 'August' },
            ]}
          />
        </Rise>

        <Rise
          i={ri++}
          style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 30, marginBottom: 6 }}
        >
          <span
            style={{
              fontFamily: display,
              fontSize: 88,
              lineHeight: 0.84,
              color: INK,
              fontFeatureSettings: '"lnum" 1',
              letterSpacing: '-0.02em',
            }}
          >
            $2,480
          </span>
          <span style={{ fontFamily: serif, fontSize: 20, lineHeight: 1.35, color: BODY, maxWidth: 240, paddingBottom: 6 }}>
            safe to spend the rest of the month.
          </span>
        </Rise>

        <Rise i={ri++}>
          <div style={{ fontFamily: mono, fontSize: 11.5, color: MUTED, letterSpacing: '0.02em' }}>
            <span style={{ color: ACCENT }}>▲ $220</span> vs July · 18 days left
          </div>
        </Rise>

        {/* ── This month: ring of budget used + spark of daily spend + stats ── */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>This month</GroupLabel>
          </Rise>
          <Rise i={ri++}>
            <Card style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
              <Ring pct={usedPct} size={104} label={`${Math.round(usedPct * 100)}%`} sub="budget used" />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 200 }}>
                <div style={{ ...kicker, color: MUTED }}>Daily spend</div>
                <Spark data={DAILY} w={200} h={44} color={ACCENT} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: mono }}>
                <Stat k="spent" v={`$${spent.toLocaleString()}`} />
                <Stat k="income" v="$6,400" accent={ACCENT} />
                <Stat k="saved" v="$1,200" accent={ACCENT} />
              </div>
            </Card>
          </Rise>
        </div>

        {/* ── By category: thin hairline bars, sage fill, one RUST over-budget ─ */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>By category</GroupLabel>
          </Rise>
          <Rise i={ri++}>
            <Card style={{ padding: '8px 20px' }}>
              {CATEGORIES.map((c, idx) => {
                const over = c.spent > c.budget
                const frac = Math.min(1, c.spent / c.budget)
                return (
                  <div
                    key={c.label}
                    style={{
                      padding: '15px 0',
                      borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500, color: INK }}>
                        {c.label}
                        {over && (
                          <span
                            aria-hidden
                            style={{ width: 5, height: 5, borderRadius: 999, background: RUST, display: 'inline-block' }}
                          />
                        )}
                      </span>
                      <span style={{ fontFamily: mono, fontSize: 12, color: over ? RUST : MUTED }}>
                        ${c.spent.toLocaleString()}
                        <span style={{ color: FAINT }}> / ${c.budget.toLocaleString()}</span>
                      </span>
                    </div>
                    {/* hairline track + scaleX fill (never animate width) */}
                    <div style={{ position: 'relative', height: 4, borderRadius: 999, background: HAIR, overflow: 'hidden' }}>
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: `${frac * 100}%`,
                          borderRadius: 999,
                          background: over ? RUST : ACCENT,
                          transformOrigin: 'left',
                          animation: `clearing-bar 640ms ${EASE} both`,
                          animationDelay: `${140 + idx * 60}ms`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </Card>
          </Rise>
        </div>

        {/* ── Net worth: total over time + account balances + things owned ──── */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>Net worth</GroupLabel>
          </Rise>
          <Rise i={ri++}>
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* focal net-worth number + 8-month spark */}
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
                <div>
                  <div style={{ ...kicker, color: MUTED, marginBottom: 8 }}>Total net worth</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <span style={{ fontFamily: display, fontSize: 52, lineHeight: 0.9, color: INK, letterSpacing: '-0.02em' }}>
                      ${(netWorth / 1000).toFixed(1)}k
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 11.5, color: ACCENT }}>▲ $3.7k this month</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...kicker, color: MUTED, marginBottom: 8 }}>8 months</div>
                  <Spark data={NET_WORTH} w={200} h={46} color={ACCENT} />
                </div>
              </div>

              {/* account balances */}
              <div>
                <div style={{ ...kicker, marginBottom: 6 }}>Accounts</div>
                {ACCOUNTS.map((a, idx) => (
                  <div
                    key={a.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 0',
                      borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: INK }}>{a.label}</span>
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: FAINT,
                        width: 90,
                        textAlign: 'right',
                      }}
                    >
                      {a.kind}
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 12.5, color: BODY, width: 92, textAlign: 'right', flexShrink: 0 }}>
                      ${a.balance.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </Rise>
        </div>

        {/* ── Things I own — a simple assets list ───────────────────────────── */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>Things I own</GroupLabel>
          </Rise>
          {OWNED.map((o, idx) => (
            <Rise key={o.label} i={ri++}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '13px 0',
                  borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: INK }}>
                  {o.label}
                  <span style={{ display: 'block', fontFamily: sans, fontSize: 11.5, color: FAINT, marginTop: 2 }}>{o.meta}</span>
                </span>
                <span style={{ fontFamily: mono, fontSize: 12.5, color: BODY, flexShrink: 0 }}>{o.value}</span>
              </div>
            </Rise>
          ))}
          <Rise i={ri++}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 14,
                padding: '13px 0 0',
                borderTop: `1px solid ${LINE}`,
                marginTop: 2,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, ...kicker, color: MUTED }}>Assets subtotal</span>
              <span style={{ fontFamily: mono, fontSize: 13, color: INK, flexShrink: 0 }}>{fmtUsd(OWNED_TOTAL)}</span>
            </div>
            <div style={{ fontFamily: sans, fontSize: 11.5, color: FAINT, marginTop: 6 }}>
              Included in net worth ({fmtUsd(NET_WORTH[NET_WORTH.length - 1])})
            </div>
          </Rise>
        </div>

        {/* ── Recent: mono date · merchant · amount, hairline-separated ──────── */}
        <div style={{ marginTop: 48 }}>
          <Rise i={ri++}>
            <GroupLabel>Recent</GroupLabel>
          </Rise>
          {RECENT.map((t, idx) => (
            <Rise key={`${t.date}-${t.merchant}`} i={ri++}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '13px 0',
                  borderTop: idx === 0 ? 'none' : `1px solid ${HAIR}`,
                }}
              >
                <span style={{ fontFamily: mono, fontSize: 11.5, color: FAINT, width: 44, flexShrink: 0 }}>{t.date}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: INK, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t.merchant}
                  {t.big && (
                    <span
                      aria-hidden
                      style={{ width: 5, height: 5, borderRadius: 999, background: RUST, display: 'inline-block' }}
                    />
                  )}
                </span>
                <span style={{ fontFamily: mono, fontSize: 12.5, color: BODY, flexShrink: 0 }}>{t.amount}</span>
              </div>
            </Rise>
          ))}
        </div>

        {/* ── August receipt with the single LIME CTA anchored as its footer ─── */}
        <Rise i={ri++} style={{ marginTop: 48, maxWidth: 340 }}>
          <Receipt
            title="August"
            rows={[
              ['in', '$6,400.00'],
              ['out', '$3,920.00'],
              ['net', '+$2,480.00', ACCENT],
              ['saved', '$1,200.00', ACCENT],
            ]}
          />
          <div style={{ marginTop: 14 }}>
            <LogExpenseButton onClick={() => askPond('Log an expense…')} />
          </div>
        </Rise>

        {/* ── Closing serif exhale ──────────────────────────────────────────── */}
        <Rise i={ri++} style={{ marginTop: 46 }}>
          <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 20 }}>
            <span style={{ fontFamily: serif, fontSize: 14, fontStyle: 'italic', color: FAINT }}>
              You’re ahead of the month. Spend it well, or don’t.
            </span>
          </div>
        </Rise>
      </div>
    </div>
  )
}

/** A single mono summary stat: tiny mono key over an INK value. */
function Stat({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ ...kicker, color: FAINT }}>{k}</span>
      <span style={{ fontFamily: mono, fontSize: 15, color: accent || INK }}>{v}</span>
    </div>
  )
}

/** The one LIME primary action on the page. */
function LogExpenseButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        appearance: 'none',
        cursor: 'pointer',
        width: '100%',
        border: 'none',
        borderRadius: radius.pill,
        padding: '11px 22px',
        background: LIME,
        color: LIME_INK,
        fontFamily: sans,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: hover ? `0 4px 14px rgba(40,34,24,0.12)` : '0 1px 2px rgba(40,34,24,0.06)',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        transition: `transform 200ms ${EASE}, box-shadow 200ms ${EASE}`,
      }}
    >
      + Log expense
    </button>
  )
}
