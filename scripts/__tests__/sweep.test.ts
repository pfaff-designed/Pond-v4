import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

// scripts/sweep.sh never checks out a branch in the checkout it runs from — it works
// from origin/main refs. This builds a throwaway origin+clone per run and proves that
// against the real script, never the real repo.

const SWEEP_SH = path.resolve(__dirname, '../sweep.sh')

const run = (cmd: string, args: string[], cwd: string) => {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} (cwd=${cwd}) failed:\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout.trim()
}

const git = (args: string[], cwd: string) => run('git', args, cwd)

const writeStubGh = (binDir: string) => {
  const ghPath = path.join(binDir, 'gh')
  fs.writeFileSync(ghPath, '#!/usr/bin/env bash\nexit 0\n')
  fs.chmodSync(ghPath, 0o755)
}

const runSweep = (cloneDir: string, binDir: string, args: string[]) =>
  spawnSync('bash', [SWEEP_SH, ...args], {
    cwd: cloneDir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
  })

describe('scripts/sweep.sh', () => {
  jest.setTimeout(30000)

  let tmpDir: string
  let originDir: string
  let cloneDir: string
  let binDir: string
  const dirtyFile = 'a.txt'

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-test-'))
    originDir = path.join(tmpDir, 'origin.git')
    cloneDir = path.join(tmpDir, 'clone')
    binDir = path.join(tmpDir, 'bin')
    fs.mkdirSync(binDir)
    writeStubGh(binDir)

    git(['init', '--bare', '-b', 'main', originDir], tmpDir)
    git(['clone', originDir, cloneDir], tmpDir)
    git(['config', 'user.email', 'sweep-test@example.com'], cloneDir)
    git(['config', 'user.name', 'Sweep Test'], cloneDir)
    git(['config', 'commit.gpgsign', 'false'], cloneDir)

    fs.writeFileSync(path.join(cloneDir, dirtyFile), 'original\n')
    git(['add', dirtyFile], cloneDir)
    git(['commit', '-m', 'initial'], cloneDir)
    git(['push', 'origin', 'main'], cloneDir)

    // merged-branch: branched off main, merged back into main, pushed — so its tip
    // is an ancestor of origin/main (ahead == 0), the --merged deletion path.
    git(['checkout', '-b', 'merged-branch'], cloneDir)
    fs.writeFileSync(path.join(cloneDir, 'b.txt'), 'b\n')
    git(['add', 'b.txt'], cloneDir)
    git(['commit', '-m', 'add b'], cloneDir)
    git(['checkout', 'main'], cloneDir)
    git(['merge', '--no-ff', 'merged-branch', '-m', 'merge merged-branch'], cloneDir)
    git(['push', 'origin', 'main'], cloneDir)

    // unmerged-branch: its own commit, never merged or pushed anywhere — ahead != 0,
    // and the stub gh reports no merged PR, so it must survive both runs.
    git(['checkout', '-b', 'unmerged-branch', 'main'], cloneDir)
    fs.writeFileSync(path.join(cloneDir, 'c.txt'), 'c\n')
    git(['add', 'c.txt'], cloneDir)
    git(['commit', '-m', 'add c'], cloneDir)

    // feature-branch: the checkout the script itself runs from, left on an
    // uncommitted edit — must never be switched or have the edit touched.
    git(['checkout', '-b', 'feature-branch', 'main'], cloneDir)
    fs.appendFileSync(path.join(cloneDir, dirtyFile), 'uncommitted edit\n')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const headBranch = () => git(['rev-parse', '--abbrev-ref', 'HEAD'], cloneDir)
  const dirtyContent = () => fs.readFileSync(path.join(cloneDir, dirtyFile), 'utf8')
  const hasBranch = (name: string) => git(['branch', '--list', name], cloneDir).length > 0

  it('dry-run lists the merged branch without deleting it, and leaves the dirty checkout untouched', () => {
    const originalHead = headBranch()
    const originalContent = dirtyContent()

    const result = runSweep(cloneDir, binDir, ['--dry-run'])

    expect(result.status).toBe(0)
    expect(headBranch()).toBe(originalHead)
    expect(dirtyContent()).toBe(originalContent)
    expect(hasBranch('merged-branch')).toBe(true)
    expect(hasBranch('unmerged-branch')).toBe(true)
    expect(result.stdout).toMatch(/would delete.*merged-branch/)
  })

  it('a real run deletes the merged branch, keeps the unmerged one, and leaves the dirty checkout untouched', () => {
    const originalHead = headBranch()
    const originalContent = dirtyContent()

    const result = runSweep(cloneDir, binDir, [])

    expect(result.status).toBe(0)
    expect(headBranch()).toBe(originalHead)
    expect(dirtyContent()).toBe(originalContent)
    expect(hasBranch('merged-branch')).toBe(false)
    expect(hasBranch('unmerged-branch')).toBe(true)
  })
})
