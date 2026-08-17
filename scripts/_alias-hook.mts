/**
 * Resolve hook for standalone Node scripts (evals) that import REAL app source.
 *
 * Two mismatches between the app's TS and Node's native TS runner:
 *   1. The app uses the `@/` path alias (tsconfig `paths` → `src/*`). Node does not
 *      read tsconfig `paths`.
 *   2. App source uses EXTENSIONLESS imports (`@/lib/foo`, `./registry`). Node's
 *      native TS resolver requires an explicit `.ts`/`.tsx` extension or `index.ts`.
 *
 * This synchronous in-process hook (Node 24 `module.registerHooks`) rewrites `@/x`
 * to `src/x`, and for any extensionless specifier that would otherwise fail, tries
 * `.ts`, `.tsx`, and `/index.ts` — so evals can import unmodified app modules.
 *
 * Loaded via `--import` before any app code — see the self-reexec guard in each
 * eval launcher, which keeps `node --env-file=.env.local <script>` working verbatim.
 */
import * as nodeModule from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'

// `module.registerHooks` (synchronous, in-process) landed in Node 22.15/24, newer
// than the pinned @types/node (v20). Declare its shape locally so tsc stays clean
// without bumping the dep. Only the fields this hook uses are typed.
type ResolveContext = { parentURL?: string; conditions?: string[] }
type ResolveResult = { url: string; shortCircuit?: boolean }
type ResolveHook = (
  specifier: string,
  context: ResolveContext,
  nextResolve: (specifier: string, context?: ResolveContext) => ResolveResult,
) => ResolveResult
const registerHooks = (nodeModule as unknown as {
  registerHooks: (hooks: { resolve?: ResolveHook }) => void
}).registerHooks

const SRC = pathToFileURL(path.resolve(import.meta.dirname, '..', 'src') + '/').href

/** First existing candidate among the bare URL, `.ts`, `.tsx`, `/index.ts`. */
function firstExisting(baseHref: string): string | null {
  const candidates = [baseHref, `${baseHref}.ts`, `${baseHref}.tsx`, `${baseHref}/index.ts`]
  for (const c of candidates) {
    try {
      if (existsSync(fileURLToPath(c))) return c
    } catch {
      // non-file URL; skip
    }
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // 1. `@/…` alias → src/…, extension-resolved.
    if (specifier.startsWith('@/')) {
      const resolved = firstExisting(new URL(specifier.slice(2), SRC).href)
      return nextResolve(resolved ?? new URL(specifier.slice(2), SRC).href, context)
    }
    // 2. Extensionless relative import inside app source — add the extension.
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL &&
      !path.extname(specifier)
    ) {
      const resolved = firstExisting(new URL(specifier, context.parentURL).href)
      if (resolved) return nextResolve(resolved, context)
    }
    return nextResolve(specifier, context)
  },
})
