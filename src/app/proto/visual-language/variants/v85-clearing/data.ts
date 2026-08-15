/**
 * v85 CLEARING — seed content. Throwaway, deterministic (NO Math.random) so the
 * screenshots are stable. This is the "full of data" cut: the nav collapses a whole
 * life-management system onto FIVE areas — Health · Professional · Finances ·
 * Creativity · Personal — with Life itself as the shell (Today reads across all
 * five). Most leaves are structured MODULE-PAGES (rich dashboards in ./pages), the
 * page-as-module-spectrum in practice.
 */

import { openPage, transcript, diffCard } from '../../content'
import type { Block, TreeNode } from '../../content'

export { openPage, transcript, diffCard }
export type { Block }

/**
 * v85 nav tree — five life areas. "Personal" carries one nested sub-area (Food) to
 * show the sub-grouping; the rail renders one extra level for any child that itself
 * has children. Every leaf id below is either a module-page (a dashboard in
 * ./pages) or the marathon reader doc.
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
    id: 'professional',
    title: 'Professional',
    type: 'area',
    children: [
      { id: 'q3', title: 'Q3 Planning', type: 'project', status: 'active' },
      { id: 'ds', title: 'Design System', type: 'project' },
      { id: 'projects', title: 'Projects', type: 'page' },
      { id: 'tasks', title: 'Tasks', type: 'page' },
    ],
  },
  {
    id: 'finances',
    title: 'Finances',
    type: 'area',
    children: [{ id: 'finance', title: 'Budget', type: 'page' }],
  },
  {
    id: 'creativity',
    title: 'Creativity',
    type: 'area',
    children: [
      { id: 'shelf', title: 'Walnut Shelf', type: 'project' },
      { id: 'wishlist', title: 'Wishlist', type: 'page' },
    ],
  },
  {
    id: 'personal',
    title: 'Personal',
    type: 'area',
    children: [
      {
        id: 'food',
        title: 'Food',
        type: 'area',
        children: [
          { id: 'recipes', title: 'Recipes', type: 'page' },
          { id: 'meals', title: 'Meal Plan', type: 'page' },
          { id: 'grocery', title: 'Groceries', type: 'page' },
        ],
      },
      { id: 'trips', title: 'My Trips', type: 'page' },
      { id: 'contacts', title: 'Contacts', type: 'page' },
      { id: 'library', title: 'Library', type: 'page' },
      { id: 'journal', title: 'Journal', type: 'page' },
    ],
  },
]

/** Ids that open a dedicated rich module-surface instead of the Read renderer. */
export const MODULE_PAGES = [
  // Area overview pages — each area IS a page (an at-a-glance of everything within):
  'health',
  'professional',
  'finances',
  'creativity',
  'personal',
  // Health
  'sleep',
  'workout',
  // Professional (q3/ds/projects share the project-tracker roll-up)
  'q3',
  'ds',
  'projects',
  'tasks',
  // Finances
  'finance',
  // Creativity
  'shelf',
  'wishlist',
  // Personal
  'recipes',
  'meals',
  'grocery',
  'trips',
  'contacts',
  'library',
  'journal',
  // Portfolio-only projects (reached by drilling into the Project Tracker roll-up):
  'mn',
  'site',
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
  professional: 'Professional',
  finances: 'Finances',
  creativity: 'Creativity',
  personal: 'Personal',
  food: 'Food',
}

/** Area overview: the "everything within, at a glance" page for each area.
 *  A focal number + a Pond read + a card per child page (each opens its own page). */
