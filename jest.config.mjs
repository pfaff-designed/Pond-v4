import nextJest from 'next/jest.js'

// ESM config (not .ts) so a clean checkout runs the suite without ts-node —
// jest.config.ts silently required ts-node, which is not a declared dependency.
const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Never run tests from local-only worktree/session copies.
  // The PGLite schema-invariant suite is a separate `node`-env jest project
  // (jest.config.pglite.mjs); exclude its test + harness from the jsdom suite
  // so they aren't collected here (they can't run under jsdom).
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.claude/',
    '/.claude-worktrees/',
    '\\.pglite\\.test\\.ts$',
    '/__tests__/helpers/',
  ],
  moduleNameMapper: {
    // ticket-36: the Bklit chart entry modules the promoted chart views import pull
    // in @visx → d3-shape (pure ESM) which next/jest won't transpile. Stub them in
    // jsdom (real render covered by the chart Storybook story tests). Matched on the
    // resolved path tail (not the `@/` alias, which next resolves before this map
    // sees it) and placed FIRST so it wins over the `^@/` catch-all below.
    'components/charts/(line-chart|bar-chart|area-chart|line|bar|area|grid|x-axis|bar-x-axis)$':
      '<rootDir>/src/__mocks__/charts.tsx',
    // #12: same remedy for the heatmap entry barrel (index → HeatmapChart → @visx +
    // motion). Anchored on the barrel only — deep imports like `heatmap/heatmap-utils`
    // (the pure week helpers the binning transform reuses) still resolve for real.
    'components/charts/heatmap$': '<rootDir>/src/__mocks__/heatmap.tsx',
    '^@/(.*)$': '<rootDir>/src/$1',
    // react-markdown (+ its remark plugins) is pure ESM; next/jest doesn't
    // transpile node_modules, so stub them in jsdom. Typeset rendering is covered
    // by the Storybook story tests, not jest — see src/__mocks__/react-markdown.tsx.
    '^react-markdown$': '<rootDir>/src/__mocks__/react-markdown.tsx',
    '^remark-(gfm|breaks)$': '<rootDir>/src/__mocks__/remark-plugin.ts',
    // @number-flow/react is a pure-ESM custom-element wrapper; stub it in jsdom.
    // The count-up animation is covered by the metric Storybook story test, not jest.
    '^@number-flow/react$': '<rootDir>/src/__mocks__/number-flow.tsx',
  },
}

export default createJestConfig(config)
