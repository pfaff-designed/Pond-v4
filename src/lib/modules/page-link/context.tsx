'use client'

/**
 * F27 — the capability seam for card→page links.
 *
 * `ModuleViewProps` is deliberately minimal (`{ data, editable?, onChange? }`), and
 * the codebase's idiom for ambient, host-supplied capabilities is React context
 * (`SiblingBlocksProvider`, the cross-page-metric context) — NOT prop-threading
 * through `BlockCanvas → ModuleView → view`. So a view that can link cards to pages
 * reads those capabilities from here.
 *
 * The provider is mounted by the host that owns the page + caches + router
 * (`DocumentPanel`). `usePageLinks()` returns `null` when no provider is mounted
 * (the AI terminal's read-only reference render, Storybook) — the consuming view
 * then degrades to its pre-F27 behavior (no link actions, plain cards). Generic by
 * name (`page-link`, not kanban) so future view-over-pages modules reuse it.
 */

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { PageRef } from './resolve'
export type { PageRef } from './resolve'

export interface PageLinkCapabilities {
  /** A linked page's live ref from the rows cache, or null when it's been deleted. */
  resolvePage(pageId: string): PageRef | null
  /** Navigate to a page in the current panel (same-panel, like the rail). */
  navigateToPage(ref: PageRef): void
  /** Mint a child page under the containing page and link-ready ref it back. */
  createLinkedPage(title: string): Promise<PageRef>
  /** Rename a linked page — write-through from a linked card's title edit. */
  renamePage(pageId: string, title: string): Promise<void>
  /** Candidate pages for the "link existing" picker (rows-cache substring match). */
  searchPages(query: string): PageRef[]
}

const PageLinkContext = createContext<PageLinkCapabilities | null>(null)

export function PageLinkProvider({
  value,
  children,
}: {
  value: PageLinkCapabilities
  children: ReactNode
}) {
  return <PageLinkContext.Provider value={value}>{children}</PageLinkContext.Provider>
}

/** Read the link capabilities, or null when no host provides them. */
export function usePageLinks(): PageLinkCapabilities | null {
  return useContext(PageLinkContext)
}
