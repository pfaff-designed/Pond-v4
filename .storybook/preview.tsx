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