export interface AreaCard {
  page: string
  title: string
  stat: string
  sub: string
}
export interface AreaOverviewData {
  kicker: string
  focal: string
  focalCaption: string
  note: string
  cards: AreaCard[]
}
export const AREA_OVERVIEW: Record<string, AreaOverviewData> = {
  health: {
    kicker: 'Health · this week',
    focal: '38',
    focalCaption: 'miles this week — a healthy build, not a heroic one.',
    note: 'Sleep is holding and mileage is climbing gently. Keep the easy days easy.',
    cards: [
      {
        page: 'marathon',
        title: 'Marathon Training',
        stat: 'sub-4:00',
        sub: 'October · long run Sunday',
      },
      { page: 'sleep', title: 'Sleep', stat: '7.1 hrs', sub: '+4% · cooler bedroom is working' },
      {
        page: 'workout',
        title: 'Workout Routine',
        stat: '2×/wk',
        sub: 'strength · mobility off-days',
      },
    ],
  },
  professional: {
    kicker: 'Professional · Q3',
    focal: '13',
    focalCaption: 'open tasks · four due today.',
    note: 'Q3 is on track at three of five milestones; Design System is the one to watch.',
    cards: [
      { page: 'q3', title: 'Q3 Planning', stat: '3 / 5', sub: 'milestones · on track' },
      { page: 'ds', title: 'Design System', stat: 'At risk', sub: 'Storybook coverage slipped' },
      { page: 'tasks', title: 'Tasks', stat: '13 open', sub: '4 due today' },
      { page: 'projects', title: 'Projects', stat: '4 active', sub: 'the roll-up across work' },
    ],
  },
  finances: {
    kicker: 'Finances · August',
    focal: '$2,480',
    focalCaption: 'safe to spend the rest of the month.',
    note: 'Net worth is up $3.7k and you’re ahead of the month — dining is the only line over.',
    cards: [
      { page: 'finance', title: 'Budget', stat: '82% used', sub: 'dining $48 over' },
      { page: 'finance', title: 'Net worth', stat: '$100.1k', sub: '▲ $3.7k this month' },
      { page: 'finance', title: 'This month', stat: '+$2,480', sub: 'in $6,400 · saved $1,200' },
    ],
  },
  creativity: {
    kicker: 'Creativity · in the shop',
    focal: '6.5',
    focalCaption: 'board feet milled — the walnut shelf is ready for glue-up.',
    note: 'One build in flight and two wishlist items just dropped in price — a good week to make.',
    cards: [
      { page: 'shelf', title: 'Walnut Shelf', stat: 'Glue-up', sub: '6.5 bf · French cleat next' },
      { page: 'wishlist', title: 'Wishlist', stat: '6 tracked', sub: '2 dropped in price' },
    ],
  },
  personal: {
    kicker: 'Personal · life',
    focal: '23',
    focalCaption: 'days until Lisbon — flights booked, passport pending.',
    note: 'Lisbon is nearly handled, you’re on your 23rd book, and Dad’s overdue a call.',
    cards: [
      { page: 'trips', title: 'My Trips', stat: 'Lisbon', sub: 'Sep 6 · in 23 days' },
      { page: 'library', title: 'Library', stat: '23 books', sub: 'of 30 this year' },
      { page: 'journal', title: 'Journal', stat: '12-day', sub: 'streak · 34 entries' },
      { page: 'contacts', title: 'Contacts', stat: '3 birthdays', sub: 'this month' },
      { page: 'recipes', title: 'Food', stat: '5 dinners', sub: 'planned this week' },
    ],
  },
}

export interface Doc {
  area: string
  crumb: string[]
  title: string
  blocks: Block[]
}

/** Page id → document. Gives every leaf a correct title/crumb (module-pages render
 *  their own dashboard, so their blocks are only a fallback the Read lens never
 *  shows for them). The marathon doc is the one true long-form read (see READER). */
