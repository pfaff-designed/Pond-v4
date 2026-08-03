'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface Area {
  id: string
  name: string
  order: number
}

async function fetchAreas(): Promise<Area[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('user_id', user.id)
    .order('order')

  if (error) throw error
  return data ?? []
}

export function Sidebar() {
  const { data: areas = [], isLoading } = useQuery({
    queryKey: ['areas'],
    queryFn: fetchAreas,
  })

  return (
    <aside className="w-64 flex-shrink-0 border-r border-zinc-200 flex flex-col h-full bg-zinc-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
        <span className="text-sm font-semibold text-zinc-800">Pond</span>
        <button
          className="text-zinc-400 hover:text-zinc-700 text-lg leading-none"
          title="New node"
          onClick={() => {}}
        >
          +
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {isLoading && <p className="px-4 text-xs text-zinc-400">Loading…</p>}
        {!isLoading && areas.length === 0 && (
          <p className="px-4 text-xs text-zinc-400">No areas yet</p>
        )}
        {areas.map((area) => (
          <button
            key={area.id}
            className="w-full text-left px-4 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 rounded"
            onClick={() => {}}
          >
            {area.name}
          </button>
        ))}
      </nav>
    </aside>
  )
}
