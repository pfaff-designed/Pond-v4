import nextJest from 'next/jest.js'

// Separate jest project for the PGLite schema-invariant suite (issue #74).
// Runs in a `node` environment (PGLite is a native WASM module, not jsdom) and
// only matches `*.pglite.test.ts`, so the fast jsdom unit suite (jest.config.mjs)
// is left completely untouched — different env, different files.
const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'node',
  testMatch: ['**/*.pglite.test.ts'],
  // NB: intentionally omit the '/.claude-worktrees/' ignore that jest.config.mjs
  // carries, so this suite still runs when executed from inside a worktree.
  testPathIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // PGLite migration boot + WASM init runs longer than the 5s jsdom default.
  testTimeout: 30000,
}

export default createJestConfig(config)
