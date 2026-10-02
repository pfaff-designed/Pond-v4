/**
 * Extracts the design handoff's stated values into wayfinder/board-values.generated.json
 * so builders stop re-measuring the same boards.
 *
 *   npm run board-values            write the file
 *   npm run board-values -- --check exit 1 if the committed file is stale (what the test runs)
 *
 * The .dc.html boards stay the source of truth; this is a cache. Nothing here
 * starts a server or a browser — it reads files and exits.
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDoc, serialise } from './board-values/index.mts'

export const OUTPUT = 'wayfinder/board-values.generated.json'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outPath = path.join(repoRoot, OUTPUT)
const check = process.argv.includes('--check')

const next = serialise(await buildDoc(repoRoot))

if (!check) {
  await writeFile(outPath, next, 'utf8')
  const doc = JSON.parse(next) as {
    components: Record<string, { variants: Record<string, unknown> }>
    boards: Record<string, { frames: unknown[] }>
  }
  const variants = Object.values(doc.components).reduce(
    (n, c) => n + Object.keys(c.variants).length,
    0
  )
  const frames = Object.values(doc.boards).reduce((n, b) => n + b.frames.length, 0)
  const kb = Math.round(Buffer.byteLength(next) / 1024)
  console.log(
    `${OUTPUT}: ${Object.keys(doc.components).length} components / ${variants} variants, ` +
      `${Object.keys(doc.boards).length} boards / ${frames} frames, ${kb} KB`
  )
} else {
  const current = await readFile(outPath, 'utf8').catch(() => null)
  if (current === next) {
    console.log(`${OUTPUT} is up to date`)
  } else {
    console.error(
      current === null
        ? `${OUTPUT} is missing. Run: npm run board-values`
        : `${OUTPUT} is stale — the handoff has changed, or it was hand-edited. Run: npm run board-values`
    )
    process.exitCode = 1
  }
}
