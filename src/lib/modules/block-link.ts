'use client'

/**
 * A link to one block: the page's own URL anchored at the block's DOM id
 * (`#block-<id>`, minted by `blockDomId`). The block menu's `copy link to block`
 * copies it; arriving at it scrolls to the block and focuses it.
 */

import { useEffect, useRef, useState } from 'react'
import type { Block } from './content'
import { blockDomId, scrollToBlock } from './block-dom'

/** `href` with its hash replaced by the block's anchor; query and path kept. */
export const blockLinkUrl = (href: string, blockId: string): string => {
  const url = new URL(href)
  url.hash = blockDomId(blockId)
  return url.toString()
}

/**
 * Land on the block a URL's hash names — once per hash, and again when the hash
 * changes on an open page. Keyed on `blocks` too, because a page's blocks may
 * arrive after the URL does. The host stamps each block's wrapper with
 * `blockDomId` and makes it focusable.
 */
export const useBlockLinkArrival = (blocks: readonly Block[]) => {
  const landedOn = useRef<string | null>(null)
  const [hashChanges, setHashChanges] = useState(0)

  useEffect(() => {
    const handleHashChange = () => {
      landedOn.current = null
      setHashChanges((n) => n + 1)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    const hash = window.location.hash
    if (hash === '' || landedOn.current === hash) return
    const target = blocks.find((b) => `#${blockDomId(b.id)}` === hash)
    const el = target ? document.getElementById(blockDomId(target.id)) : null
    if (!target || !el) return
    landedOn.current = hash
    scrollToBlock(target.id)
    el.focus({ preventScroll: true })
  }, [blocks, hashChanges])
}
