'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { dialogBackdropClass } from '@/components/atoms/dialog-chrome'

export interface PaletteItem {
  id: string
  /** Display label. */
  label: string
  /** Muted subtitle (section name, description, or path). */
  subtitle?: string
  /** Visual grouping: 'page' | 'action' | 'recent'. */
  group: 'page' | 'action' | 'recent'
}

export interface CommandPaletteProps {
  items: PaletteItem[]
  onSelect: (item: PaletteItem) => void
  onClose: () => void
}

const GROUP_LABELS: Record<PaletteItem['group'], string> = {
  page: 'Pages',
  action: 'Quick actions',
  recent: 'Recent',
}
const GROUP_ORDER: PaletteItem['group'][] = ['action', 'recent', 'page']

function groupItems(
  filtered: PaletteItem[]
): Array<{ group: PaletteItem['group']; items: PaletteItem[] }> {
  const map = new Map<PaletteItem['group'], PaletteItem[]>()
  for (const item of filtered) {
    if (!map.has(item.group)) map.set(item.group, [])
    map.get(item.group)!.push(item)
  }
  return GROUP_ORDER.flatMap((g) => {
    const items = map.get(g)
    return items ? [{ group: g, items }] : []
  })
}

/** Centered ⌘K command palette — reuses SlashMenu's keyboard-nav internals. */
export function CommandPalette({ items, onSelect, onClose }: CommandPaletteProps) {
  const [filter, setFilter] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = filter
    ? items.filter((item) => item.label.toLowerCase().includes(filter.toLowerCase()))
    : items

  const flatFiltered = groupItems(filtered).flatMap((g) => g.items)
  const clampedIndex = Math.min(activeIndex, Math.max(0, flatFiltered.length - 1))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Scroll active item into view (mirrors SlashMenu).
  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const active = container.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [clampedIndex, flatFiltered.length])

  // Close on Escape or click-outside.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      // ⌘K while open → close (toggle).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [onClose])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, flatFiltered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = flatFiltered[clampedIndex]
      if (selected) onSelect(selected)
    }
  }

  const groups = groupItems(filtered)
  let runningIndex = 0

  return (
    // Backdrop
    <div
      className={cn(dialogBackdropClass, 'flex items-start justify-center pt-[15vh]')}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label="Command palette"
    >
      {/* Panel — stop click-propagation so clicks inside don't close */}
      <div
        className="mn-arrive mn-glass w-full max-w-lg rounded-mn-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="border-b border-mn-hair px-4 py-3 flex items-center gap-3">
          <span
            className="rounded-mn-chrome bg-mn-wash px-1.5 py-0.5 font-mono lowercase tracking-wider text-xs text-mn-text-faint select-none"
            aria-hidden
          >
            ⌘K
          </span>
          <input
            ref={inputRef}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="search pages or actions…"
            className="flex-1 bg-transparent font-mono lowercase tracking-wider text-sm outline-none placeholder:text-mn-text-faint text-mn-text-meta"
            aria-label="Search pages or actions"
            aria-autocomplete="list"
            role="combobox"
            aria-expanded="true"
          />
          <button
            onClick={onClose}
            className="font-mono lowercase tracking-wider text-xs text-mn-text-faint hover:text-mn-text-meta transition-colors"
            aria-label="Close palette"
          >
            esc
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto max-h-80" role="listbox">
          {flatFiltered.length === 0 ? (
            <p className="px-4 py-3 font-mono lowercase tracking-wider text-sm text-mn-text-secondary">
              no results
            </p>
          ) : (
            groups.map(({ group, items: groupItems }) => {
              const startIndex = runningIndex
              runningIndex += groupItems.length
              return (
                <div key={group}>
                  <div className="px-4 pt-3 pb-1 font-mono lowercase tracking-wider text-[0.65rem] text-mn-text-faint">
                    {GROUP_LABELS[group]}
                  </div>
                  {groupItems.map((item, localI) => {
                    const globalI = startIndex + localI
                    const isActive = globalI === clampedIndex
                    return (
                      <button
                        key={item.id}
                        className={cn(
                          'w-full text-left rounded-mn-row px-3 py-2 transition-colors outline-none',
                          isActive ? 'bg-mn-selected-fill' : 'hover:bg-mn-wash'
                        )}
                        data-active={isActive ? 'true' : undefined}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIndex(globalI)}
                        onClick={() => onSelect(item)}
                      >
                        <div className="font-mono lowercase tracking-wider text-sm text-mn-text-meta truncate">
                          {item.label}
                        </div>
                        {item.subtitle && (
                          <div className="font-mono lowercase tracking-wider text-[0.65rem] text-mn-text-secondary truncate mt-0.5">
                            {item.subtitle}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-mn-hair px-4 py-2 flex gap-4 font-mono lowercase tracking-wider text-xs text-mn-text-faint">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
