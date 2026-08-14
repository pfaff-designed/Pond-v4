/**
 * v85 CLEARING — seed content. Throwaway, deterministic (NO Math.random) so the
 * screenshots are stable. Reuses the shared proto seed in ../content where it can
 * and adds only what the four calm surfaces need (a real long-form reader doc, a
 * morning digest, an agenda tray, focus config).
 */

import { openPage, transcript, diffCard } from '../../content'
import type { Block, TreeNode } from '../../content'

export { openPage, transcript, diffCard }
export type { Block }

/**
 * v85 nav tree. Extends the shared slice with six MODULE-PAGES — pages that ARE
 * structured modules (they open a dedicated rich surface, not the Read renderer),
 * plus a new "Life" area. This is the page-as-module-spectrum in practice.
 */
export const tree: TreeNode[] = [
  {
    id: 'health',
    title: 'Health',
    type: 'area',
    children: [
      { id: 'marathon', title: 'Marathon Training', type: 'project', status: 'active' },
      { id: 'sleep', title: 'Sleep', type: 'routine' },
      { id: 'workout', title: 'Workout Routine', type: 'page' },
    ],
  },
  {
    id: 'work',
    title: 'Work',
    type: 'area',
    children: [
      { id: 'q3', title: 'Q3 Planning', type: 'project', status: 'active' },
      { id: 'ds', title: 'Design System', type: 'project' },
      { id: 'projects', title: 'Project Tracker', type: 'page' },
    ],
  },
  {
    id: 'life',
    title: 'Life',
    type: 'area',
    children: [
      { id: 'grocery', title: 'Grocery List', type: 'page' },
      { id: 'recipes', title: 'Recipes', type: 'page' },
      { id: 'finance', title: 'Finance', type: 'page' },
    ],
  },
  {
    id: 'wood',
    title: 'Woodworking',
    type: 'area',
    children: [{ id: 'shelf', title: 'Walnut Shelf', type: 'project' }],
  },
  {
    id: 'reading',
    title: 'Reading',
    type: 'area',
    children: [{ id: 'reading-list', title: 'Reading List', type: 'page' }],
  },
]

/** Ids that open a dedicated rich module-surface instead of the Read renderer. */
export const MODULE_PAGES = [
  'reading-list', 'grocery', 'recipes', 'finance', 'workout', 'projects',
  // Areas leaves promoted to real dashboards (kills the shared-essay dead-end):
  'sleep', 'shelf', 'q3', 'ds',
  // Portfolio-only projects (not tree leaves, reached via the Project Tracker roll-up):
  'mn', 'site',
] as const
export type ModulePageId = (typeof MODULE_PAGES)[number]
export const isModulePage = (id: string): id is ModulePageId =>
  (MODULE_PAGES as readonly string[]).includes(id)

/**
 * The single source of truth for "now", shared across every lens so Today, Plan
 * (Day) and the week window all agree on the same day. Deterministic seed date.
 */
export const NOW = {
  weekday: 'Thursday',
  weekdayShort: 'Thu',
  monthShort: 'Aug',
  monthLong: 'August',
  dayNum: 13,
  /** week window that contains dayNum (Mon 11 – Sun 17). */
  weekLabel: 'Week of Aug 11 — 17',
} as const
/** "THURSDAY · AUG 13" — the identical mono eyebrow every lens shows. */
export const TODAY_EYEBROW = `${NOW.weekday} · ${NOW.monthShort} ${NOW.dayNum}`

export const AREA_TITLE: Record<string, string> = {
  health: 'Health',
  work: 'Work',
  life: 'Life',
  wood: 'Woodworking',
  reading: 'Reading',
}

export interface Doc {
  area: string
  crumb: string[]
  title: string
  blocks: Block[]
}

/** Page id → document. Mirrors the Press DOCS map so every surface agrees. */
export const DOCS: Record<string, Doc> = {
  marathon: { area: 'health', crumb: openPage.breadcrumb, title: openPage.title, blocks: openPage.blocks },
  sleep: {
    area: 'health',
    crumb: ['Health', 'Sleep'],
    title: 'Sleep',
    blocks: [
      { id: 's1', type: 'metric', label: 'Avg sleep', value: '7.1', unit: 'hrs', trend: '+4%' },
      {
        id: 's2',
        type: 'todo',
        items: [
          { id: 'sa', label: 'No screens after 10pm', checked: true },
          { id: 'sb', label: 'Cooler bedroom', checked: false },
        ],
      },
    ],
  },
  q3: {
    area: 'work',
    crumb: ['Work', 'Q3 Planning'],
    title: 'Q3 Planning',
    blocks: [
      { id: 'q1', type: 'text', content: 'Ship the design-system tokens and one reference app by end of quarter. Depth over surface.' },
      { id: 'q2', type: 'metric', label: 'Milestones', value: '3/5', trend: 'on track' },
    ],
  },
  ds: {
    area: 'work',
    crumb: ['Work', 'Design System'],
    title: 'Design System',
    blocks: [{ id: 'd1', type: 'text', content: 'One token layer, calmly enforced. Every component earns its place or it leaves.' }],
  },
  shelf: {
    area: 'wood',
    crumb: ['Woodworking', 'Walnut Shelf'],
    title: 'Walnut Shelf',
    blocks: [
      { id: 'w1', type: 'text', content: 'Floating walnut shelf for the entryway. Hidden French cleat, hand-rubbed oil finish.' },
      { id: 'w2', type: 'metric', label: 'Board feet', value: '6.5', unit: 'bf' },
    ],
  },
  reading: {
    area: 'reading',
    crumb: ['Reading'],
    title: 'Reading',
    blocks: [{ id: 'r1', type: 'text', content: 'Slow reading, kept close. A page a night is still a book a season.' }],
  },
}

