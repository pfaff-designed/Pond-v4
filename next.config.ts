import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Transpile the (ESM-only) AI SDK chain so it can be executed under jest
  // (next/jest only un-ignores node_modules listed here). No effect on the
  // runtime app, which handles these packages' native ESM directly.
  transpilePackages: ['ai', '@ai-sdk', '@workflow', 'zod'],
}

export default nextConfig
