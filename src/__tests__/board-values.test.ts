/**
 * Guard for wayfinder/board-values.generated.json.
 *
 * The generated JSON is a cache of values the `.dc.html` boards state. A cache is
 * only safe while it cannot drift: the moment it says one thing and the board says
 * another, it has become a second source of truth and is worse than nothing. So
 * this re-runs the extraction and fails if the committed file differs — if a board
 * changes, the suite goes red until someone runs `npm run board-values`.
 *
 * It shells out to the real script rather than importing it: the extractor is a
 * `.mts` ES module run by Node directly, and spawning it tests exactly the command
 * a person would type. It reads files and exits — no server, no browser.
 *
 * `--experimental-strip-types` is passed explicitly (#262). Node unflagged type
 * stripping in 22.18, so CI (which resolves `.nvmrc`'s `22` to the latest) ran the
 * `.mts` file bare and passed, while a 22.15 install on a developer's machine could
 * not load it at all and this one suite was red locally on every branch. The flag
 * has been accepted since 22.6 and is still accepted on 24, so it makes the two
 * agree on the oldest Node the project claims rather than only the newest.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '..', '..')
const script = path.join(repoRoot, 'scripts', 'extract-board-values.mts')
const output = path.join(repoRoot, 'wayfinder', 'board-values.generated.json')

describe('board-values.generated.json', () => {
  it('is committed', () => {
    expect(existsSync(output)).toBe(true)
  })

  it('matches a fresh extraction from the handoff (run `npm run board-values`)', () => {
    const run = spawnSync(process.execPath, ['--experimental-strip-types', script, '--check'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 120_000,
    })
    expect(run.error).toBeUndefined()
    expect(`${run.stdout ?? ''}${run.stderr ?? ''}`.trim()).toContain('is up to date')
    expect(run.status).toBe(0)
  })

  it('states that the boards, not this file, are the source of truth', () => {
    const doc = JSON.parse(readFileSync(output, 'utf8')) as {
      readme: { generated: string; regenerate: string; sourceOfTruth: string }
    }
    expect(doc.readme.generated).toMatch(/GENERATED FILE/)
    expect(doc.readme.regenerate).toBe('npm run board-values')
    expect(doc.readme.sourceOfTruth).toMatch(/THE BOARD WINS/)
  })
})
