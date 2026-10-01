---
id: 09
label: wayfinder:grilling
status: open
blocked-by: [04, 05]
---

# Document component library

## Question

Documents store content as a JSON block array with two block types: `text` (prose) and `component` (pre-defined template + AI-populated data). What is the component library?

Questions to resolve:

- What component types exist in v4? (e.g., task list, progress chart, timeline, metric card, table)
- What data does each component type expect from the app's data model?
- How does the AI decide which component to use — rule-based, model judgment, or user-directed?
- Are components read-only (AI-rendered) or can the user interact with them (e.g., check off a task inside a document)?
- How is a component block serialized in the JSON content array?
