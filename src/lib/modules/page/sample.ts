import type { PageModule } from './schema'

/**
 * Shared sample page used by both the registry test and the Storybook story — one
 * fixture so the two can't drift. A page holding one of each foundation module:
 * text, todo, metric, and the harvested metric-ring.
 */
export const samplePage: PageModule = {
  id: 'p1',
  type: 'page',
  title: 'Marathon Training',
  blocks: [
    { id: 'b1', type: 'text', content: 'Base build week — hold easy pace on the long run.' },
    {
      id: 'b2',
      type: 'todo',
      items: [
        { id: 'i1', label: 'Long run', checked: true },
        { id: 'i2', label: 'Recovery swim', checked: false },
      ],
    },
    { id: 'b3', type: 'metric', label: 'Weekly mileage', value: 38, unit: 'mi', trend: 'up' },
    { id: 'b4', type: 'metric-ring', label: '38', sub: 'Miles', pct: 0.76 },
  ],
}
