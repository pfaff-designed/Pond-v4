<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Plan before building

For any non-trivial change (new behavior, new module, a refactor — anything beyond a mechanical edit), before writing code:

1. Think through the plan step by step and state it explicitly.
2. Hunt for holes in that plan: unverified assumptions, edge cases the spec doesn't cover, seams with existing code (registry, chat route, persistence envelope) that could break.
3. Ask the user about every open question or materially ambiguous choice BEFORE building. Do not silently pick between interpretations that would produce different products.

Only start implementing once the plan has no unresolved questions. A clear, small, fully-specified request needs no ceremony — act on it directly.
