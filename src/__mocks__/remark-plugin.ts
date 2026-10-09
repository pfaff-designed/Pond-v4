/**
 * Jest mock for the remark plugin (`remark-gfm`) — a no-op
 * plugin. Paired with the `react-markdown` mock so the ESM remark chain never
 * enters jest's transformer. See ./react-markdown.tsx for the rationale.
 */
export default function remarkPlugin() {}
