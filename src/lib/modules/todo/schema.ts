import { z } from 'zod'
import type { ModuleDescriptor } from '../types'

export const todoItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  checked: z.boolean(),
})

/** A checklist. Items carry their own stable ids for targeted edits. */
export const todoSchema = z.object({
  id: z.string(),
  type: z.literal('todo'),
  items: z.array(todoItemSchema),
})

export type TodoItem = z.infer<typeof todoItemSchema>
export type TodoBlock = z.infer<typeof todoSchema>

export const todoDescriptor: ModuleDescriptor<TodoBlock> = {
  type: 'todo',
  schema: todoSchema,
  description:
    'A checklist of items, each toggleable done/undone. Use for tasks, steps, packing lists, or any set of things to track completion on.',
  serialize: (data) =>
    data.items.map((item) => `- [${item.checked ? 'x' : ' '}] ${item.label}`).join('\n'),
  preview: (data) => data.items.map((item) => item.label).join(', '),
  nestedIdPaths: ['items'],
}
