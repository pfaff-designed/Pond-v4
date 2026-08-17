/**
 * Routing eval — launcher. See eval-routing.impl.mts for the actual eval and
 * scripts/_launch.mts for why the re-exec + alias hook exists.
 *
 * Run:        node --env-file=.env.local scripts/eval-routing.mts
 * Flake mode: node --env-file=.env.local scripts/eval-routing.mts --runs 3
 */
import { launchWithAliasHook } from './_launch.mts'

await launchWithAliasHook(import.meta.filename, () => import('./eval-routing.impl.mts'))