export const firstPageOf = (areaId: string) => tree.find((a) => a.id === areaId)?.children?.[0]?.id ?? areaId

/** Flat list of navigable pages (id, title, area) for the palette + focus picker. */
export interface PageRef {
  id: string
  title: string
  area: string
}
export const PAGES: PageRef[] = tree.flatMap((a) =>
  a.children?.length
    ? a.children.map((c) => ({ id: c.id, title: c.title, area: a.id }))
    : [{ id: a.id, title: a.title, area: a.id }],
)

// ── READ surface: a real long-form document, pre-split to sentences ───────────
export interface Sentence {
  sid: string
  text: string
}
export interface Section {
  hid: string
  heading: string
  sentences: Sentence[]
}
export interface ReaderDoc {
  area: string
  crumb: string[]
  kicker: string
  title: string
  standfirst: string
  minutes: number
  sections: Section[]
}

export const READER: ReaderDoc = {
  area: 'health',
  crumb: ['Health', 'Marathon Training'],
  kicker: 'Training note',
  title: 'The quiet build to sub-4:00',
  standfirst: 'A marathon is not won in the loud weeks. It is won in the easy ones, kept genuinely easy.',
  minutes: 4,
  sections: [
    {
      hid: 'h-intent',
      heading: 'The intent',
      sentences: [
        { sid: 's1', text: 'The goal is sub-4:00 at the October marathon, and the plan that gets there is almost embarrassingly plain.' },
        { sid: 's2', text: 'Long runs on Sunday, tempo intervals on Tuesday, and everything else run slow enough to hold a conversation.' },
        { sid: 's3', text: 'The discipline is not in the hard days — those take care of themselves — it is in keeping the easy days genuinely easy.' },
        { sid: 's4', text: 'Most plans fail not from too little effort but from too much of it, spent on the wrong days.' },
      ],
    },
    {
      hid: 'h-week',
      heading: 'The shape of a week',
      sentences: [
        { sid: 's5', text: 'Last week logged 38 miles, up about twelve percent, which is a healthy build rather than a heroic one.' },
        { sid: 's6', text: 'The instinct now is to add volume; the better move is to hold mileage steady and sharpen the Tuesday tempo.' },
        { sid: 's7', text: 'Goal pace needs repetition more than it needs raw distance, and repetition is a patience problem, not a fitness one.' },
        { sid: 's8', text: 'Sleep is the silent training partner — seven hours is the floor, and the cooler bedroom is worth more than it looks.' },
      ],
    },
    {
      hid: 'h-race',
      heading: 'Rehearsing race day',
      sentences: [
        { sid: 's9', text: 'Nutrition is rehearsed, not improvised: practice the race-day gels on the Sunday long run, 220 kilocalories every 45 minutes.' },
        { sid: 's10', text: 'Alternate caffeine and plain, sip water at every mile marker, and let the stomach learn the rhythm before it matters.' },
        { sid: 's11', text: 'By October nothing on race morning should be new — not the shoes, not the fuel, not the pace of the first quiet mile.' },
        { sid: 's12', text: 'A good race feels like a familiar Sunday that simply went a little further than usual.' },
      ],
    },
  ],
}

/** Pond's ambient margin observations, anchored to sentences. */
export interface AmbientNote {
  id: string
  sid: string
  text: string
}
export const AMBIENT_NOTES: AmbientNote[] = [
  { id: 'an1', sid: 's3', text: 'You said this three weeks running. It seems to be the real lever for you.' },
  { id: 'an2', sid: 's6', text: 'Your last two build weeks both stalled the week after a mileage jump.' },
  { id: 'an3', sid: 's9', text: 'Want me to turn this into a race-day fuel checklist?' },
]