export const DOCS: Record<string, Doc> = {
  marathon: {
    area: 'health',
    crumb: openPage.breadcrumb,
    title: openPage.title,
    blocks: openPage.blocks,
  },
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
  workout: {
    area: 'health',
    crumb: ['Health', 'Workout Routine'],
    title: 'Workout Routine',
    blocks: [
      {
        id: 'wo1',
        type: 'text',
        content:
          'Strength twice a week, easy mobility on the off days. Build the engine, protect the joints.',
      },
    ],
  },
  q3: {
    area: 'professional',
    crumb: ['Professional', 'Q3 Planning'],
    title: 'Q3 Planning',
    blocks: [
      {
        id: 'q1',
        type: 'text',
        content:
          'Ship the design-system tokens and one reference app by end of quarter. Depth over surface.',
      },
      { id: 'q2', type: 'metric', label: 'Milestones', value: '3/5', trend: 'on track' },
    ],
  },
  ds: {
    area: 'professional',
    crumb: ['Professional', 'Design System'],
    title: 'Design System',
    blocks: [
      {
        id: 'd1',
        type: 'text',
        content: 'One token layer, calmly enforced. Every component earns its place or it leaves.',
      },
    ],
  },
  projects: {
    area: 'professional',
    crumb: ['Professional', 'Projects'],
    title: 'Projects',
    blocks: [
      {
        id: 'pj1',
        type: 'text',
        content: 'Everything in flight, one roll-up. Health, risk, and the next move for each.',
      },
    ],
  },
  tasks: {
    area: 'professional',
    crumb: ['Professional', 'Tasks'],
    title: 'Tasks',
    blocks: [
      {
        id: 'tk1',
        type: 'text',
        content: 'Everything owed, filtered by when. Today, this week, the rest.',
      },
    ],
  },
  finance: {
    area: 'finances',
    crumb: ['Finances', 'Budget'],
    title: 'Budget',
    blocks: [
      {
        id: 'f1',
        type: 'text',
        content:
          'Income, spend, and net worth in one calm ledger. Safe to spend is the only number that matters day to day.',
      },
    ],
  },
  shelf: {
    area: 'creativity',
    crumb: ['Creativity', 'Walnut Shelf'],
    title: 'Walnut Shelf',
    blocks: [
      {
        id: 'w1',
        type: 'text',
        content:
          'Floating walnut shelf for the entryway. Hidden French cleat, hand-rubbed oil finish.',
      },
      { id: 'w2', type: 'metric', label: 'Board feet', value: '6.5', unit: 'bf' },
    ],
  },
  wishlist: {
    area: 'creativity',
    crumb: ['Creativity', 'Wishlist'],
    title: 'Wishlist',
    blocks: [
      {
        id: 'wl1',
        type: 'text',
        content:
          'Things worth wanting, tracked at a price. Buy when the number is right, not when the itch is loud.',
      },
    ],
  },
  recipes: {
    area: 'personal',
    crumb: ['Personal', 'Food', 'Recipes'],
    title: 'Recipes',
    blocks: [
      {
        id: 'rc1',
        type: 'text',
        content: 'The rotation that actually gets cooked. Fast on weeknights, slower on Sundays.',
      },
    ],
  },
  meals: {
    area: 'personal',
    crumb: ['Personal', 'Food', 'Meal Plan'],
    title: 'Meal Plan',
    blocks: [
      {
        id: 'ml1',
        type: 'text',
        content:
          'This week, one dinner a night. Plan enough to shop once, loose enough to change your mind.',
      },
    ],
  },
  grocery: {
    area: 'personal',
    crumb: ['Personal', 'Food', 'Groceries'],
    title: 'Groceries',
    blocks: [
      {
        id: 'gr1',
        type: 'text',
        content: 'Built from the week’s plan, grouped by aisle. Check it off as you go.',
      },
    ],
  },
  trips: {
    area: 'personal',
    crumb: ['Personal', 'My Trips'],
    title: 'My Trips',
    blocks: [
      {
        id: 'tp1',
        type: 'text',
        content:
          'Where you’re going and where you’ve been. Lisbon next; the rest is memory and a few stars.',
      },
    ],
  },
  contacts: {
    area: 'personal',
    crumb: ['Personal', 'Contacts'],
    title: 'Contacts',
    blocks: [
      {
        id: 'ct1',
        type: 'text',
        content:
          'The people, and how long it’s been. A gentle nudge before a drift becomes a silence.',
      },
    ],
  },
  library: {
    area: 'personal',
    crumb: ['Personal', 'Library'],
    title: 'Library',
    blocks: [
      {
        id: 'lb1',
        type: 'text',
        content: 'Books and screen, read and watched. A book a fortnight is still thirty a year.',
      },
    ],
  },
  journal: {
    area: 'personal',
    crumb: ['Personal', 'Journal'],
    title: 'Journal',
    blocks: [
      {
        id: 'jr1',
        type: 'text',
        content: 'A line a day, kept honest. The streak matters less than the noticing.',
      },
    ],
  },
}

