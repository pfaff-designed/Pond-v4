/**
 * Pure backlink derivation (#39, #20 second-half slice B) —
 * src/lib/modules/view/compute-backlinks.ts. Backlinks are DERIVED, never stored:
 * given the workspace collections + one target, find every source row whose relation
 * points back at the target. Two pure halves:
 *   - findBacklinkSources — discovery: which (collection, relation property) pairs
 *     could link the target (target matches the target's collection OR is unset).
 *   - computeBacklinks — filter each source collection's rows to those that actually
 *     link the target, grouped by source property; garbage/dangling values tolerated.
 */
import {
  findBacklinkSources,
  computeBacklinks,
  type BacklinkPage,
  type BacklinkCandidate,
} from '@/lib/modules/view/compute-backlinks'
import { SCHEMA_KEY, type PropertyDef, type PropertySchema } from '@/lib/properties/schema'

// Two collections. `Tasks` has a relation `Project` targeting the Projects collection,
// plus an untargeted `Related` ("link any page"). `Notes` has a relation targeting a
// DIFFERENT collection. A plain page carries no schema.
const PROJECTS_ID = 'col-projects'
const OTHER_ID = 'col-other'

const collection = (id: string, title: string, schema: PropertySchema): BacklinkPage => ({
  id,
  title,
  props: { [SCHEMA_KEY]: schema },
})

const TASKS: BacklinkPage = collection('col-tasks', 'Tasks', [
  { id: 'p-title', name: 'Title', type: 'text' },
  { id: 'p-project', name: 'Project', type: 'relation', target: PROJECTS_ID },
  { id: 'p-related', name: 'Related', type: 'relation' }, // untargeted
])

const NOTES: BacklinkPage = collection('col-notes', 'Notes', [
  { id: 'p-about', name: 'About', type: 'relation', target: OTHER_ID },
])

const PLAIN: BacklinkPage = { id: 'page-plain', title: 'A page', props: {} }

const PAGES: BacklinkPage[] = [TASKS, NOTES, PLAIN]

describe('findBacklinkSources — discovery (targeted / untargeted matching)', () => {
  it('targeted match: a relation whose target IS the target collection is a source', () => {
    const sources = findBacklinkSources(PAGES, PROJECTS_ID)
    const projectRel = sources.find((s) => s.def.id === 'p-project')
    expect(projectRel).toMatchObject({
      sourceCollectionId: 'col-tasks',
      sourceCollectionTitle: 'Tasks',
    })
  })

  it('untargeted match: a relation with no target links any page, so it is always a source', () => {
    const sources = findBacklinkSources(PAGES, PROJECTS_ID)
    expect(sources.some((s) => s.def.id === 'p-related')).toBe(true)
  })

  it('no-match: a relation targeting a DIFFERENT collection is excluded; non-relation props excluded', () => {
    const sources = findBacklinkSources(PAGES, PROJECTS_ID)
    expect(sources.some((s) => s.def.id === 'p-about')).toBe(false) // targets col-other
    expect(sources.some((s) => s.def.id === 'p-title')).toBe(false) // not a relation
  })

  it('plain-page target (no collection): only untargeted relations are sources', () => {
    const sources = findBacklinkSources(PAGES, null)
    const ids = sources.map((s) => s.def.id).sort()
    expect(ids).toEqual(['p-related']) // p-project + p-about are targeted → excluded
  })
})

describe('computeBacklinks — filter + group', () => {
  const rel = (over: Partial<PropertyDef>): PropertyDef => ({
    id: 'r',
    name: 'R',
    type: 'relation',
    ...over,
  })

  it('returns only the source rows that link the target, mapped to id+title chips', () => {
    const candidate: BacklinkCandidate = {
      sourceCollectionId: 'col-tasks',
      sourceCollectionTitle: 'Tasks',
      def: rel({ id: 'p-project', name: 'Project', target: PROJECTS_ID }),
      rows: [
        { id: 'task-1', title: 'Fix bug', props: { 'p-project': ['proj-1'] } },
        { id: 'task-2', title: 'Ship it', props: { 'p-project': ['proj-1', 'proj-2'] } },
        { id: 'task-3', title: 'Unrelated', props: { 'p-project': ['proj-9'] } },
      ],
    }
    const groups = computeBacklinks('proj-1', [candidate])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      sourceCollectionId: 'col-tasks',
      sourceCollectionTitle: 'Tasks',
      propertyId: 'p-project',
      propertyName: 'Project',
    })
    expect(groups[0].rows).toEqual([
      { id: 'task-1', title: 'Fix bug' },
      { id: 'task-2', title: 'Ship it' },
    ])
  })

  it('groups by source property and drops a source with no inbound links', () => {
    const projectRel: BacklinkCandidate = {
      sourceCollectionId: 'col-tasks',
      sourceCollectionTitle: 'Tasks',
      def: rel({ id: 'p-project', name: 'Project', target: PROJECTS_ID }),
      rows: [{ id: 'task-1', title: 'Fix bug', props: { 'p-project': ['proj-1'] } }],
    }
    const relatedRel: BacklinkCandidate = {
      sourceCollectionId: 'col-tasks',
      sourceCollectionTitle: 'Tasks',
      def: rel({ id: 'p-related', name: 'Related' }),
      rows: [{ id: 'task-1', title: 'Fix bug', props: { 'p-related': ['proj-1'] } }],
    }
    const emptyRel: BacklinkCandidate = {
      sourceCollectionId: 'col-notes',
      sourceCollectionTitle: 'Notes',
      def: rel({ id: 'p-about', name: 'About' }),
      rows: [{ id: 'note-1', title: 'A note', props: { 'p-about': ['other'] } }],
    }
    const groups = computeBacklinks('proj-1', [projectRel, relatedRel, emptyRel])
    expect(groups.map((g) => g.propertyId)).toEqual(['p-project', 'p-related'])
  })

  it('tolerates dangling / garbage relation values without crashing (no match)', () => {
    const candidate: BacklinkCandidate = {
      sourceCollectionId: 'col-tasks',
      sourceCollectionTitle: 'Tasks',
      def: rel({ id: 'p-project', name: 'Project', target: PROJECTS_ID }),
      rows: [
        { id: 'task-1', title: 'Garbage', props: { 'p-project': 'not-an-array' } },
        { id: 'task-2', title: 'Missing key', props: {} },
        { id: 'task-3', title: 'Null', props: { 'p-project': null } },
      ],
    }
    expect(computeBacklinks('proj-1', [candidate])).toEqual([])
  })

  it('no candidates → empty result (target with no inbound links)', () => {
    expect(computeBacklinks('proj-1', [])).toEqual([])
  })
})
