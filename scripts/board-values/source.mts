/**
 * Resolves a handoff file, whether or not the folder is on disk.
 *
 * The boards now live in a Claude Design project, and
 * `wayfinder/design_handoff_pond/` was deliberately deleted from the working tree
 * on 2026-10-04. Git still tracks every one of those 260 files at the same paths,
 * so the committed copy is a complete, offline, hermetic fallback — no auth, no
 * network, no restoring a folder the user removed on purpose.
 *
 * Order: the working tree first, so a local checkout of the handoff still wins and
 * a person editing a board sees the effect immediately; then `git show HEAD:…`.
 *
 * `DesignSync` (the MCP tool that reads the Claude Design project) is deliberately
 * NOT used here: it needs an interactive `/design-login` and is not reachable from
 * a test or a script process. Where the committed copy could be behind the design
 * project, say so rather than pretending otherwise — as of 2026-10-04 the only
 * drift is in the `Pond 06.xx` storyboards, which gained a nav entry for the new
 * `Pond 06.21 Tasks` board. None of the files this module reads is affected.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const HANDOFF = 'wayfinder/design_handoff_pond'

/** True when the handoff folder is checked out rather than read from git. */
export function handoffOnDisk(repoRoot: string): boolean {
  return existsSync(path.join(repoRoot, HANDOFF))
}

/**
 * Read one handoff file by its name within the handoff folder, e.g.
 * `PondPicker.dc.html` or `pond-charts.js`.
 */
export function readHandoffFile(repoRoot: string, file: string): string {
  const onDisk = path.join(repoRoot, HANDOFF, file)
  if (existsSync(onDisk)) return readFileSync(onDisk, 'utf8')

  try {
    // 64 MB: `Pond 10 Examples.dc.html` is 522 KB, the largest by far, but the
    // default 1 MB buffer would still truncate the big boards silently.
    return execFileSync('git', ['show', `HEAD:${HANDOFF}/${file}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (err) {
    throw new Error(
      `Cannot read ${HANDOFF}/${file}. It is not in the working tree and ` +
        `\`git show HEAD:${HANDOFF}/${file}\` failed. The boards live in the Claude ` +
        `Design project; if they have been removed from git too, this extractor ` +
        `needs a committed snapshot instead. Original error: ${(err as Error).message}`
    )
  }
}
