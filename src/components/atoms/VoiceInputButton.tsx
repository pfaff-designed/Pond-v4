'use client'

/**
 * Mic button for voice input (ticket-40 F6).
 *
 * Uses webkitSpeechRecognition (Chrome / Edge browser STT — audio goes to the
 * browser vendor's cloud STT service; browser-only, no additional API key needed
 * for this personal app). Gracefully absent when the API is unavailable: renders
 * nothing so it doesn't clutter the composer in environments that don't support it.
 *
 * REVIEW-BEFORE-SEND: interim transcript is piped into `onTranscript` so the
 * user can edit the filled composer before sending. Nothing is auto-sent.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Extend window typing for webkit-prefixed API.
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition?: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition?: any
  }
}

export type VoiceState = 'idle' | 'listening' | 'unsupported'

export interface VoiceInputButtonProps {
  /** Called with the interim + final transcript as it arrives. */
  onTranscript: (text: string) => void
  /** While true (e.g. AI streaming), the button is visually disabled. */
  disabled?: boolean
  className?: string
}

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
  return Ctor ?? null
}

/** Quiet mic button. Returns null when the Speech API is unavailable. */
export function VoiceInputButton({ onTranscript, disabled, className }: VoiceInputButtonProps) {
  const [state, setState] = useState<VoiceState>('idle')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null)
  const [supported, setSupported] = useState<boolean | null>(null) // null = checking

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time browser-API detection, client-only, avoids SSR mismatch
    setSupported(getSpeechRecognition() !== null)
  }, [])

  const stop = useCallback(() => {
    recRef.current?.stop()
    recRef.current = null
    setState('idle')
  }, [])

  const start = useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR) return
    const rec = new SR()
    // Browser-cloud STT. See module note: audio is processed by the browser vendor.
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      onTranscript(transcript)
    }

    rec.onend = () => setState('idle')
    rec.onerror = () => setState('idle')

    recRef.current = rec
    rec.start()
    setState('listening')
  }, [onTranscript])

  const toggle = useCallback(() => {
    if (state === 'listening') {
      stop()
    } else {
      start()
    }
  }, [state, start, stop])

  // Clean up on unmount.
  useEffect(
    () => () => {
      recRef.current?.stop()
    },
    []
  )

  // Still checking or not supported → render nothing.
  if (supported === null || !supported) return null

  const isListening = state === 'listening'

  return (
    <button
      type="button"
      aria-label={isListening ? 'Stop recording' : 'Start voice input'}
      aria-pressed={isListening}
      onClick={toggle}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center w-6 h-6 rounded-full transition-colors',
        isListening ? 'text-raw-red animate-pulse' : 'text-mn-text-faint hover:text-mn-text',
        'disabled:opacity-40 disabled:pointer-events-none',
        className
      )}
      title={isListening ? 'Recording — click to stop' : 'Voice input'}
    >
      {/* Microphone icon (inline SVG — no icon dep required) */}
      <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" width={14} height={14}>
        <path d="M8 1a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0v-4A2.5 2.5 0 0 0 8 1Z" />
        <path d="M4 7.5a.5.5 0 0 0-1 0 5 5 0 0 0 4.5 4.975V14H6a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1H8.5v-1.525A5 5 0 0 0 13 7.5a.5.5 0 0 0-1 0 4 4 0 0 1-8 0Z" />
      </svg>
    </button>
  )
}
