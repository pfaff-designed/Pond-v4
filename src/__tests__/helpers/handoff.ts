/**
 * Reads a design-handoff file from a test, whether or not the folder is on disk.
 *
 * The boards now live in a Claude Design project, and
 * `wayfinder/design_handoff_pond/` was deliberately deleted from the working tree
 * on 2026-10-04. Git still tracks all 260 files at the same paths, so the committed
 * copy is a complete offline fallback — these suites stay hermetic, need no auth,
 * and nothing restores a folder that was removed on purpose.
 *
 * Working tree first, so a local checkout still wins and editing a board shows up
 * immediately; then `git show HEAD:…`.
 *
 * `DesignSync` — the MCP tool that reads the Claude Design project — is NOT used
 * here and cannot be: it needs an interactive `/design-login` and is not reachable
 * from a jest process. Where the committed copy could trail the design project,
 * that is stated rather than hidden: as of 2026-10-04 the only drift is in the
 * `Pond 06.xx` storyboards, which gained a nav entry for the new `Pond 06.21 Tasks`
 * board. `Pond 03 Concepts.dc.html`, `PondPicker.dc.html` and `pond-charts.js` —
 * every file these suites read — are byte-identical in both, verified by diff.
 *
 * This mirrors `scripts/board-values/source.mts`, which does the same job for the
 * extractor. Two copies rather than one shared module because that one is an `.mts`
 * ES module run by Node directly and this one is CommonJS under jest.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export const HANDOFF = 'wayfinder/design_handoff_pond'

/** True when the handoff folder is checked out rather than read from git. */
export function handoffOnDisk(): boolean {
  return fs.existsSync(path.join(process.cwd(), HANDOFF))
}

/** Read one handoff file by name, e.g. `PondPicker.dc.html` or `pond-charts.js`. */
export function readHandoff(file: string): string {
  const onDisk = path.join(process.cwd(), HANDOFF, file)
  if (fs.existsSync(onDisk)) return fs.readFileSync(onDisk, 'utf8')

  try {
    // 64 MB: the largest board is 542 KB, but the default 1 MB buffer would
    // truncate the big ones silently rather than failing.
    return execFileSync('git', ['show', `HEAD:${HANDOFF}/${file}`], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (err) {
    throw new Error(
      `Cannot read ${HANDOFF}/${file}: not in the working tree, and ` +
        `\`git show HEAD:${HANDOFF}/${file}\` failed. The boards live in the Claude ` +
        `Design project (read them with DesignSync); if they are gone from git too, ` +
        `these board-adherence suites need a committed snapshot. Cause: ${(err as Error).message}`
    )
  }
}
