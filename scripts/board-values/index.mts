/**
 * Builds the whole `wayfinder/board-values.generated.json` document.
 *
 * Scope is deliberately the boards M0 needs, not the entire handoff — see
 * `COMPONENTS` / `BOARDS` below and the `skipped` block in the output.
 */

import { buildBoard, type BoardValues } from './board.mts'
import { compileVals, readDcFile, readPondCharts } from './dc.mts'
import { buildComponent, type ComponentValues } from './matrix.mts'
import { README, SKIPPED } from './readme.mts'
import { serialise } from './serialise.mts'
import { HANDOFF, readHandoffFile } from './source.mts'

export { HANDOFF }

/** Component `.dc.html` files: logic-driven, read by running `renderVals()`. */
export const COMPONENTS = [
  'PondAtom',
  'PondBlock',
  'PondChart',
  'PondComposer',
  'PondControl',
  'PondMolecule',
  'PondPicker',
  'PondRail',
  'PondTemplate',
]

/** Static boards: read by parsing inline `style` attributes. */
export const BOARDS = ['Pond 02 Component library', 'Pond 03 Concepts']

export type BoardValuesDoc = {
  readme: typeof README
  generatedFrom: string
  components: Record<string, ComponentValues>
  boards: Record<string, BoardValues>
  skipped: typeof SKIPPED
}

export { serialise }

export async function buildDoc(repoRoot: string): Promise<BoardValuesDoc> {
  // Reads the working tree if the handoff is checked out, else the committed copy
  // in git — the folder was deliberately deleted (see source.mts).
  const read = (name: string) => readHandoffFile(repoRoot, `${name}.dc.html`)
  const PondCharts = readPondCharts(readHandoffFile(repoRoot, 'pond-charts.js'))

  const components: Record<string, ComponentValues> = {}
  for (const name of COMPONENTS) {
    const html = read(name)
    const { propsSchema, logicSrc } = readDcFile(html, name)
    components[name] = buildComponent({
      source: `${HANDOFF}/${name}.dc.html`,
      schema: propsSchema,
      vals: compileVals(logicSrc, name, { PondCharts }),
    })
  }

  const boards: Record<string, BoardValues> = {}
  for (const name of BOARDS) {
    boards[name] = buildBoard(read(name), `${HANDOFF}/${name}.dc.html`)
  }

  return { readme: README, generatedFrom: HANDOFF, components, boards, skipped: SKIPPED }
}
