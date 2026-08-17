/**
 * Shared eval launcher: re-exec with the `@/` alias resolve hook, then run the impl.
 *
 * Why: the evals import REAL app modules, which use the `@/` path alias and
 * extensionless imports internally. Node's native TS runner resolves neither, so
 * scripts/_alias-hook.mts must be registered BEFORE any app module loads. A hook
 * can't be registered from inside the same module graph (static ESM imports hoist
 * above top-level code), so the entry script re-execs itself once with `--import`
 * and only then dynamic-imports the impl. This keeps the documented
 * `node --env-file=.env.local scripts/<eval>.mts` run command working verbatim.
 */
import { spawnSync } from 'node:child_process'

export async function launchWithAliasHook(
  entryFilename: string,
  importImpl: () => Promise<unknown>,
): Promise<void> {
  if (!process.env.__ALIAS_HOOK__) {
    const hook = new URL('./_alias-hook.mts', import.meta.url)
    const r = spawnSync(
      process.execPath,
      ['--import', hook.href, entryFilename, ...process.argv.slice(2)],
      { stdio: 'inherit', env: { ...process.env, __ALIAS_HOOK__: '1' } },
    )
    process.exit(r.status ?? 1)
  }
  await importImpl()
}
