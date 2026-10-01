import type { PageModule } from './schema'

/**
 * Shared sample page used by both the registry test and the Storybook story — one
 * fixture so the two can't drift. A page holding the live content modules that draw
 * standalone: text, todo, table and an image. A `view` is deliberately absent — it
 * reads a collection through react-query, so it cannot render outside a provider.
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
    {
      id: 'b3',
      type: 'table',
      title: 'Weekly mileage',
      columns: ['Week', 'Miles'],
      rows: [
        { id: 'r1', cells: ['1', '38'] },
        { id: 'r2', cells: ['2', '42'] },
      ],
    },
    {
      id: 'b4',
      type: 'image',
      url: 'https://cdn.example/user-1/route.png',
      filename: 'route.png',
      mediaType: 'image/png',
      caption: 'The long-run route',
    },
  ],
}
