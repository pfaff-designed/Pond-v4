import type { NextConfig } from 'next'

/** The ESM-only chain under `rehype-parse`, which the HTML import reader parses with. */
const HTML_PARSER_PACKAGES = [
  'rehype-parse',
  'unified',
  'bail',
  'is-plain-obj',
  'trough',
  'devlop',
  'vfile',
  'vfile-message',
  'vfile-location',
  'unist-util-stringify-position',
  'hast-util-from-html',
  'hast-util-from-parse5',
  'hast-util-parse-selector',
  'hastscript',
  'property-information',
  'comma-separated-tokens',
  'space-separated-tokens',
  'web-namespaces',
  'parse5',
  'entities',
]

const nextConfig: NextConfig = {
  // Transpile the (ESM-only) AI SDK chain and the HTML parser chain so they can be
  // executed under jest (next/jest only un-ignores node_modules listed here). No
  // effect on the runtime app, which handles these packages' native ESM directly.
  transpilePackages: ['ai', '@ai-sdk', '@workflow', 'zod', ...HTML_PARSER_PACKAGES],
}

export default nextConfig