/** First navigable LEAF under an area (recurses past sub-areas). */
export const firstPageOf = (areaId: string): string => {
  const area = tree.find((a) => a.id === areaId)
  const firstLeaf = (nodes?: TreeNode[]): string | undefined => {
    for (const n of nodes ?? []) {
      if (n.children?.length) {
        const deep = firstLeaf(n.children)
        if (deep) return deep
      } else {
        return n.id
      }
    }
    return undefined
  }
  return firstLeaf(area?.children) ?? areaId
}

/** Flat list of navigable pages (id, title, top-area) for the palette + focus picker. */
export interface PageRef {
  id: string
  title: string
  area: string
}
export const PAGES: PageRef[] = tree.flatMap((a) => {
  const out: PageRef[] = []
  const walk = (nodes?: TreeNode[]) => {
    for (const n of nodes ?? []) {
      if (n.children?.length) walk(n.children)
      else out.push({ id: n.id, title: n.title, area: a.id })
    }
  }
  walk(a.children)
  return out.length ? out : [{ id: a.id, title: a.title, area: a.id }]
})

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
  standfirst:
    'A marathon is not won in the loud weeks. It is won in the easy ones, kept genuinely easy.',
  minutes: 4,
  sections: [
    {
      hid: 'h-intent',
      heading: 'The intent',
      sentences: [
        {
          sid: 's1',
          text: 'The goal is sub-4:00 at the October marathon, and the plan that gets there is almost embarrassingly plain.',
        },
        {
          sid: 's2',
          text: 'Long runs on Sunday, tempo intervals on Tuesday, and everything else run slow enough to hold a conversation.',
        },
        {
          sid: 's3',
          text: 'The discipline is not in the hard days — those take care of themselves — it is in keeping the easy days genuinely easy.',
        },
        {
          sid: 's4',
          text: 'Most plans fail not from too little effort but from too much of it, spent on the wrong days.',
        },
      ],
    },
    {
      hid: 'h-week',
      heading: 'The shape of a week',
      sentences: [
        {
          sid: 's5',
          text: 'Last week logged 38 miles, up about twelve percent, which is a healthy build rather than a heroic one.',
        },
        {
          sid: 's6',
          text: 'The instinct now is to add volume; the better move is to hold mileage steady and sharpen the Tuesday tempo.',
        },
        {
          sid: 's7',
          text: 'Goal pace needs repetition more than it needs raw distance, and repetition is a patience problem, not a fitness one.',
        },
        {
          sid: 's8',
          text: 'Sleep is the silent training partner — seven hours is the floor, and the cooler bedroom is worth more than it looks.',
        },
      ],
    },
    {
      hid: 'h-race',
      heading: 'Rehearsing race day',
      sentences: [
        {
          sid: 's9',
          text: 'Nutrition is rehearsed, not improvised: practice the race-day gels on the Sunday long run, 220 kilocalories every 45 minutes.',
        },
        {
          sid: 's10',
          text: 'Alternate caffeine and plain, sip water at every mile marker, and let the stomach learn the rhythm before it matters.',
        },
        {
          sid: 's11',
          text: 'By October nothing on race morning should be new — not the shoes, not the fuel, not the pace of the first quiet mile.',
        },
        {
          sid: 's12',
          text: 'A good race feels like a familiar Sunday that simply went a little further than usual.',
        },
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
  {
    id: 'an1',
    sid: 's3',
    text: 'You said this three weeks running. It seems to be the real lever for you.',
  },
  {
    id: 'an2',
    sid: 's6',
    text: 'Your last two build weeks both stalled the week after a mileage jump.',
  },
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
  {
    id: 'g1',
    kind: 'due',
    page: 'marathon',
    area: 'health',
    label: '16-mile long run',
    detail: 'Sunday · the week’s anchor session',
  },
  {
    id: 'g2',
    kind: 'due',
    page: 'q3',
    area: 'professional',
    label: 'Design-system tokens',
    detail: 'Milestone 4 of 5 · on track',
  },
  {
    id: 'g3',
    kind: 'due',
    page: 'trips',
    area: 'personal',
    label: 'Renew your passport',
    detail: 'Lisbon in 23 days · don’t leave it',
  },
  {
    id: 'g4',
    kind: 'due',
    page: 'finance',
    area: 'finances',
    label: 'Pay the Amex',
    detail: 'Due Friday · $1,240 statement',
  },
  {
    id: 'g5',
    kind: 'changed',
    page: 'sleep',
    area: 'health',
    label: 'Sleep held at 7.1 hrs',
    detail: 'Up 4% — the cooler bedroom is working',
  },
  {
    id: 'g6',
    kind: 'changed',
    page: 'shelf',
    area: 'creativity',
    label: 'Walnut Shelf — 6.5 board feet milled',
    detail: 'Ready for the French cleat',
  },
  {
    id: 'g7',
    kind: 'changed',
    page: 'library',
    area: 'personal',
    label: 'Finished “The Overstory”',
    detail: 'Your 23rd book this year · rated 5★',
  },
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
  { id: 'p3', label: 'Design-system tokens', area: 'professional', mins: 90 },
  { id: 'p4', label: 'Q3 planning review', area: 'professional', mins: 45 },
  { id: 'p5', label: 'Walnut Shelf — glue-up', area: 'creativity', mins: 60 },
]
/** Where "Plan my day" lays things down (calm, non-colliding). */
export const PLAN_HOURS: Record<string, number> = { p1: 7, p2: 17, p3: 10, p4: 14, p5: 16 }
export const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
export const NOW_HOUR = 9
export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** A believable week overview (day → item labels). */
export const WEEK_PLACED: Record<string, { label: string; area: string }[]> = {
  Mon: [{ label: 'Easy 5', area: 'health' }],
  Tue: [
    { label: 'Tempo intervals', area: 'health' },
    { label: 'Q3 review', area: 'professional' },
  ],
  Wed: [
    { label: 'Design tokens', area: 'professional' },
    { label: 'Dinner — Sara', area: 'personal' },
  ],
  Thu: [
    { label: 'Easy 6', area: 'health' },
    { label: 'Shelf glue-up', area: 'creativity' },
  ],
  Fri: [{ label: 'Pay the Amex', area: 'finances' }],
  Sat: [
    { label: 'Shakeout 3', area: 'health' },
    { label: 'Lisbon itinerary', area: 'personal' },
  ],
  Sun: [{ label: '16-mile long run', area: 'health' }],
}

// ── NOTIFICATIONS: a reverse-chronological feed of Pond activity ──────────────
/**
 * The Notifications drawer is a timeline of what Pond noticed, quietly changed,
 * or is proposing. Reverse-chronological, day-grouped. Deterministic seed (no
 * wall-clock) so screenshots stay stable. The 'proposed' entry carries the
 * diffCard and keeps its inline Accept/Later. `page` is the click target.
 */
export type ActivityType = 'noticed' | 'changed' | 'proposed'
export interface ActivityItem {
  id: string
  day: 'Today' | 'Yesterday' | 'Earlier'
  time: string // mono relative stamp
  type: ActivityType
  area: string
  line: string
  /** The page this entry opens on click (falls back to the area's first page). */
  page?: string
  /** Only the 'proposed' entry sets this — it renders the diff + Accept/Later. */
  proposal?: boolean
}
export const ACTIVITY: ActivityItem[] = [
  {
    id: 'a1',
    day: 'Today',
    time: '9:12a',
    type: 'proposed',
    area: 'health',
    line: 'A race-day fuel edit for Marathon Training',
    proposal: true,
  },
  {
    id: 'a2',
    day: 'Today',
    time: '8:40a',
    type: 'changed',
    area: 'health',
    line: 'Sleep held at 7.1 hrs, up 4% on last week',
    page: 'sleep',
  },
  {
    id: 'a3',
    day: 'Today',
    time: '7:05a',
    type: 'noticed',
    area: 'finances',
    line: 'Dining is $48 over budget this month',
    page: 'finance',
  },
  {
    id: 'a4',
    day: 'Yesterday',
    time: '6:20p',
    type: 'changed',
    area: 'creativity',
    line: 'Walnut Shelf — 6.5 board feet milled, ready for the cleat',
    page: 'shelf',
  },
  {
    id: 'a5',
    day: 'Yesterday',
    time: '4:12p',
    type: 'noticed',
    area: 'professional',
    line: 'Design System — Storybook coverage slipped to at-risk',
    page: 'ds',
  },
  {
    id: 'a6',
    day: 'Yesterday',
    time: '11:30a',
    type: 'changed',
    area: 'personal',
    line: 'Lisbon trip — flights booked, Sep 6–14',
    page: 'trips',
  },
  {
    id: 'a7',
    day: 'Earlier',
    time: 'Sun',
    type: 'noticed',
    area: 'personal',
    line: 'You’ve not messaged Dad in four weeks',
    page: 'contacts',
  },
  {
    id: 'a8',
    day: 'Earlier',
    time: 'Sat',
    type: 'changed',
    area: 'personal',
    line: 'Logged “The Overstory” — your 23rd book this year',
    page: 'library',
  },
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

/* ── AI COMPOSITION (t16 feel-proto) ──────────────────────────────────────────
 * The one thing v85 doesn't yet dramatize: Pond ASSEMBLING a view that didn't
 * exist — picking modules, filling them, streaming them in, and landing them.
 * A composition is an ordered list of BEATS the compose surface plays back on a
 * timer (deterministic; no Date.now / no Math.random). Three scenarios share the
 * one engine, reached from the three real entry points (Ask · Capture · ⌘K).
 *
 * Beat kinds:
 *  • read      — a narration line in Pond's build-trace ("Reading Health…").
 *  • module    — a module card that materializes (skeleton → filled). `render`
 *                selects a ui.tsx primitive; `why` is the one-line rationale.
 *  • uncertain — a module Pond ISN'T sure about: a question + two choices, so we
 *                can feel how doubt lands mid-compose. Non-blocking.
 */
export type ComposeId = 'week' | 'capture' | 'newtopic'
export type ModuleRender = 'ring' | 'spark' | 'stat' | 'diff' | 'list'

export interface ReadBeat {
  kind: 'read'
  ms?: number
  text: string
}
export interface ModuleBeat {
  kind: 'module'
  ms?: number
  area: string
  title: string
  why: string
  render: ModuleRender
  /** ring: [pct,label,sub] · spark: number[] · stat: [big,unit,note] · diff:[before,after] · list:string[] */
  ring?: { pct: number; label: string; sub: string }
  spark?: { data: number[]; big: string; note: string }
  stat?: { big: string; unit?: string; note: string; off?: boolean }
  diff?: { before: string; after: string }
  list?: string[]
}
export interface UncertainBeat {
  kind: 'uncertain'
  ms?: number
  area: string
  title: string
  question: string
  options: [string, string]
}
export type ComposeBeat = ReadBeat | ModuleBeat | UncertainBeat

export interface ComposeScript {
  /** kicker over the composed view. */
  eyebrow: string
  /** the focal Instrument-Serif title of the composed page. */
  title: string
  /** the prompt that triggered it, echoed back (seed overrides at runtime). */
  ask: string
  /** the landing CTA verb — what "accept" means for this composition. */
  landCta: string
  /** toast shown after landing. */
  landToast: string
  /** if the landing pins something to the rail, the leaf it adds. */
  pin?: { id: string; title: string; area: string }
  beats: ComposeBeat[]
}

export const COMPOSE: Record<ComposeId, ComposeScript> = {
  // ── Ask → a cross-life view streams into being ──────────────────────────────
  week: {
    eyebrow: 'Composing · across your life',
    title: 'This week, in one view',
    ask: 'How’s my week shaping up across everything?',
    landCta: 'Pin to rail',
    landToast: 'Pinned “This week” to your rail',
    pin: { id: 'week', title: 'This week', area: 'personal' },
    beats: [
      { kind: 'read', text: 'Reading Health, Professional, Finances and Personal…' },
      {
        kind: 'module',
        area: 'health',
        title: 'Marathon Training',
        why: 'your biggest active goal this week',
        render: 'ring',
        ring: { pct: 0.76, label: '38', sub: 'miles · +12%' },
      },
      { kind: 'read', text: 'Pulling the one deadline that’s at risk…' },
      {
        kind: 'module',
        area: 'professional',
        title: 'Design System',
        why: 'the only project slipping — worth your Tuesday',
        render: 'stat',
        stat: { big: 'At risk', note: 'Storybook coverage slipped · Q3 still on track', off: true },
      },
      {
        kind: 'module',
        area: 'finances',
        title: 'Dining',
        why: 'the single number that’s off-track',
        render: 'stat',
        stat: { big: '$48', unit: 'over', note: 'rest of the budget is calm', off: true },
      },
      { kind: 'read', text: 'You asked me to keep travel in view…' },
      {
        kind: 'module',
        area: 'personal',
        title: 'Lisbon',
        why: 'booked Sep 6–14 — three weeks out',
        render: 'list',
        list: ['Flights booked ✓', 'Apartment — not yet', 'Day-trip to Sintra?'],
      },
      {
        kind: 'uncertain',
        area: 'creativity',
        title: 'Walnut Shelf',
        question:
          'The shelf’s idle this week — not sure it belongs in a “this week” read. Include it?',
        options: ['Include', 'Leave out'],
      },
    ],
  },

  // ── Capture → Pond routes a raw thought and edits the right page live ────────
  capture: {
    eyebrow: 'Composing · from your capture',
    title: 'Filed to Marathon Training',
    ask: 'knee’s been sore, moved the long run to Sunday',
    landCta: 'Apply the change',
    landToast: 'Applied to Marathon Training',
    beats: [
      { kind: 'read', text: 'This reads like Health → Marathon Training.' },
      {
        kind: 'module',
        area: 'health',
        title: 'Long run',
        why: 'you moved it — I’ll reschedule and rebalance the week',
        render: 'diff',
        diff: {
          before: 'Sat · 18 mi long run',
          after: 'Sun · 18 mi long run · Sat now rest',
        },
      },
      { kind: 'read', text: 'Noting the reason, so next week’s plan accounts for it…' },
      {
        kind: 'uncertain',
        area: 'health',
        title: 'Knee soreness',
        question: 'Want me to log the sore knee as a symptom to watch across your runs?',
        options: ['Log it', 'Not now'],
      },
    ],
  },

  // ── New topic → Pond composes a brand-new dashboard from primitives ──────────
  newtopic: {
    eyebrow: 'Composing · a new page',
    title: 'Half Marathon',
    ask: 'start tracking my half-marathon',
    landCta: 'Create page',
    landToast: 'Created “Half Marathon” in Health',
    pin: { id: 'half', title: 'Half Marathon', area: 'health' },
    beats: [
      { kind: 'read', text: 'New page — I’ll model it on your Marathon Training.' },
      {
        kind: 'module',
        area: 'health',
        title: 'Race day',
        why: 'a countdown is the spine of a training page',
        render: 'ring',
        ring: { pct: 0.28, label: '9', sub: 'weeks out' },
      },
      { kind: 'read', text: 'Seeding a weekly mileage track…' },
      {
        kind: 'module',
        area: 'health',
        title: 'Weekly mileage',
        why: 'starts flat — it fills as you log runs',
        render: 'spark',
        spark: { data: [0, 6, 8, 7, 11, 12, 14, 16], big: '16', note: 'mi · last week' },
      },
      {
        kind: 'module',
        area: 'health',
        title: 'Plan',
        why: 'a starter block you can reshape',
        render: 'list',
        list: ['Base — 3 wks', 'Build — 4 wks', 'Taper — 2 wks'],
      },
      {
        kind: 'uncertain',
        area: 'health',
        title: 'Where it lives',
        question: 'Put this under Health, or give it its own area?',
        options: ['Under Health', 'New area'],
      },
    ],
  },
}
