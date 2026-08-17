/**
 * Repair eval — launcher. See eval-repair.impl.mts for the actual eval and
 * scripts/_launch.mts for why the re-exec + alias hook exists.
 *
 * Run:  node --env-file=.env.local scripts/eval-repair.mts
 */
import { launchWithAliasHook } from './_launch.mts'

await launchWithAliasHook(import.meta.filename, () => import('./eval-repair.impl.mts'))
