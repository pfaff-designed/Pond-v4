<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Plan before building: grill, then spec

For any non-trivial change (new behavior, new module, a refactor — anything beyond a mechanical edit), before writing code:

1. **Grill first.** Run the `/grill-me` skill (or, if it's unavailable, emulate it): state the plan step by step, hunt for holes — unverified assumptions, edge cases, seams with existing code (registry, chat route, persistence envelope) — and interrogate the user about every unresolved branch of the decision tree. Do not silently pick between interpretations that would produce different products. Keep going until there are no open questions.
2. **Spec if it's needed.** When the grilling reveals real scope — multiple components touched, behavior that had to be resolved through questioning, or work that will outlive the session — turn the resolved answers into a written spec before implementing (use the `/spec` skill if available, otherwise a short document the user signs off on). A grill that resolves quickly with no surprises can skip straight to building.

A clear, small, fully-specified request needs neither — act on it directly.
