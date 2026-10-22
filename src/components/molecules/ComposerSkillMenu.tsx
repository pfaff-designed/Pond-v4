'use client'

/**
 * The composer's `/` menu when it is choosing a skill. One row today: `bug`.
 * The glass is the mono picker recipe, in the column above the line rather
 * than portaled, because the composer already sits at the bottom of the shell.
 */

import { splitMatch } from './slash-entries'
import { Row, type RowEntry } from './slash-row'

export const ComposerSkillMenu = ({ query, onPick }: { query: string; onPick: () => void }) => {
  const parts = splitMatch('bug', query)
  const entry: RowEntry = {
    kind: 'row',
    id: 'bug',
    label: 'bug',
    pre: parts.pre,
    hit: parts.hit,
    post: parts.post,
    hint: 'file an issue and start the agent',
  }

  return (
    <div
      role="listbox"
      aria-label="skills"
      data-part="glass"
      data-kind="skill"
      className="mn-glass box-border flex w-full flex-col gap-[1px] rounded-mn-card p-[8px] font-mono text-mn-text"
    >
      <Row entry={entry} selected onHover={() => undefined} onPick={onPick} />
    </div>
  )
}
