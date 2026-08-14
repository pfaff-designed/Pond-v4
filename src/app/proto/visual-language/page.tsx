'use client'

/**
 * THROWAWAY switcher (ticket-14). Flip through the 57 aesthetic variants on one
 * fixed Pond shell. ←/→ to navigate, number strip to jump, "Hide UI" for clean
 * screenshots. Delete `src/app/proto/` once the direction is chosen.
 */

import { useCallback, useEffect, useState } from 'react'
import { variants } from './variants'

export default function VisualLanguagePage() {
  const [i, setI] = useState(0)
  const [chromeHidden, setChromeHidden] = useState(false)
  const v = variants[i]
  const go = useCallback((n: number) => setI((prev) => (n + variants.length) % variants.length), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') go(i + 1)
      else if (e.key === 'ArrowLeft') go(i - 1)
      else if (e.key.toLowerCase() === 'h') setChromeHidden((c) => !c)
      else if (/^[1-9]$/.test(e.key)) go(Number(e.key) - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, go])

  const Component = v.Component

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <Component key={v.id} />

      {!chromeHidden && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-4 px-5 py-2.5"
          style={{
            fontFamily: 'var(--proto-font-mono)',
            background: 'rgba(9,9,11,0.82)',
            backdropFilter: 'blur(12px)',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            color: '#e4e4e7',
          }}
        >
          <button onClick={() => go(i - 1)} className="px-2 text-lg leading-none hover:opacity-70" aria-label="Previous">
            ‹
          </button>

          <div className="flex min-w-0 flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] tabular-nums opacity-50">{String(i + 1).padStart(2, '0')}/{variants.length}</span>
              <span className="text-sm font-semibold" style={{ color: '#fff' }}>
                {v.name}
              </span>
              <span className="text-[11px] opacity-40">boldness {v.boldness}</span>
            </div>
            <span className="truncate text-[11px] opacity-60">{v.pov}</span>
          </div>

          {/* boldness pip strip */}
          <div className="ml-auto flex items-center gap-1">
            {variants.map((vv, idx) => (
              <button
                key={vv.id}
                onClick={() => go(idx)}
                title={`${vv.id}. ${vv.name}`}
                aria-label={`${vv.id}. ${vv.name}`}
                style={{
                  width: idx === i ? 22 : 8,
                  height: 8,
                  borderRadius: 999,
                  background:
                    idx === i
                      ? 'linear-gradient(90deg,#a78bfa,#ec4899)'
                      : `rgba(255,255,255,${0.15 + (idx / Math.max(1, variants.length - 1)) * 0.35})`,
                  transition: 'width 0.15s',
                }}
              />
            ))}
          </div>

          <button onClick={() => go(i + 1)} className="px-2 text-lg leading-none hover:opacity-70" aria-label="Next">
            ›
          </button>
          <button
            onClick={() => setChromeHidden(true)}
            className="ml-1 rounded px-2 py-1 text-[11px] opacity-60 hover:opacity-100"
            style={{ border: '1px solid rgba(255,255,255,0.15)' }}
          >
            Hide&nbsp;UI&nbsp;·&nbsp;h
          </button>
        </div>
      )}

      {chromeHidden && (
        <button
          onClick={() => setChromeHidden(false)}
          className="fixed bottom-3 right-3 z-50 rounded-full px-3 py-1.5 text-[11px]"
          style={{ fontFamily: 'var(--proto-font-mono)', background: 'rgba(9,9,11,0.7)', color: '#e4e4e7', backdropFilter: 'blur(8px)' }}
        >
          Show UI · h
        </button>
      )}
    </div>
  )
}
