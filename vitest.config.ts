import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'

import { playwright } from '@vitest/browser-playwright'

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  // Pre-bundle the app deps our stories pull in, so Vitest's browser mode
  // doesn't re-optimize (and reload) mid-run — that reload flakes the first run.
  optimizeDeps: {
    include: ['@ai-sdk/react', '@supabase/ssr', '@tanstack/react-query', 'ai', 'zod'],
  },
  // Builder worktrees (.claude-worktrees/*) symlink node_modules to the primary
  // checkout, so resolved dep realpaths land OUTSIDE this vite root and every
  // story fails at import ("Failed to fetch dynamically imported module").
  // Allow the resolved node_modules realpath explicitly; in the primary
  // checkout this is the default allow-list entry, so it changes nothing there.
  server: {
    fs: {
      allow: ['.', fs.realpathSync(path.join(dirname, 'node_modules'))],
    },
  },
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({ configDir: path.join(dirname, '.storybook') }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
