'use client'

/**
 * How often an event occurs. One record keeps the start date. The phrase is
 * what the calendar projects onto later days (`occursOn`).
 */

import { useRef, useState } from 'react'
import type { PropertyValue } from '@/lib/properties/schema'
import { RepeatMark } from './cells'
import { MENU_ON_CARD } from './menu-surface'
import { useDismissOnOutside } from '@/lib/use-dismiss-on-outside'

export const REPEAT_CHOICES = [
  { value: '', label: "doesn't repeat" },
  { value: 'every day', label: 'every day' },
  { value: 'every week', label: 'every week' },
  { value: 'every weekday', label: 'every weekday' },
  { value: 'every month', label: 'every month' },
  { value: 'every year', label: 'every year' },
] as const

export function repeatLabel(value: PropertyValue): string {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return REPEAT_CHOICES.find((choice) => choice.value === text)?.label ?? (text || "doesn't repeat")
}

const ROW =
  'flex w-full rounded-[8px] px-[8px] py-[7px] text-left text-[13.5px] text-mn-text hover:bg-mn-hover-fill'

export function RepeatField({
  value,
  editable,
  onChange,
}: {
  value: PropertyValue
  editable: boolean
  onChange: (phrase: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useDismissOnOutside(open, () => setOpen(false), [rootRef])
  const current = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const label = repeatLabel(value)

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-label="repeats"
        aria-expanded={open}
        disabled={!editable}
        onClick={() => setOpen((next) => !next)}
        className="flex items-center gap-[6px] text-left text-[13.5px] text-mn-text disabled:cursor-default"
      >
        <RepeatMark />
        <span>{label}</span>
      </button>
      {open && editable && (
        <div
          role="listbox"
          aria-label="how often"
          className={`absolute top-full left-0 z-10 mt-1 w-[11rem] rounded-[12px] p-1 ${MENU_ON_CARD}`}
        >
          {REPEAT_CHOICES.map((choice) => (
            <button
              key={choice.label}
              type="button"
              role="option"
              aria-selected={choice.value === current}
              className={ROW}
              onClick={() => {
                onChange(choice.value)
                setOpen(false)
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