// ── TODAY surface: morning digest (summary → affordance → proof) ──────────────
export interface DigestItem {
  id: string
  kind: 'changed' | 'due' | 'suggestion'
  page: string
  area: string
  label: string
  detail: string
}
export const DIGEST: DigestItem[] = [
  { id: 'g1', kind: 'due', page: 'marathon', area: 'health', label: '16-mile long run', detail: 'Sunday · the week’s anchor session' },
  { id: 'g2', kind: 'due', page: 'q3', area: 'work', label: 'Design-system tokens', detail: 'Milestone 4 of 5 · on track' },
  { id: 'g3', kind: 'due', page: 'marathon', area: 'health', label: 'Book a sports massage', detail: 'Carried over from last week' },
  { id: 'g4', kind: 'changed', page: 'sleep', area: 'health', label: 'Sleep held at 7.1 hrs', detail: 'Up 4% — the cooler bedroom is working' },
  { id: 'g5', kind: 'changed', page: 'shelf', area: 'wood', label: 'Walnut Shelf — 6.5 board feet milled', detail: 'Ready for the French cleat' },
]
export const SUGGESTION = {
  page: 'marathon',
  area: 'health',
  text: 'Hold mileage steady this week and sharpen Tuesday’s tempo. Your goal pace needs the repetition more than more volume.',
}

// ── PLAN surface: agenda tray + hours ─────────────────────────────────────────
export interface TrayItem {
  id: string
  label: string
  area: string
  mins: number
}
export const TRAY: TrayItem[] = [
  { id: 'p1', label: '16-mile long run', area: 'health', mins: 150 },
  { id: 'p2', label: 'Tempo intervals', area: 'health', mins: 60 },
  { id: 'p3', label: 'Design-system tokens', area: 'work', mins: 90 },
  { id: 'p4', label: 'Q3 planning review', area: 'work', mins: 45 },
  { id: 'p5', label: 'Walnut Shelf — glue-up', area: 'wood', mins: 60 },
]
/** Where "Plan my day" lays things down (calm, non-colliding). */
export const PLAN_HOURS: Record<string, number> = { p1: 7, p2: 17, p3: 10, p4: 14, p5: 16 }
export const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
export const NOW_HOUR = 9
export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** A believable week overview (day → item labels). */
export const WEEK_PLACED: Record<string, { label: string; area: string }[]> = {
  Mon: [{ label: 'Easy 5', area: 'health' }],
  Tue: [{ label: 'Tempo intervals', area: 'health' }, { label: 'Q3 review', area: 'work' }],
  Wed: [{ label: 'Design tokens', area: 'work' }],
  Thu: [{ label: 'Easy 6', area: 'health' }, { label: 'Shelf glue-up', area: 'wood' }],
  Fri: [{ label: 'Rest', area: 'reading' }],
  Sat: [{ label: 'Shakeout 3', area: 'health' }],
  Sun: [{ label: '16-mile long run', area: 'health' }],
}

// ── NOTIFICATIONS: a reverse-chronological feed of Pond activity ──────────────
/**
 * The Notifications drawer is a timeline of what Pond noticed, quietly changed,
 * or is proposing. Reverse-chronological, day-grouped. Deterministic seed (no
 * wall-clock) so screenshots stay stable. The 'proposed' entry carries the
 * diffCard and keeps its inline Accept/Later.
 */
export type ActivityType = 'noticed' | 'changed' | 'proposed'
export interface ActivityItem {
  id: string
  day: 'Today' | 'Yesterday' | 'Earlier'
  time: string // mono relative stamp
  type: ActivityType
  area: string
  line: string
  /** Only the 'proposed' entry sets this — it renders the diff + Accept/Later. */
  proposal?: boolean
}
export const ACTIVITY: ActivityItem[] = [
  { id: 'a1', day: 'Today', time: '9:12a', type: 'proposed', area: 'health', line: 'A race-day fuel edit for Marathon Training', proposal: true },
  { id: 'a2', day: 'Today', time: '8:40a', type: 'changed', area: 'health', line: 'Sleep held at 7.1 hrs, up 4% on last week' },
  { id: 'a3', day: 'Today', time: '7:05a', type: 'noticed', area: 'life', line: 'Dining is $48 over budget this month' },
  { id: 'a4', day: 'Yesterday', time: '6:20p', type: 'changed', area: 'wood', line: 'Walnut Shelf — 6.5 board feet milled, ready for the cleat' },
  { id: 'a5', day: 'Yesterday', time: '4:12p', type: 'noticed', area: 'work', line: 'Design System — Storybook coverage slipped to at-risk' },
  { id: 'a6', day: 'Yesterday', time: '11:30a', type: 'changed', area: 'work', line: 'Q3 roadmap outline blocked out' },
  { id: 'a7', day: 'Earlier', time: 'Sun', type: 'noticed', area: 'health', line: 'Your last two build weeks stalled after a mileage jump' },
  { id: 'a8', day: 'Earlier', time: 'Sat', type: 'changed', area: 'reading', line: 'Logged 42 pages of Daniels’ Running Formula' },
]

// ── FOCUS surface: session config ─────────────────────────────────────────────
export const DURATIONS = [25, 50, 90]
export interface Protocol {
  id: string
  label: string
  done: boolean
}
export const PROTOCOLS: Protocol[] = [
  { id: 'pr1', label: 'Notifications silenced', done: true },
  { id: 'pr2', label: 'Water within reach', done: true },
  { id: 'pr3', label: 'One tab, one page', done: false },
  { id: 'pr4', label: 'Phone in the other room', done: false },
]
