/**
 * Editing-reliability eval — launcher. See eval-editing.impl.mts for the actual
 * eval and scripts/_launch.mts for why the re-exec + alias hook exists.
 *
 * Run:        node --env-file=.env.local scripts/eval-editing.mts
 * Flake mode: node --env-file=.env.local scripts/eval-editing.mts --runs 3
 */
import { launchWithAliasHook } from './_launch.mts'

await launchWithAliasHook(import.meta.filename, () => import('./eval-editing.impl.mts'))
