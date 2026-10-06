/**
 * The composer ANSWER voice for the Markdown molecule (#97, `Pond 06.01` 6a /
 * PROJECT_RULES "Where answers live"): PP Neue Montreal sans at reading scale —
 * 15px (16 on mobile) / 1.6, weight 400, full ink. The serif is for the page only; an answer
 * in the thread is never set in it. Read inline from the mockup's answer `<p>`.
 *
 * Everything structural (tables, code, links) is inherited from the terminal
 * map the caller passes in — only the flow text changes voice, so an answer
 * reads as Pond talking, not as a page.
 */

import type { Components } from 'react-markdown'

export const ANSWER_PROSE_CLASS =
  'font-sans font-normal text-[16px] leading-[1.6] text-mn-text [text-wrap:pretty] md:text-[15px]'

export function answerComponents(base: Components): Components {
  return {
    ...base,
    h1: ({ children }) => (
      <h1 className="font-sans font-medium text-[18px] leading-[1.3] text-mn-text mt-3 mb-1.5 first:mt-0 md:text-[17px]">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="font-sans font-medium text-[17px] leading-[1.3] text-mn-text mt-3 mb-1.5 first:mt-0 md:text-[16px]">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="font-sans font-medium text-[16px] leading-[1.4] text-mn-text mt-2.5 mb-1 first:mt-0 md:text-[15px]">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className={`${ANSWER_PROSE_CLASS} my-2 first:mt-0 last:mb-0`}>{children}</p>
    ),
    ul: ({ children }) => (
      <ul className={`${ANSWER_PROSE_CLASS} my-2 list-disc pl-5 space-y-1`}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className={`${ANSWER_PROSE_CLASS} my-2 list-decimal pl-5 space-y-1`}>{children}</ol>
    ),
    blockquote: ({ children }) => (
      <blockquote className="font-sans text-[16px] leading-[1.6] md:text-[15px] text-mn-text-secondary border-l-2 border-mn-line pl-3 my-2">
        {children}
      </blockquote>
    ),
    strong: ({ children }) => <strong className="font-medium text-mn-text">{children}</strong>,
  }
}
