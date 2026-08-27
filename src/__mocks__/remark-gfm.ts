/**
 * Jest mock for `remark-gfm` (ticket-20) — a no-op remark plugin. Paired with the
 * `react-markdown` mock so the ESM remark chain never enters jest's transformer.
 * See ./react-markdown.tsx for the rationale.
 */
export default function remarkGfm() {}
