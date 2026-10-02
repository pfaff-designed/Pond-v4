/**
 * Builds the whole `wayfinder/board-values.generated.json` document.
 *
 * Scope is deliberately the boards M0 needs, not the entire handoff — see
 * `COMPONENTS` / `BOARDS` below and the `skipped` block in the output.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildBoard, type BoardValues } from './board.mts'
import { compileVals, readDcFile, readPondCharts } from './dc.mts'
import { buildComponent, type ComponentValues } from './matrix.mts'
import { README, SKIPPED } from './readme.mts'
import { serialise } from './serialise.mts'

export const HANDOFF = 'wayfinder/design_handoff_pond'

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
  const read = (name: string) => readFile(path.join(repoRoot, HANDOFF, `${name}.dc.html`), 'utf8')
  const PondCharts = readPondCharts(
    await readFile(path.join(repoRoot, HANDOFF, 'pond-charts.js'), 'utf8')
  )

  const components: Record<string, ComponentValues> = {}
  for (const name of COMPONENTS) {
    const html = await read(name)
    const { propsSchema, logicSrc } = readDcFile(html, name)
    components[name] = buildComponent({
      source: `${HANDOFF}/${name}.dc.html`,
      schema: propsSchema,
      vals: compileVals(logicSrc, name, { PondCharts }),
    })
  }

  const boards: Record<string, BoardValues> = {}
  for (const name of BOARDS) {
    boards[name] = buildBoard(await read(name), `${HANDOFF}/${name}.dc.html`)
  }

  return { readme: README, generatedFrom: HANDOFF, components, boards, skipped: SKIPPED }
}
