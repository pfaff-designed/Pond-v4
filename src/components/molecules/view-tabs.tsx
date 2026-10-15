'use client'

/**
 * The headless view-switching engine `ViewBar` and the change log's view bar
 * (KAN-322) both sit on: base-ui `Tabs.Root` + `Tabs.List activateOnFocus`,
 * giving `role=tab`/`aria-selected` and roving ←/→ focus. No styles — each
 * caller draws its own row on top (`ViewBar`'s Pond 02 pill, the change
 * log's 6o row).
 */

import * as React from 'react'
import { Tabs } from '@base-ui/react/tabs'

export interface ViewTabsRootProps
  extends Omit<React.ComponentProps<typeof Tabs.Root>, 'value' | 'onValueChange'> {
  value: string
  onValueChange: (value: string) => void
}

export function ViewTabsRoot({ value, onValueChange, ...props }: ViewTabsRootProps) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={(next) => {
        // `Tabs.Root`'s value type is `any | null`; this bar's value is always a view id.
        if (typeof next === 'string') onValueChange(next)
      }}
      {...props}
    />
  )
}

export type ViewTabsListProps = Omit<React.ComponentProps<typeof Tabs.List>, 'activateOnFocus'>

export function ViewTabsList(props: ViewTabsListProps) {
  // A segmented control previews on arrow-key movement, unlike a tabbed
  // panel's manual activation — `activateOnFocus` makes ←/→ select, not
  // just move focus.
  return <Tabs.List activateOnFocus {...props} />
}

export const ViewTabsTab = Tabs.Tab
