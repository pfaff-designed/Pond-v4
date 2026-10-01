/**
 * SourceList (ticket-29) — the citation row shown under an assistant answer that
 * used web search. Each source is a title (or the host, when the provider gives no
 * title) linking out to its URL. The AI terminal collects the `source-url` message
 * parts the Anthropic web_search tool streams (via the route's `sendSources`) and
 * hands them here.
 *
 * Purely presentational and layout-light: it sits inside the transcript bubble as a
 * small "Sources" affordance, deliberately quiet so it doesn't compete with the
 * answer. Aesthetics are Press tokens only (ticket-32 owns the terminal look);
 * nothing bespoke here.
 */

import { kickerClass } from '@/components/atoms/kicker'

export interface Source {
  /** Stable id for the source (React key). */
  sourceId: string
  url: string
  /** Provider-supplied title; falls back to the host when absent. */
  title?: string
}

/** Human label for a source: its title, else the bare host. */
function sourceLabel(source: Source): string {
  if (source.title && source.title.trim()) return source.title.trim()
  try {
    return new URL(source.url).hostname.replace(/^www\./, '')
  } catch {
    return source.url
  }
}

export interface SourceListProps {
  sources: Source[]
}

/** First occurrence per URL wins — the provider can cite one page several times. */
function dedupeByUrl(sources: Source[]): Source[] {
  const seen = new Set<string>()
  return sources.filter((s) => {
    if (seen.has(s.url)) return false
    seen.add(s.url)
    return true
  })
}

export function SourceList({ sources: rawSources }: SourceListProps) {
  const sources = dedupeByUrl(rawSources)
  if (sources.length === 0) return null
  return (
    <div className="mt-2.5 border-t border-mn-hair pt-2 text-xs text-mn-text-secondary">
      <span className={`mr-1 ${kickerClass}`}>Sources</span>
      <ol className="mt-1.5 space-y-1">
        {sources.map((source, i) => (
          <li key={source.sourceId} className="flex gap-1.5">
            <span aria-hidden className="tabular-nums text-mn-text-secondary">
              {i + 1}.
            </span>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-mono lowercase text-mn-text underline-offset-2 hover:underline"
              title={source.url}
            >
              {sourceLabel(source)}
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}
