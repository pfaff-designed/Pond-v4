/**
 * `src/lib/modules/view/schema.ts` is value-imported by the server chat route
 * (`src/app/api/chat/tools.ts`), so it must pull in no `src/components/` module —
 * a React/UI import there drags the client bundle into the server's. Walks
 * `schema.ts`'s own imports transitively (relative and `@/` specifiers; type-only
 * imports don't bundle, so they're skipped) and fails on the first path that
 * resolves under `src/components/`.
 */
import fs from 'fs'
import path from 'path'

const SRC_ROOT = path.resolve(__dirname, '..')
const ENTRY = path.resolve(SRC_ROOT, 'lib/modules/view/schema.ts')
const COMPONENTS_ROOT = path.resolve(SRC_ROOT, 'components')

const CANDIDATE_EXTENSIONS = ['.ts', '.tsx', '.d.ts']

function resolveModule(fromFile: string, specifier: string): string | null {
  let basePath: string
  if (specifier.startsWith('.')) {
    basePath = path.resolve(path.dirname(fromFile), specifier)
  } else if (specifier.startsWith('@/')) {
    basePath = path.resolve(SRC_ROOT, specifier.slice(2))
  } else {
    return null // external package — not followed
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath
  for (const ext of CANDIDATE_EXTENSIONS) {
    if (fs.existsSync(basePath + ext)) return basePath + ext
  }
  for (const ext of CANDIDATE_EXTENSIONS) {
    const indexPath = path.join(basePath, `index${ext}`)
    if (fs.existsSync(indexPath)) return indexPath
  }
  return null
}

/** Non-type `import`/`export … from '…'` specifiers in one file's source. */
function valueImportSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const importRe = /^\s*import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm
  let match: RegExpExecArray | null
  while ((match = importRe.exec(source))) {
    if (match[1]) continue // `import type ... from '...'` — type-only, not bundled
    specifiers.push(match[2])
  }
  const exportFromRe = /^\s*export\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm
  while ((match = exportFromRe.exec(source))) {
    if (match[1]) continue
    specifiers.push(match[2])
  }
  return specifiers
}

it('schema.ts pulls in no src/components/ module, transitively', () => {
  const visited = new Set<string>()
  const queue = [ENTRY]
  const offendingPaths: string[] = []

  while (queue.length > 0) {
    const file = queue.shift()!
    if (visited.has(file)) continue
    visited.add(file)

    const source = fs.readFileSync(file, 'utf8')
    for (const specifier of valueImportSpecifiers(source)) {
      const resolved = resolveModule(file, specifier)
      if (!resolved) continue
      if (resolved === COMPONENTS_ROOT || resolved.startsWith(COMPONENTS_ROOT + path.sep)) {
        offendingPaths.push(`${path.relative(SRC_ROOT, file)} -> ${path.relative(SRC_ROOT, resolved)}`)
        continue
      }
      if (!visited.has(resolved)) queue.push(resolved)
    }
  }

  expect(offendingPaths).toEqual([])
})
