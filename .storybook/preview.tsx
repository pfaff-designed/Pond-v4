import type { Preview } from '@storybook/nextjs-vite'

// Load the app's global styles (Tailwind v4 + shadcn tokens) so components
// render with their real design tokens inside Storybook.
import '../src/app/globals.css'

const preview: Preview = {
  parameters: {
    // The App Router's hooks (`useRouter`, `useSearchParams`) throw "invariant
    // expected app router to be mounted" outside a Next tree. `Rail`'s head is the
    // pond switcher (#312/#319), which reads `?pond=` and navigates, so every rail
    // story needed a router. `@storybook/nextjs-vite` supplies a mock when told the
    // app is App Router — set here rather than per-story so the next component that
    // navigates does not rediscover this.
    nextjs: { appDirectory: true },

    // The sidebar reads like `Pond 02`'s ladder: each organism is its board id and
    // heading, each story a board state in the board's own order. Storybook reads
    // `storySort` statically, so every list must stay an inline literal.
    options: {
      storySort: {
        includeNames: true,
        order: [
          'Atoms',
          'Molecules',
          'Organisms',
          [
            '2i · blocks',
            '2d · charts',
            'pickers',
            [
              '2c · ∕ menu',
              [
                'open',
                'filtered',
                'templates',
                'empty',
                'open · ink',
                'filtered · ink',
                'templates · ink',
                'empty · ink',
                'open · mobile',
                'filtered · mobile',
                'templates · mobile',
                'empty · mobile',
              ],
              '2e · choose a source',
              ['source', 'type', 'new', 'source · ink', 'type · ink', 'new · ink'],
              '2g · the palette',
              [
                'closed',
                'closed · ink',
                'opened',
                'opened · ink',
                'typing',
                'typing · ink',
                'actions',
                'actions · ink',
                'record',
                'record · ink',
                'empty',
                'empty · ink',
                'scoped',
                'scoped · ink',
                'ponds',
                'ponds · ink',
                'opened · mobile',
                'typing · mobile',
                'empty · mobile',
              ],
            ],
            '2r · the rail',
            [
              'rest',
              'hover',
              'renaming',
              'dragging',
              'deep',
              'empty',
              'loading',
              'rest · area colours',
              'rest · ink',
              'deep · ink',
              'hover · ink',
              'switcher',
              'switcher · ink',
              'new',
              'new · ink',
            ],
            '2f · the composer',
            [
              'rest',
              'asking',
              'streaming',
              'answered',
              'answered · ink',
              'proposing',
              'proposing · ink',
              'thread',
              'thread · ink',
              'error',
              'error · ink',
              'collapsed',
              'collapsed · ink',
              'landed',
              'landed · ink',
              'rest · mobile',
              'answered · mobile',
              'proposing · mobile',
              'thread · mobile',
              'collapsed · mobile',
            ],
            '*',
          ],
          'Modules',
          'Templates',
        ],
      },
    },

    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
}

export default preview
