/**
 * `getOrCreateTasksDatabase` / `pickTasksDatabase` (KAN-536) — the one shared
 * `tasks` database per pond, looked up by role (`props._role`), never by title.
 * Runs against the shared fake Supabase, same harness as `create-database.test.ts`.
 */

import { getOrCreateTasksDatabase, pickTasksDatabase, TASKS_FIELDS } from '@/lib/pages/tasks-database'
import { readSchema } from '@/lib/properties/schema'
import { existingRoot, makeFakeSupabase, type Row } from './helpers/fake-supabase'

/** `NODE_ENV` is typed read-only (`@types/node`); this is the same deliberate
 *  exception `trash-page.test.tsx` and `change-log-trash-view.test.ts` use —
 *  needed to exercise `pickTasksDatabase`'s production fallback, since jest
 *  itself runs with `NODE_ENV=test`. */
const setNodeEnv = (value: string | undefined): void => {
  (process.env as { NODE_ENV: string | undefined }).NODE_ENV = value
}

function tasksRow(
  id: string,
  createdAt: string,
  props: Record<string, unknown> = { _role: 'tasks' }
): Row & { created_at: string } {
  return {
    id,
    user_id: 'user-1',
    parent_id: 'root-db',
    type: 'page',
    title: 'tasks',
    blocks: [],
    props,
    order: 0,
    created_at: createdAt,
  }
}

describe('TASKS_FIELDS', () => {
  it('is the board defaults plus a project tag field, in order', () => {
    expect(TASKS_FIELDS.map((f) => f.name)).toEqual([
      'status',
      'done',
      'due',
      'repeats',
      'assignee',
      'project',
    ])
    expect(TASKS_FIELDS.find((f) => f.name === 'project')?.type).toBe('select')
  })
})

describe('pickTasksDatabase', () => {
  const ordinary = tasksRow('ordinary-tasks', '2020-01-01T00:00:00.000Z', {})
  const roleA = tasksRow('role-a', '2020-01-01T00:00:00.000Z')
  const roleB = tasksRow('role-b', '2021-01-01T00:00:00.000Z')

  it('returns null when no row carries the role', () => {
    expect(pickTasksDatabase([ordinary])).toBeNull()
  })

  it('ignores an ordinary database titled "tasks" with no role', () => {
    expect(pickTasksDatabase([ordinary, roleA])).toEqual(roleA)
  })

  it('returns the single role row', () => {
    expect(pickTasksDatabase([roleA])).toEqual(roleA)
  })

  it('throws in development when two rows carry the role', () => {
    const prev = process.env.NODE_ENV
    setNodeEnv('development')
    try {
      expect(() => pickTasksDatabase([roleB, roleA])).toThrow(/tasks-role databases/)
    } finally {
      setNodeEnv(prev)
    }
  })

  it('logs and falls back to the oldest in production when two rows carry the role', () => {
    const prev = process.env.NODE_ENV
    setNodeEnv('production')
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(pickTasksDatabase([roleB, roleA])).toEqual(roleA)
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
      setNodeEnv(prev)
    }
  })
})

describe('getOrCreateTasksDatabase', () => {
  it('creates the role database on first use, with _role and the 6 fields', async () => {
    const sb = makeFakeSupabase([existingRoot])
    const made = await getOrCreateTasksDatabase(sb as never, null)

    const database = sb._pages.get(made.id)!
    expect(database.parent_id).toBe('root-db')
    expect(database.title).toBe('tasks')
    expect(database.props._role).toBe('tasks')
    expect(readSchema(database.props)?.map((f) => f.name)).toEqual([
      'status',
      'done',
      'due',
      'repeats',
      'assignee',
      'project',
    ])
    expect(made.schema).toEqual(readSchema(database.props))
  })

  it('reuses the role database on a second call rather than creating another', async () => {
    const sb = makeFakeSupabase([existingRoot])
    const first = await getOrCreateTasksDatabase(sb as never, null)
    const sizeAfterFirst = sb._pages.size

    const second = await getOrCreateTasksDatabase(sb as never, null)

    expect(second.id).toBe(first.id)
    expect(sb._pages.size).toBe(sizeAfterFirst)
  })

  it('never picks an ordinary database titled "tasks" that carries no role', async () => {
    const ordinary = tasksRow('ordinary-tasks', '2020-01-01T00:00:00.000Z', {})
    const sb = makeFakeSupabase([existingRoot, ordinary])

    const made = await getOrCreateTasksDatabase(sb as never, null)

    expect(made.id).not.toBe('ordinary-tasks')
    expect(sb._pages.get(made.id)!.props._role).toBe('tasks')
  })

  it('two role databases: creation is never reached, reuse falls back to the oldest', async () => {
    const prev = process.env.NODE_ENV
    setNodeEnv('production')
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const roleA = tasksRow('role-a', '2020-01-01T00:00:00.000Z')
      const roleB = tasksRow('role-b', '2021-01-01T00:00:00.000Z')
      const sb = makeFakeSupabase([existingRoot, roleB, roleA])

      const made = await getOrCreateTasksDatabase(sb as never, null)

      expect(made.id).toBe('role-a')
    } finally {
      spy.mockRestore()
      setNodeEnv(prev)
    }
  })

  it('adds the project field, as an own edit, when the found role database lacks one', async () => {
    const minimalSchema = [{ id: 'f-status', name: 'status', type: 'status' as const }]
    const roleRow = tasksRow('role-db', '2020-01-01T00:00:00.000Z', {
      _role: 'tasks',
      _schema: minimalSchema,
    })
    const sb = makeFakeSupabase([existingRoot, roleRow])

    const made = await getOrCreateTasksDatabase(sb as never, null)

    expect(made.id).toBe('role-db')
    expect(made.schema.map((f) => f.name)).toEqual(['status', 'project'])
    expect(made.schema.find((f) => f.name === 'project')?.type).toBe('select')
    expect(readSchema(sb._pages.get('role-db')!.props)).toEqual(made.schema)
  })
})
