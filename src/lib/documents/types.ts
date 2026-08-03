export interface TextBlock {
  id: string
  type: 'text'
  content: string // markdown
}

export interface TodoItem {
  id: string
  label: string
  checked: boolean
}

export interface TodoBlock {
  id: string
  type: 'todo'
  items: TodoItem[]
}

export interface MetricBlock {
  id: string
  type: 'metric'
  label: string
  value: number
  unit?: string
  trend?: 'up' | 'down' | 'flat'
}

export type Block = TextBlock | TodoBlock | MetricBlock
