---
id: 01
label: wayfinder:grilling
status: closed
assignee: claude
blocks: [02, 04, 05]
---

# Platform: web/PWA vs. Tauri vs. React Native

## Question

Pond-v4 targets desktop and mobile, but Charles hasn't built a native app before. What platform strategy gives the best tradeoff between reaching both targets, building on existing React/TypeScript skills, and keeping the surface navigable for AI-assisted development?

Options to grill through:

- **Web app + responsive** — simplest, no install friction, browser-only, no native feel
- **PWA** — web tech, installable on desktop and mobile, partial offline, no app store
- **Tauri** — web frontend (React/TS), native desktop shell, fast/small; mobile support is newer
- **Expo (React Native)** — true native iOS/Android + desktop via React Native; different paradigm from Next.js

Key factors: AI agent navigability, complexity budget, solo developer, Charles's existing skills.

## Resolution

**Decision: Next.js web app, responsive, no PWA for v4.**

- Expo ruled out — overkill for use cases that are browser-capable (quick capture, read/reference, brief AI queries). Different paradigm with no payoff at this scale.
- Tauri ruled out — unfamiliar technology, Rust build overhead, no identified need for native shell features (filesystem access, system tray, etc.).
- PWA skipped for v4 — offline not required (always connected), "decent mobile site" is the acceptable baseline. Can be added later with a manifest + service worker if the home screen install becomes a real friction point.
- No special prep for the long-term "OS for a device" vision, except one architectural principle: keep domain logic (what a thought is, how a plan works, AI interaction logic) in framework-agnostic TypeScript modules — not coupled to Next.js server components or route handlers. This costs nothing and keeps the surface portable if a native shell is ever warranted.

Mobile usage pattern: desktop primary; mobile multiple times/week for quick capture, referencing plans/lists, brief AI queries. Always connected — offline is not a requirement.
