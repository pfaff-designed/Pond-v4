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
    // The Bklit chart entry modules the `chart` view mode imports pull in @visx →
    // d3-shape (pure ESM) which next/jest won't transpile. Stub them in jsdom (real
    // render covered by the view chart-kind story tests). Matched on the
    // resolved path tail (not the `@/` alias, which next resolves before this map
    // sees it) and placed FIRST so it wins over the `^@/` catch-all below.
    'components/charts/(line-chart|bar-chart|area-chart|line|bar|area|grid|x-axis|bar-x-axis)$':
      '<rootDir>/src/__mocks__/charts.tsx',
    // Same remedy for the heatmap entry barrel (index → HeatmapChart → @visx +
    // motion). Anchored on the barrel only — deep imports like `heatmap/heatmap-utils`
    // (the pure week helpers the binning transform reuses) still resolve for real.
    'components/charts/heatmap$': '<rootDir>/src/__mocks__/heatmap.tsx',
    '^@/(.*)$': '<rootDir>/src/$1',
    // react-markdown (+ remark-gfm) is pure ESM; next/jest doesn't
    // transpile node_modules, so stub them in jsdom. Typeset rendering is covered
    // by the Storybook story tests, not jest — see src/__mocks__/react-markdown.tsx.
    '^react-markdown$': '<rootDir>/src/__mocks__/react-markdown.tsx',
    '^remark-gfm$': '<rootDir>/src/__mocks__/remark-plugin.ts',
    // @number-flow/react is a pure-ESM custom-element wrapper; stub it in jsdom.
    // The count-up animation is covered by the view big-number story test, not jest.
    '^@number-flow/react$': '<rootDir>/src/__mocks__/number-flow.tsx',
  },
}

// The HTML reader's parser (rehype-parse → unified, hast, unist, vfile, parse5)
// ships pure ESM. next/jest only exempts `transpilePackages` from its
// node_modules ignore, and appended patterns can only ignore more, so the
// generated pattern is wrapped: a path inside the unified family is never ignored.
const UNIFIED_FAMILY =
  '(?:unified|rehype-[\\w-]+|hast[\\w-]*|unist-[\\w-]+|vfile[\\w-]*|bail|trough|devlop|is-plain-obj|property-information|[\\w]+-separated-tokens|web-namespaces|parse5|entities)'

const exemptUnifiedFamily = (pattern) =>
  pattern.startsWith('/node_modules/')
    ? `^(?!.*/node_modules/${UNIFIED_FAMILY}/).*${pattern}`
    : pattern

const nextJestConfig = createJestConfig(config)

const jestConfig = async () => {
  const resolved = await nextJestConfig()
  return {
    ...resolved,
    transformIgnorePatterns: resolved.transformIgnorePatterns.map(exemptUnifiedFamily),
  }
}

export default jestConfig
