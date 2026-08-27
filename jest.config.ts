import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Never run tests from local-only worktree/session copies.
  testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/.claude-worktrees/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // react-markdown (+ its remark plugins) is pure ESM; next/jest doesn't
    // transpile node_modules, so stub them in jsdom. Typeset rendering is covered
    // by the Storybook story tests, not jest — see src/__mocks__/react-markdown.tsx.
    '^react-markdown$': '<rootDir>/src/__mocks__/react-markdown.tsx',
    '^remark-(gfm|breaks)$': '<rootDir>/src/__mocks__/remark-plugin.ts',
  },
}

export default createJestConfig(config)
