'use client'

import type { ModuleViewProps } from '../types'
import { usePageLinks } from './context'
import type { PageLinkBlock } from './schema'

/**
 * The page-link row (6k frame 2), inline values: `display:flex;align-items:
 * center;gap:10px;padding:10px 4px;border-bottom:1px solid rgba(27,29,20,.09);
 * font-size:14px`. One focusable row, no card.
 *
 * `N blocks` is a placeholder literal for now (KAN-122's live-count item is a
 * later pass).
 */
const ROW =
  'flex items-center gap-[10px] border-b border-mn-text/[0.09] px-1 py-[10px] text-[14px]'

function PageIcon() {
  return (
    <span aria-hidden className="flex flex-none text-mn-text-meta">
      <svg
        width="13"
        height="13"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 2h5l2.5 2.5V12h-7.5zM8.5 2v2.5H11" />
      </svg>
    </span>
  )
}

export function PageLinkView({ data }: ModuleViewProps<PageLinkBlock>) {
  const pageLinks = usePageLinks()
  const ref = pageLinks?.resolvePage(data.pageId) ?? null

  // No provider (Storybook, the AI terminal's reference render) degrades the
  // same way as a deleted page: 6k draws no missing state, so this is the
  // ticket's own stated choice for both.
  if (!ref) {
    return (
      <div className={ROW}>
        <PageIcon />
        <span className="flex-1 text-mn-text-secondary">page in trash</span>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${ref.title}`}
      className={`${ROW} cursor-pointer`}
      onClick={() => pageLinks!.navigateToPage(ref)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        pageLinks!.navigateToPage(ref)
      }}
    >
      <PageIcon />
      <span className="flex-1 font-medium text-mn-text">{ref.title}</span>
      {ref.isNew && (
        <span className="font-mono text-[10.5px] lowercase tracking-tight text-mn-text-meta">
          new
        </span>
      )}
      <span className="text-[12.5px] text-mn-text-secondary">0 blocks</span>
      <span aria-hidden className="text-mn-text-meta">
        ›
      </span>
    </div>
  )
}
