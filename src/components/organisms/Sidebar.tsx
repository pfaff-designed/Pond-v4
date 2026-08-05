'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { NodeCreationModal } from './NodeCreationModal'

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
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const seededRef = useRef(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { data: areas = [], isLoading } = useQuery({
    queryKey: ['areas'],
    queryFn: fetchAreas,
  })

  // Seed default areas on first login — fires once when areas is empty after load
  useEffect(() => {
    if (isLoading || areas.length > 0 || seededRef.current) return
    seededRef.current = true

    async function seed() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)('seed_default_areas', { p_user_id: user.id })
      queryClient.invalidateQueries({ queryKey: ['areas'] })
    }

    seed()
  }, [isLoading, areas.length, queryClient])

  const selectedNodeId = searchParams.get('nodeId')

  function selectArea(area: Area) {
    const params = new URLSearchParams({
      nodeType: 'area',
      nodeId: area.id,
      nodeName: area.name,
    })
    router.push(`/workspace?${params.toString()}`)
  }

  return (
    <aside className="w-64 flex-shrink-0 border-r border-zinc-200 flex flex-col h-full bg-zinc-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
        <span className="text-sm font-semibold text-zinc-800">Pond</span>
        <button
          className="text-zinc-400 hover:text-zinc-700 text-lg leading-none"
          title="New node"
          aria-label="New node"
          onClick={() => setIsModalOpen(true)}
        >
          +
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {isLoading && <p className="px-4 text-xs text-zinc-400">Loading…</p>}
        {!isLoading && areas.length === 0 && (
          <p className="px-4 text-xs text-zinc-400">Setting up your workspace…</p>
        )}
        {areas.map((area) => {
          const isSelected = area.id === selectedNodeId
          return (
            <button
              key={area.id}
              className={`w-full text-left px-4 py-1.5 text-sm rounded transition-colors ${
                isSelected
                  ? 'bg-zinc-200 text-zinc-900 font-medium'
                  : 'text-zinc-700 hover:bg-zinc-100'
              }`}
              onClick={() => selectArea(area)}
            >
              {area.name}
            </button>
          )
        })}
      </nav>

      <NodeCreationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={(id, type, name) => {
          setIsModalOpen(false)
          router.push(
            `/workspace?nodeType=${type}&nodeId=${id}&nodeName=${encodeURIComponent(name)}`
          )
        }}
      />
    </aside>
  )
}
