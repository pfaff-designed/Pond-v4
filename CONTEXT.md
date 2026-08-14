# Pond

A personal AI thinking-partner app. The AI is steward/collector/presenter; the user handles creativity and judgment. Data is one self-referential tree ("everything is a page"); the UI is a registry of composable functional units ("everything the AI composes is a module").

## Language

### UI system

**Module**:
A registered, self-contained functional UI unit — a data *schema* paired with a *renderer*, keyed by a type string. It is the floor of AI composition: the AI arranges and configures *whole* modules, never their internal parts. Ranges from simple (`text`, `todo`, `metric`) to complex (chart, calendar, gantt, kanban). A module's internals (a kanban's cards/columns) are private data in its own schema — not separately registered.
_Avoid_: component (reserve for React building blocks / atoms), widget.

**Block**:
The everyday word for a module that lives in a page's content array. Simple blocks = `text`/`todo`/`metric`; complex blocks = chart/kanban/etc. "Block" and "content module" name the same thing — complexity is a spectrum, not a separate category.

**Page**:
A node in the self-referential data tree ("everything is a page") *and* a container **module**. It holds an ordered list of block-modules plus child pages, and carries its own `blocks` + `embedding` (a page IS its own document). One tree viewed twice: `pages` is the data structure; rendering it is module composition.
_Avoid_: document, node (informal only).

**Host**:
The fixed application frame that lays out and hosts modules — the app shell, sidebar, document panel, and AI terminal. Built from the same atoms and tokens as modules, but *not* a registry entry and never AI-composed.
_Avoid_: chrome (the informal collective noun for the hosts; not a registry concept).

**Slot**:
A named region within a host into which modules — or a page's module tree — are rendered.

**Composition**:
The act of arranging and configuring already-built modules onto a page. The AI's runtime surface. Low decision-load by design: no assembling a module from smaller parts.

**Authoring** _(deferred — fog)_:
Creating a brand-new module *type* (e.g. a filtered todo app, a heatmap) from building blocks with copyable logic. A future capability, not built now; modules are defined as copyable templates so this door stays open.

**Section** _(deferred — fog)_:
A hypothetical in-page container grouping blocks *below* the page level. Not built for now — grouping is done with child pages. Reserved term; would graduate only if the visual track needs real in-page columns/layout.
