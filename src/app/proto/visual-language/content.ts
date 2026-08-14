/**
 * THROWAWAY prototype content for the visual-language exploration (ticket-14).
 * Shared, read-only dummy Pond data so all 15 aesthetic variants render the
 * exact same faithful shell content (sidebar tree · page editor · AI terminal).
 *
 * Delete the whole `src/app/proto/` directory once the aesthetic is chosen.
 */

export type NodeType = 'area' | 'project' | 'routine' | 'action' | 'page'

export interface TreeNode {
  id: string
  title: string
  type: NodeType
  status?: 'active' | 'done'
  children?: TreeNode[]
}

/** Sidebar page tree — a believable slice of Charles's Pond. */
export const tree: TreeNode[] = [
  {
    id: 'health',
    title: 'Health',
    type: 'area',
    children: [
      { id: 'marathon', title: 'Marathon Training', type: 'project', status: 'active' },
      { id: 'sleep', title: 'Sleep', type: 'routine' },
    ],
  },
  {
    id: 'work',
    title: 'Work',
    type: 'area',
    children: [
      { id: 'q3', title: 'Q3 Planning', type: 'project', status: 'active' },
      { id: 'ds', title: 'Design System', type: 'project' },
    ],
  },
  {
    id: 'wood',
    title: 'Woodworking',
    type: 'area',
    children: [{ id: 'shelf', title: 'Walnut Shelf', type: 'project' }],
  },
  { id: 'reading', title: 'Reading', type: 'area' },
]

/** The currently-open page (highlighted in the tree). */
export const openNodeId = 'marathon'

export type Block =
  | { id: string; type: 'text'; content: string }
  | { id: string; type: 'todo'; items: { id: string; label: string; checked: boolean }[] }
  | { id: string; type: 'metric'; label: string; value: string; unit?: string; trend?: string }

export const openPage = {
  breadcrumb: ['Health', 'Marathon Training'],
  title: 'Marathon Training',
  type: 'project' as NodeType,
  saved: true,
  blocks: [
    {
      id: 'b1',
      type: 'text',
      content:
        'Goal: sub-4:00 at the October marathon. Long runs on Sunday, tempo intervals Tuesday. Keep easy days genuinely easy.',
    },
    {
      id: 'b2',
      type: 'todo',
      items: [
        { id: 't1', label: '16-mile long run', checked: true },
        { id: 't2', label: 'New shoes — Endorphin Speed', checked: true },
        { id: 't3', label: 'Book a sports massage', checked: false },
      ],
    },
    { id: 'b3', type: 'metric', label: 'Weekly mileage', value: '38', unit: 'mi', trend: '+12%' },
    {
      id: 'b4',
      type: 'text',
      content: 'Nutrition: practice race-day gels on the long run. 220 kcal every 45 min.',
    },
  ] as Block[],
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export const transcript: Message[] = [
  { id: 'm1', role: 'user', text: 'What should I focus on this week?' },
  {
    id: 'm2',
    role: 'assistant',
    text: 'You logged 38 miles last week, up 12% — a healthy build. Hold mileage steady and sharpen the Tuesday tempo; your goal pace needs the repetition more than more volume.',
  },
]

/** A pending AI diff-card proposal shown inline in the terminal. */
export const diffCard = {
  blockType: 'text',
  before: 'Nutrition: practice race-day gels on the long run. 220 kcal every 45 min.',
  after:
    'Nutrition: rehearse race-day gels on the Sunday long run — 220 kcal every 45 min, alternating caffeine and plain. Sip water at every mile marker.',
  reason: 'Added the specifics you mentioned so race day is fully rehearsed.',
}

export const contextLabel = 'Marathon Training'
