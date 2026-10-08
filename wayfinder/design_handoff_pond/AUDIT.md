# Pond — audit

Audited 26 sep 2026 against `CLAUDE.md` and `AUDIT BRIEF.md`. Nothing in the mockups was changed. Board ids are the post-split ids (4a…8a). On 6 oct 2026 the features took 07 and Edges, Sources and Examples moved to 08–10, so the audit's 7a–7h are now 8a–8h, its 8a is 9a and its 9a… are 10a… (the export's `_idmap-features-oct.json`). "p1" means a rule is contradicted or a builder would have to guess, "p2" means something is inconsistent or a state is missing, "p3" is craft.

Mechanical checks that came back clean: every hex value in the Pond files and child DCs is in the palette (plus white, black and error `#A63228`). The serif is only ever set at 200 or 800. No atomic-design words reach product copy; they appear only in 02 and in the "built from" column of 3a, which is where they belong.

## Decided, 26 sep (applied)

- **S1/S2:** Pond's updates, the briefing and capture filing arrive as proposed diffs. Fixed in 5p, 5af, 6b, 6c f4, 09 and CLAUDE.md.
- **S3:** the "propose edits instead of making them" toggle is removed from 5p.
- **W1:** the word is trash. Replaced "recently deleted" in 1e, 7a and 7b.
- **W3:** the view is called proposed. Replaced "to review" in 0a, 2t, 3a and 6p.
- **W10:** role names are the pond's own; admin, moderator, member and guest are only defaults. W10 is closed.
- **G3:** moderators can accept their own diffs.
- **S4:** effort is automatic by default. Pond or the agent picks it, and the person can set it themselves (5p: quick / auto / thorough). This is separate from deep research, which is the only thing that reads the web and is switched on per question.
- **V1–V5:** covered by a terms-of-service agreement for now. No disclosure lines in the mockups.
- Threads are private to their writer. Admins can't read them.
- **C1:** undo covers the session, until the tab or app closes. After that, revert from the change log. Updated in 0a, 3a, 6a, 6c and 7e.
- **C2:** an answer becomes a page through a proposal card first (make page / change place / cancel). Updated in 4d, 5t, 6d, 6e and 6r.
- **W4:** "keep as note" and "keep in thread" are removed.
- **C4:** areas are in the rail from the start. Fixed the 6d caption.
- **C3:** the rail header is the pond's name with a chevron for the switcher. Replaced "pond rva—25" everywhere.
- **W5:** kind is defined in 3a under page.
- **Threads:** a thread runs until the context fills. Pond warns before it does, and you compact or clear. Added to 3a.
- **C5:** mobile does everything. Filing runs on arrival on any device. Fixed the 6b caption and frames, and 9n.
- **6c diffs:** request changes opens a note under the card, sent to the proposer, who sends a revised diff. Accept and reject take the whole diff; partial acceptance goes through request changes. An outdated card greys out, drops accept and offers revise. C10: accept all only when there is more than one card; removed from the single card in 6c.
- **6d closing:** closing Pond with a proposed page open leaves the proposal pending in the thread and in the proposed view; nothing is made or discarded. 6d frame 4 caption now says "proposed page", and Pond's note says "I would make this a project" (S7).
- **6j:** a table made from a list creates a database from its rows, listed under databases. Noted in 6j frame 3.
- **6f:** a page made under a collection backed by a database is a record in it and gets its fields; under an ordinary page it is a plain page. Noted in 6f frame 1.
- **6i:** in a shared pond a new template is only its maker's until shared, then follows the pond's sharing, like a page. Noted in 6i frame 3.
- **6m ponds:** archive is read-only and hidden from the switcher, restored from settings › ponds. A deleted pond waits 30 days under deleted in settings › ponds, not in a pond's trash. Delete asks for the typed name. Anyone can leave a shared pond; only its last admin can delete it. Updated in 6m frame 7.
- **6n:** the invite is the only email Pond sends; its link opens sign-in with the address filled in and lands in the shared pond. Settings › people rows have change role and remove. A leaver's pages go to the admin who removed them, or the longest-standing admin if they left; any admin can hand them on. Noted in 6n.
- **6p:** a non-author's edits to a block collect into one diff, sent on leaving the block, pending until then. @mentions put the comment in that person's proposed view and send nothing. Only the author, moderators and admins can reshare. @pond in a comment reads only what everyone on it can open. Noted in 6p.
- **W12:** the role is renamed moderator; "editor" is zen's. Updated in CLAUDE.md, 00, 02, 03, 6n, 6p and PondRail.
- **C6:** one selection bar: text style, B, I, link, list, highlight, comment, ask pond, new page from this, copy. Added "new page from this" to 2t; 6e f1 redrawn with it, and the 6q bars updated.
- **Round two (26 sep):**
  - S8: read chips added under every answer in 5q, 6a, 6c and 6d.
  - S5: streaks are allowed. A streak counter is a block you can add; the habit template may show one. Removed "no streaks" from 1e.
  - R1: wheat used for emphasis in 4d, 5t, 6a and 6d is now an ink underline. R3: in the ember theme, secondary is sage and tertiary neutral 400.
  - W2: "module" is "block" in 5, 7e and 9. C13: the studio collective diff is gone from the life log in 6o, desktop and mobile.
  - C20: the assistant agent no longer files captures. S9: agents can have the web tool; 0a, 3a, 6r and 6t updated.
  - Editing a template: from settings › templates, or ⌘K › edit template.
  - A non-author editing database rows through a shared view makes a diff.
  - G2: if a diff's target is edited after the diff is made, the diff goes outdated.
  - W6: statuses are proposed, accepted, rejected, changes requested, outdated, withdrawn, undone and reverted (3a updated). Buttons are accept, reject and request changes; an accept may be named for what it does (make page).
  - Deep research keeps running if you leave the page or close the composer; the result arrives in its thread.
  - W7: handwriting, web and email are sources.
  - Ink logging is left to the build.
  - C21: / opens the menu for where you are: skills in the composer, blocks on a page.
  - Anyone in a pond can make agents. Only an admin or the database's creator can delete a database.
  - Sources in a shared pond show who connected them. Hovering a block shows who last edited it.
  - G1: offline, edits and captures queue on the device and sync on reconnect; asking needs a connection and the composer says so; a failed answer keeps what you typed.
  - G5: the only notifications are the invite email and reminders you set. Everything else lands in the proposed view.
  - Breadcrumb added to 02.
- **G4/V8:** admins can open every page in a shared pond except private ones: private means private, admins included, and when someone leaves their private pages are deleted. Amended 7 oct 2026 by 6w frame 6 and the design notes; it first read "admins can open every page… anything private belongs in the person's own pond".

## Decided, 8 oct

Answered by the product owner while planning the features (07.01–07.10).

- **Q11, handwriting:** handwriting is read by a stroke-based recognition API that receives only the pen strokes you select, never images (MyScript iink is the reference). The model provider and the transcription and search services in Q11 stay open.
- **Memory:** Pond writes a memory note only when you ask it to remember something. It never records a note on its own, and never from a thread. This supersedes 3a's "short notes Pond records on its own" and §1's "records automatically"; S10's automatically recorded note no longer arises.
- **7j tasks:** a project's tasks are a child database of the project page, with their own fields (status, start, due, repeats, waits on, reminder). The project page's own details (status, due) stay separate.
- **6w new pages:** a new page made at the pond root or under a private page starts private. One made under a shared or pond-wide page inherits its parent's level, so "wider only" holds. This reconciles 6w frames 1 and 2.
- **K1, ⌘1–⌘3:** bound only in a desktop app. In the browser they are not bound and no `⌘n` hint is drawn, because the browser keeps them for tab switching. The hints on `PondRail`'s switcher are desktop-app-only.

---

## 1. The ideas

**Propose, accept, then change.** Pages hold the person's thinking, so only two things can change a page. The first is the person's own edit, which applies as they type (grouped by pause for undo and the change log). The second is an accepted diff. Anything Pond, an agent or another person wants to change arrives as a _proposed diff_: a record in the pond's change log with before and after, answered with **accept**, **reject** or **request changes**. Until it is accepted the page shows its current state, and the proposer sees their version marked _pending_. Accepting a diff is one undo step. A diff whose target changed after it was made goes _outdated_; Pond can revise it, and accept is not offered. Revert is a new proposed diff and never rewrites history. The change log only grows.

**Answers are drafts.** A question is answered in the composer, never on the page. The answer sits in a thread, which is a record in the threads database. It reaches a page only through **make this a page** (a proposed new page: name, parent, kind, which you confirm) or through a proposed diff. Stopping keeps what has streamed; an error keeps nothing. Pond never switches modes, files, restructures or re-proposes on its own.

**Sources are shown.** Every answer names what it read (read chips under the answer). Every value that came from somewhere else carries a provenance chip. A page made from an answer keeps a made-from chip back to the thread; it can be hidden but not removed. Deep research is the only thing that reads the web, it is off by default, and it applies to one question at a time. Outside data arrives as read-only databases, and a broken source keeps its last copy.

**Everything is per pond.** A pond is a fully separate workspace with its own root page, databases, sources, memory, threads, change log, trash, theme, templates, agents, skills and tools. Nothing crosses between ponds except sharing, and even then nothing is copied. Memory is a database of short notes Pond writes when you ask it to remember something (decided 8 oct); each one cites its source, is logged, and can be edited or deleted.

**Roles decide who accepts.** In a shared pond the pond owns the pages and each page has an _author_. A new page belongs only to its author ("only you") until it is shared. Access is per page, at view, comment or edit, and it includes nested pages. The author's own edits apply directly. Everyone else's edits become proposed diffs for the author, editors and admins. Each person sees only what is shared with them, and that includes admins. Threads are private and never feed the shared memory.

**No nudges.** No streaks, badges, pings, emails or pushes for comments or proposals. The only count is the change log's "to review" figure. Pond speaks when asked, or when something is due (a reminder on a date field). One burnt-orange mark per screen, and only on a date.

---

## 2. Flows

Each flow is written as a builder needs it, with its gaps underneath. "Result" means data written. "Who" is about shared ponds; personal ponds have one person, who is author of everything.

### 4a–4d Onboarding (`Pond 04 Onboarding`)

- **Entry:** first open of the app. Where the cover (5a, 6d frame 1) sits relative to sign-in is not stated.
- **Steps:**
  1. Sign in by email magic link. An account is required.
  2. Name the pond (default Life).
  3. Pick areas (five preset, plus ＋ another).
  4. Connect sources (calendar, Apple Health, bank feed, Google Sheets).
  5. Three keys: ⌘K, /, ⌘Z. On mobile these are three controls: ＋, search, undo.
  6. The shell opens, then the first run (6d).
- **Exits:** skip, top right on every step, applies the shown default. Onboarding never returns.
- **Result:** a pond record, a root page, one page per area, and a database per connected source.
- **Gaps:**
  - ~~The magic-link states are missing.~~ Dropped 26 sep: standard sign-in behaviour, no mockup needed.
  - ~~"Without an account" has no later step.~~ Decided 26 sep: removed; an account is required.
  - The step counter reads "1 / 5" on the second screen. Sign-in plus four steps makes five screens but only four are numbered (p2).
  - The area caption "All five start ticked except the one you untick" contradicts itself (p3).
  - The area question says "parts of life" even when the pond is not called Life (p3).
  - Source connect has no OAuth, failure or permission-denied state (p2).
  - Closing the app mid-onboarding: resume, or defaults? (p2)
  - No mobile first run (4c/4d exist only for desktop and dark) (p2).

### 6a Ask → answer → page (`06.01`)

- **Entry:** the composer on any page (⌘J, or click). The page you are on is sent as context. @ adds pages.
- **Steps:**
  1. Type. ↵ sends, ⇧↵ adds a line.
  2. The answer streams upward into a thread (question in mono, answer in sans). Esc or stop halts the stream and keeps what arrived.
  3. The answer sits in the thread. Actions: make this a page, ask again, keep as note.
  4. Make this a page shows a _new page — proposed_ card with name, parent and kind (each editable) and make page / change place / cancel.
  5. The page is made. The prose moves across word for word, Pond adds a "mentioned" list, and a made-from chip links back to the thread.
- **Exits:** closing the composer or leaving the page keeps the answer in "today's thread". Cancel on the proposal returns to the thread.
- **Result:** a thread record updated. On make page: a new page record, a change-log record, and a rail entry.
- **Gaps:**
  - No read chips under the answer in frames 2–3, although 2f says they are always there (~~p1~~ closed 26 sep, see round two;).
  - "Keep as note" is undefined: what is a note and where does it go? (~~p1~~ closed 26 sep: W4;)
  - "Today's thread" implies one thread per day, but 2f has explicit threads with "new thread". The rule for when a new thread starts is missing (~~p1~~ closed 26 sep: threads run until the context fills;).
  - "Ask again replaces the answer in place. The earlier one stays in the thread" contradicts itself (p2).
  - Esc: frame 1 says "esc clears", 2f says esc steps back through stop, blur, close (p2).
  - Undo is "available until the next edit on this page", which contradicts one unlimited history (7e) (~~p1~~ closed 26 sep: C1;).
  - "Kind" is proposed but never defined (see W5).
  - Missing states: empty send, double send, the parent was deleted between proposal and make page, a very long proposed name.

### 6b Capture → filing (`06.02`)

- **Entry:** the mobile capture screen (text, photo, voice).
- **Steps:**
  1. Capture. There is no destination picker ("pond decides").
  2. Items wait under today. They can be read and deleted but not edited. Offline captures queue.
  3. The next desktop session opens with a "from your phone" report. Confident items are filed with undo on the row; unsure items get up to three chips.
  4. The unsure item arrives as a proposed diff.
  5. It lands in the page's notes with a phone chip. Pond points out side effects and does not act on them.
- **Result:** capture records, then blocks or records on target pages, with change-log records.
- **Gaps:**
  - Frame 3 files two items **without a diff**, then frame 4 says "anything that writes to a page goes through the diff card, filing included" (~~p1~~ closed 26 sep: S2;, S2).
  - Filing waits for a desktop, so a phone-only user never gets filing. This contradicts "mobile does what desktop does" (~~p1~~ closed 26 sep: C5;).
  - The receipt is proposed into _budget_, whose transactions come from a read-only bank feed (p2).
  - Voice transcription and receipt reading have no disclosure of any outside service (~~p1~~ closed 26 sep: V1–V5, terms of service;, privacy).
  - In a shared pond, where do captures go, and can they be filed onto someone else's page? (p2)
  - No state for a capture that fails to upload, or one deleted after it was filed (p2).
  - Undo on a filed row: what does it undo if the page was edited since? (p2)

### 6c Propose → accept (`06.03`)

- **Entry:** an instruction typed in the composer. If the intent is unclear, Pond answers and offers the edit as a chip.
- **Steps:**
  1. Proposed diff card in the thread: one assumption sentence, − and + lines, accept / reject / request changes, plus accept all / show original.
  2. Request changes produces a revised diff (accept revised / revert). The first diff stays in the log as changes requested.
  3. Accept applies the diff; changed rows carry a mark until the page is next opened.
  4. Reject leaves one line, "rejected — nothing changed", with ask again and show proposal.
- **Result:** diff records with their statuses, and the page's blocks.
- **Gaps:**
  - Where you type the change request is not drawn. Nor is how a line "edited by you" is edited inside a diff (~~p1~~ closed 26 sep: 6c;).
  - "Revert" on the revised card is undefined. Does it revert to the first proposal? (p2)
  - "Accept all appears when there is more than one [card]", but the single card draws both accept and accept all. Per-line accept is not decided (~~p1~~ closed 26 sep: 6c;).
  - "Show original" is undefined (p2).
  - After accept, Pond writes "pond — update: Moved…" onto the page. Is that part of the diff? (~~p1~~ closed 26 sep: S1;, S1)
  - Undo is again "until the next edit to this page" (~~p1~~ closed 26 sep: C1;, C1).
  - Missing states: the page changed while the card was open (outdated in the composer), the thread closed with a card pending (does it persist, and where?), two cards on one page.

### 6d First run (`06.04`)

- **Entry:** the cover (enter, or typing first), then the empty shell with three suggestion cards.
- **Steps:**
  1. Ask.
  2. The answer streams.
  3. A draft page appears in the rail and canvas: "new page — not saved yet", with keep page / move it / start over.
  4. Keep saves it.
- **Result:** a page record on keep.
- **Gaps:**
  - Pond makes the draft page and picks its area without a _make this a page_ proposal, which contradicts 6a frame 4 ("never files silently… you confirm") (~~p1~~ closed 26 sep: C2, S7;, C2).
  - Frame 5 says "an area appears in the rail once it holds a kept page", but 4a/4c put every picked area in the rail from the start (~~p1~~ closed 26 sep: C4;, C4).
  - Leaving or closing with a draft page open: is it kept, discarded, or held in the thread? (~~p1~~ closed 26 sep: 6d;)
  - "Import from notes" is undefined (p2).
  - Start over: what gets discarded? (p2)

### 6e Reference → new page (`06.05`)

- **Entry:** select text on a page. A toolbar offers ask about this / new page from this / quote in….
- **Steps:**
  1. The passage becomes a reference chip in the composer, and the typed text is the brief.
  2. @ adds a page, which joins the references.
  3. Pond drafts a page under the @-mentioned page. The quote is linked, not copied.
  4. Keep. The source passage then lists backlinks.
- **Result:** a new page, a reference record (page plus range), and backlinks.
- **Gaps:**
  - This toolbar differs from the selection bar in 2t and 6q (~~p1~~ closed 26 sep: C6;, C6).
  - What does the quote show after the highlight is edited away or deleted? (p2)
  - Guidance for placement when no page is @-mentioned (p2).
  - What happens to a reference to a page you lose access to? (p2)
  - Frame 5 backlinks name "renovation notes", a page that exists nowhere else (p3).

### 6f Blank page → recipe via template (`06.06`)

- **Entry:** ＋ on a rail row makes an empty child page. / on the empty page opens the menu led by templates.
- **Steps:**
  1. → previews a template as outlines.
  2. ↵ applies it. The cursor goes to the title.
- **Result:** plain blocks with no tie to the template. ⌘Z empties the page.
- **Gaps:**
  - A page created under _recipes_ (a collection whose gallery reads the recipes database): is it a record of that database or a plain page? 3e says records are pages whose fields are placed as blocks, but the template adds blocks, not fields (~~p1~~ closed 26 sep: 6f;).
  - / on a non-empty page with templates: what happens? The menu hides templates, so say so (p2).
  - The rail shows "chickpeas, harissa, yoghurt" while the page title is "chickpeas, harissa" (p3).

### 6g Add a block mid-page (`06.07`)

- **Entry:** / on a new line. The menu flips away from the composer.
- **Steps:**
  1. Type to narrow (aliases).
  2. Choosing chart inserts it already wired to the nearest table, shown as a changeable source chip.
- **Result:** a view block. A user edit, applied directly.
- **Gaps:**
  - 2e says chart always opens the source picker (step 2: chart types), but here it skips the picker. Decide when the picker is skipped (p2, C9).
  - With no table on the page, does it fall back to the picker? (p2)

### 6h Pond proposes a template (`06.08`)

- **Entry:** the user asks ("make this match the other recipes"). Pond never offers this unprompted.
- **Steps:**
  1. A block-level diff (+/− blocks), where removed text must reappear in the same diff.
  2. Accept.
- **Result:** the blocks are replaced. The meta line now reads "recipe".
- **Gaps:**
  - The meta line showing the template's name contradicts "no tie back" (~~p1~~ closed 26 sep: W5, kind is a label;, W5).
  - Frame 3 drops the notes block and the cooked log that the diff promised (p3).
  - What if the page gains new text while the diff is pending (outdated)? (p2)

### 6i Customise, save as a template (`06.09`)

- **Entry:** ⌘K › save page as template.
- **Steps:**
  1. Name the template and choose what it keeps (structure and labels / placeholder text / this page's content).
  2. Save.
- **Result:** a template record, offered first on the next empty sibling page.
- **Gaps:**
  - Name collision with an existing template (p2).
  - Template scope in a shared pond: visible to everyone, or only to its maker? (~~p1~~ closed 26 sep: 6i;)
  - Frame 2 loses the "wine" heading added in frame 1, and frame 4's rail loses sourdough (p3).
  - "Managed in settings", but 5p has no templates section (p2).

### 6j Turn a list into a table (`06.10`)

- **Entry:** block handle › turn into › table (the row previews "4 rows · 3 columns"), or ⌘/.
- **Steps:** columns are inferred and typed, and non-matching lines keep their text in the last column.
- **Result:** a direct user edit, with an undo line.
- **Gaps:**
  - Does a table made from a list create a database under databases? 2i says a table is "a view of a database", and 7c says "if the table made a database…". Decide (~~p1~~ closed 26 sep: 6j;).
  - The handle menu lacks delete, duplicate, comment and copy. The same menu is drawn differently in 6j, 6k and 7c, and none of them is in 02 (p2).

### 6k Nest a page from a block (`06.11`)

- **Entry:** handle on a heading (which carries the section) › move into a new page. Also / page on an empty line.
- **Result:** a new child page with the section's blocks, and a page-link block in their place.
- **Gaps:**
  - The change log and undo for a move are not shown (p2).
  - In frame 2 the costs table has lost its "cabinets 4,000" row (p3).
  - When a non-author does this in a shared pond, it has to be a diff. Not stated (p2).

### 6l Edit a template (`06.12`)

- **Entry:** unstated. The breadcrumb reads settings › templates › weeknight recipe (~~p1~~ closed 26 sep, see round two;).
- **Steps:** edit, then a save sheet listing what you changed and which pages were made from it ("they stay as they are").
- **Gaps:**
  - Listing "2 pages were made from it" needs a stored tie, which contradicts "a page keeps no tie". Say it is provenance only (p2).
  - The two pages named were made from _recipe_, not _weeknight recipe_ (p3).
  - Delete-template flow (p2).

### 6m Create a pond (`06.13`)

- **Entry:** the rail header switcher, ⌘K (ponds listed above pages), or ⌘1–⌘3.
- **Steps:**
  1. Name, glyph, theme.
  2. Areas.
  3. Sources. All steps can be skipped (default "untitled pond").
  4. The shell opens on the new root.
- **Manage:** settings › ponds covers reorder, rename, glyph, theme, export, archive, delete (30 days).
- **Gaps:**
  - The rail header in every other screen reads "pond rva—25", not the pond name (~~p1~~ closed 26 sep: C3;, C3).
  - Archive is undefined (read-only? hidden? restorable?) (~~p1~~ closed 26 sep: 6m;).
  - A deleted pond "waits 30 days in the trash", but trash is per pond. Where does a deleted pond's trash live, and where do you restore it? (~~p1~~ closed 26 sep: 6m;)
  - Delete has no typed confirmation, although 1f requires one (p2).
  - Leaving or deleting a _shared_ pond, and who may do it (~~p1~~ closed 26 sep: 6m;).
  - Export formats differ: "as files" here, markdown/json in 5p (p3).
  - ⌘1–⌘3 collide with browser tab switching (~~p2~~ closed 8 oct: desktop app only, K1).
  - Where the suggested areas (clients, projects…) come from (p2).

### 6n Share and invite (`06.14`)

- **Entry:**
  - The switcher lists your own ponds, then shared ponds, then "shared with me" pages.
  - Share dialog: people at view, comment or edit; a link that expires.
  - Settings › people: admin invites and sets roles.
- **Steps:**
  1. Share. The page's nested pages and the databases its views show come along.
  2. A non-author's edit becomes a pending diff for the author, editors and admins.
  3. Link visitors request access and the author approves.
  4. Linking a shared page from your own pond shows its pond and "no access" when access ends.
  5. The shared pond's memory is shown per source visibility.
- **Result:** share records, member records, diffs, memory notes.
- **Who:** admin = people and roles plus editor rights. Editor = accepts on any page shared at edit. Member = makes and shares pages, and reviews on their own. Guest = one page, from outside.
- **Gaps:**
  - The invite-acceptance flow is not drawn (the email, sign-up, what Mia sees). It also contradicts 6p's "no emails" (~~p1~~ closed 26 sep: 6n;).
  - Remove member, change role, leave pond: not drawn (~~p1~~ closed 26 sep: 6n;).
  - Which admin inherits pages when someone leaves (~~p1~~ closed 26 sep: 6n;).
  - Admins "see only what's shared with them", so how do they delete, export or audit the pond? (~~p1~~ closed 26 sep: G4;)
  - A guest sees "that page only" (6n5) and also "its nested pages" (6n4, 0a) (p2).
  - Sam is _member_ in 6n4 and _editor_ in 6n5 (p2).
  - Can someone with view or comment access reshare? Can a member share a page they don't author? (~~p1~~ closed 26 sep: 6p;)
  - What level does link approval grant, and can editors or admins approve? (p2)
  - Database rows edited through a shared view by a non-author: diff or direct? (~~p1~~ closed 26 sep, see round two;)
  - Can a proposer accept their own diff? (~~p1~~ closed 26 sep: G3;, see G3)
  - While a pending diff exists, do further edits amend it or make a new one? (~~p1~~ closed 26 sep, see round two;)
  - Where does "asks to view" surface for the author if there are no notifications? (p2)
  - Mobile frame 12 shows only status bars (p3).

### 6o Change log (`06.15`)

- **Entry:** databases › change log, a changed mark on a row, ⌥⌘H or page menu › changes (per page), undo.
- **Steps:**
  - The log is led by "N proposed, waiting on you". Views: all / proposed / by page / memory / deleted / ＋ view.
  - A record page shows status, proposer, where it applies, thread, read, before/after, and linked records.
  - Revert creates a proposed diff.
  - Undo and redo are records.
  - Deletions are shown with restore until the trash empties.
  - Memory notes are logged, and deleting a note removes its content from the log.
- **Gaps:**
  - The life pond's log lists _launch plan_ from studio collective, which breaks per-pond separation (~~p1~~ closed 26 sep, see round two;).
  - "Proposed" / "waiting on you" here, but "to review" in 0a, 3a, 2t and 6p (~~p1~~ closed 26 sep, see round two;, W3).
  - Statuses used here (recorded, edited, deleted, revised, reverted) are not in 3a's list (~~p1~~ closed 26 sep, see round two;, W6).
  - Is an outdated diff counted as waiting? (p2)
  - Revert of your own change is a proposed diff you then accept yourself, while ordinary own edits apply directly. Say why (p2).
  - "Page menu" is never drawn (p2).
  - The "restorable until 26 oct" date does not match a 30-day window (p3).
  - Does logging "opened in zen" (6q) belong here, given every record is a diff with before and after? (p2)
  - No empty state, no paging for a large log, and no rule for hiding records on pages you can't see (p2).

### 6p Working together (`06.16`)

- **Entry:** select a block › comment. The margin card lets you reply, @pond (answer as draft: keep/discard) and resolve.
- **Steps:**
  - Presence is a name in the breadcrumb.
  - A second person's typing becomes a proposed diff.
  - Two diffs on one block are shown side by side: pick one, merge (Pond drafts a merged diff), or reject both.
  - Review happens in change log › to review.
  - The outdated sender can revise or withdraw.
  - Access removed mid-session shows a notice; open diffs are withdrawn and comments stay.
  - Comments are a database; the only count is the change log's.
- **Gaps:**
  - When does typing become a diff: per keystroke pause, on blur, or on an explicit send? (~~p1~~ closed 26 sep: 6p;)
  - "Sam proposing…" is a typing indicator, which contradicts "no typing indicator" (p2).
  - The unpicked diff is marked _outdated_; _rejected_ seems right (p2).
  - Jo is a _view_ guest (6n) yet sends a diff (p2).
  - Lee is member in 6n and editor here (p2).
  - Sam (you, editor) is listed as able to review his own diff (~~p1~~ closed 26 sep: G3;).
  - Who can keep Pond's comment draft, and who can resolve? (p2)
  - Pond's comment draft may read pages other commenters can't see, which leaks private content (~~p1~~ closed 26 sep: 6p, V6;, privacy).
  - @-mentioning a person in a comment notifies no one ("Sam, can you check…"), so the flow depends on a notification that doesn't exist (~~p1~~ closed 26 sep: 6p;).
  - Removing someone _from the pond_ (not from a page) is not drawn (~~p1~~ closed 26 sep: 6n;).

### 6q Writing and zen (`06.17`)

- **Entry:** ⌘K › zen, ⌘., asking Pond (offered as a button), or a setting that opens new journal entries in zen.
- **Steps:**
  - Only the page text and the pill remain: ask pond / editor / attach / Aa / esc.
  - Editor (off by default) marks grammar, spelling and clarity suggestions as small diffs.
  - Attach from device, a source or a page makes a file block.
  - The selection bar offers format, highlight, comment, ask pond.
  - Ask opens the composer over the pill.
  - Aa sets face, size, measure and ground for zen only, per pond.
  - Esc returns.
- **Result:** own edits apply directly, grouped by pause. Suggestions are diffs. Threads.
- **Gaps:**
  - "Two ways in… nowhere else", but frame 1 itself shows ⌘. and the auto-open setting (p2, C7).
  - The zen "editor" shares its name with the _editor_ role (~~p1~~ closed 26 sep: W12, moderator;, W12).
  - Aa lets page headings be set in mono, which contradicts mono being the machine surface (p2).
  - Google Drive and Dropbox appear as sources here and nowhere else (p2).
  - "Keep in thread" is a new action, and every answer is already kept in its thread (p2).
  - Editor suggestions on a page you don't author in a shared pond: whose diff, and who is it for? (p2)
  - Upload failure, file size and type limits (p2).
  - Mobile pill contents differ from desktop without saying why (p3).

### 6r Deep research (`06.18`)

- **Entry:** the deep research toggle on the composer, or ⌘K › deep research. It lasts one question.
- **Steps:**
  1. The plan and standards appear. Change them, start, or ask as a normal question instead.
  2. Reading and cross-checking: kept and dropped sources, with reasons. Stop keeps what was found.
  3. The answer: every claim cited, one-source claims marked, "not settled" named.
  4. How it checked.
  5. A source card (the passage in wheat; "not a good source" triggers a redraft).
  6. Make this a page: keep / move / discard.
  7. The toggle turns off again.
- **Result:** a thread with sources; on keep, a page with a sources block. Web content never enters memory.
- **Gaps:**
  - What is sent to the web search provider (queries built from pond content?) is not disclosed where it happens (~~p1~~ closed 26 sep: terms of service;, privacy).
  - Leaving the page, closing the composer or going offline mid-run: does it continue in the background? (~~p1~~ closed 26 sep, see round two;)
  - 5p's "answer style: quick / auto / deep" contradicts "one mode you switch on" (~~p1~~ closed 26 sep: S4;, S4).
  - Wheat on a source passage is not a highlight (p2, R2).
  - The composer button is labelled "＋ research" elsewhere and "deep research" here (p3).
  - No failure states: no sources found, a source unreachable, the time estimate overrun (p2).
  - "threads ›" appears as a breadcrumb root, but threads is a database under databases (p2).

### 6s Freeform page (`06.19`)

- **Entry:** ＋ new page › freeform page. The new-page menu (page / freeform / from a template) is drawn only here.
- **Steps:**
  1. Draw (pen pill: ask, pen, highlighter, eraser, lasso, image).
  2. Place images under the ink.
  3. Lasso and ask.
  4. Pond shows what it read as a diff into a chosen page, with unsure words marked for you to fix.
  5. Tasks land with backlinks, and the ink is unchanged.
  6. Read ink is searchable.
  7. The handwriting setting says what is sent.
- **Gaps:**
  - The vendor is left as "[third-party service]" (~~p1~~ closed 26 sep: terms of service;, open question).
  - Handwriting is a _source_ here and in 3a but a _tool_ in 6t (~~p1~~ closed 26 sep, see round two;, W7).
  - How ink edits are logged and undone (a stroke? a pause?), and how a non-author's ink becomes a diff in a shared pond (~~p1~~ closed 26 sep, see round two;).
  - The diff says "3 tasks" but shows one; the mobile frame says 2 (p3).
  - kitchen renovation gains a "tasks" list that isn't in its other frames (p3).
  - Why ＋ new page shows a menu here but in 6f makes a page directly (p2).

### 6t Agents and skills (`06.20`)

- **Entry:**
  - Agents database page.
  - Asking Pond to make an agent (draft: name, role, reads, tools → accept / ask for changes / discard).
  - Skills drafted on request (name, trigger, steps, tools, output).
  - Running a skill: @agent or / in the composer, / or ⌘K, a schedule, or an event.
- **Result:** agent and skill records. Every output is a proposed diff under the agent's name. Tools are switched on per pond and per agent.
- **Gaps:**
  - The health coach's tools include **web**, but web is "deep research only" (6t8, 0a) (~~p1~~ closed 26 sep, see round two;, S9).
  - The assistant "files captures", but filing is Pond's built-in job ("built-in jobs stay pond") (~~p1~~ closed 26 sep, see round two;, C20).
  - "/ skill" in the composer collides with / for blocks (2f) (~~p1~~ closed 26 sep, see round two;, C21).
  - @ is used for both pages and agents, so a page named like an agent is ambiguous (p2).
  - The draft agent uses "discard", not reject (p2, W6).
  - Shared ponds: who can make agents, which pages an agent may read (the maker's access?), who accepts agent diffs (~~p1~~ closed 26 sep, see round two;).
  - Scheduled runs whose earlier proposal is still pending: stack, replace, or skip? (p2)
  - Failure states: tool off, source broken, skill error (p2).
  - The change-log record says "from skill plan the week" for adding a run, which is the other skill's job (p3).
  - The assistant's skills list includes the financial advisor's skill (p3).
  - "Keep dates" and "draft a reply" (to what, where?) are vague (p2).

### 7a–7d Edges (now 8a–8d, `Pond 08 Edges`)

- **7a Delete a database:** starts on the database. A confirm lists every view. Views become tombstones (restore database / remove view) and are restorable for 30 days from "databases › recently deleted".
  - Gap: who may delete a database in a shared pond (~~p1~~ closed 26 sep, see round two;).
  - Gap: "recently deleted" versus trash (~~p1~~ closed 26 sep: W1;, W1).
- **7b Deleted record:** the chip breaks in place, the borrowed value is kept for 30 days, and a restore that changes the value is a diff (accept 760 / keep 710).
  - Gap: the button labels don't follow accept / reject / request changes (p2).
- **7c Undo a conversion:** ⌘Z is exact "within the session and before other edits". A back-conversion that loses data is a diff (apply / keep table).
  - Gap: contradicts undo "as far as you like" (~~p1~~ closed 26 sep: C1;, C1).
- **7d Reminders:** set on a date field for every record. One floating note (open / snooze / done). The bell opens "coming up". On mobile it is a system notification.
  - Gap: the bell is not drawn in 2r (p2).
  - Gap: "done" writes what to the record? (p2)
  - Gap: whose reminders appear in a shared pond? (p2)
  - Gap: per-record reminders are impossible by design; confirm that is intended (open question).

### 8a Connect a source (now 9a, `Pond 09 Sources`)

- **Entry:** databases root › connect a source, or ⌘K.
- **Steps:**
  1. Pick a type.
  2. Sign in and pick a sheet and tabs.
  3. Preview the fields.
  4. Connect: a read-only database with sync time and sync now.
  5. Use it in views.
  6. On break: last copy, reconnect / disconnect.
- **Gaps:**
  - Sign-in failure and permission denied (p2).
  - Wrong header row or field types can't be corrected before connect (p2).
  - Rows removed at the source: the relation and kept-value behaviour of 7b? (p2)
  - Replacing a CSV breaks relations? (p2)
  - Shared ponds: whose credentials, who can connect, do all members see the data? (~~p1~~ closed 26 sep, see round two;)
  - Disconnect has no confirmation (p2).
  - No mobile frames (p2).
  - Email appears as a source in 6s8 and 6t8 but not here (p2).

---

## 3. Findings

### Rules against screens — stance (S)

| id                    | file · board                                                       | what's wrong                                                                                                                                                                                                                                        | fix                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 ~~p1~~ closed (S1) | 04 4d, 05 5af 5l 5q 5r, 06.01 6a, 06.02 6b, 06.03 6c, 06.04 6d, 09 | `pond — update`, briefing and "from your phone" blocks appear on pages with no diff. The briefing is "written at 07:00, on the life page" (5p). 5af's description is "written from the name". 09 says "I have added a note to the renovation spec". | Define one rule in 3a, either (a) update blocks are proposed diffs like everything else, or (b) a reserved block type Pond may write without a diff, logged and undoable, never editing other blocks. Apply it to every screen. |
| S2 ~~p1~~ closed (S2) | 06.02 6b f3                                                        | Pond files two captures without a diff, then f4 says filing always goes through a diff.                                                                                                                                                             | Make confident filings one batched diff ("accept all"), or accept (b) above explicitly for captures.                                                                                                                            |
| S3 ~~p1~~ closed (S3) | 05 5p                                                              | The setting "propose edits instead of making them" implies Pond can edit directly when it is off.                                                                                                                                                   | Remove the toggle.                                                                                                                                                                                                              |
| S4 ~~p1~~ closed (S4) | 05 5p, 06.18 6r                                                    | "Answer style: quick / auto / deep": auto would switch deep research on by itself.                                                                                                                                                                  | Replace with nothing. Deep research is per question.                                                                                                                                                                            |
| S5 ~~p1~~ closed      | 05 5ah (habit), 09 (workouts "streak 6d")                          | Streaks, which 1e forbids.                                                                                                                                                                                                                          | Habit shows the twelve weeks of days and today's tick, with no streak count.                                                                                                                                                    |
| S6 p2                 | 02 2g, 05 5af                                                      | The palette's "two actions Pond expects", and an unrequested suggestion about past standups on an empty page, read as nudges.                                                                                                                       | Keep only recent pages in the opened palette. On an empty page show only the one line of help.                                                                                                                                  |
| S7 ~~p1~~ closed (S7) | 01 1e, 04 4d, 06.04 6d                                             | "I have made this a project under creativity" is Pond making a choice. 1e uses it as the _yes_ example, and the same board says "offer, then wait".                                                                                                 | Draft the page as a proposal with the parent offered (as in 6a f4). Change the 1e example.                                                                                                                                      |
| S8 ~~p1~~ closed      | 05 5q, 06.01 6a f2–3, 06.03 6c, 06.04 6d                           | Answers without read chips. 2f says every answer shows what it read.                                                                                                                                                                                | Add read chips to every answer frame.                                                                                                                                                                                           |
| S9 ~~p1~~ closed      | 06.20 6t f3                                                        | An agent with the web tool, while web is deep research only.                                                                                                                                                                                        | Remove web from the agent, or define agent web access as deep research with its plan step.                                                                                                                                      |
| S10 p2                | 06.15 6o f1                                                        | A memory note recorded automatically shows status _accepted_.                                                                                                                                                                                       | Use a _recorded_ status and add it to 3a's list (see W6).                                                                                                                                                                       |

### Rules against screens — colour, type, icons (R)

| id               | file · board                                                                                                 | what's wrong                                                                                                                                                                    | fix                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| R1 ~~p1~~ closed | 04 4d, 06.04 6d (on "creativity"), 06.01 6a f5 (on "the carcasses are measured"), 05 5t (on "January float") | Wheat used for emphasis or a link, not a highlight.                                                                                                                             | Use an ink underline or a page-link chip. Keep wheat for kept highlights.                                        |
| R2 p2            | 06.18 6r f6, 03 3e                                                                                           | Wheat on a quoted source passage, and as a "changed for a moment" flash.                                                                                                        | Decide whether a source passage counts as a highlight. The 3e flash should use the changed mark (6c), not wheat. |
| R3 ~~p1~~ closed | 01 1g (ember)                                                                                                | Red is secondary (links, area colour) _and_ removal. Wheat is tertiary _and_ dated. That breaks "each job keeps exactly one colour".                                            | Reassign ember's secondary and tertiary to values no signal uses.                                                |
| R4 p2            | 01 1g vs 1a, CLAUDE.md                                                                                       | Themes have two area slots (secondary, tertiary); area colours are three (sage, mist, navy). Links are sage in 1g but navy in the design system.                                | Give themes three area slots and one link role, or state which area colours each theme drops.                    |
| R5 p2            | 01 1g vs 02 2a                                                                                               | Focus is ink (1g "primary: buttons, selection, focus") vs "always the 2px mist ring" (2a).                                                                                      | Pick one.                                                                                                        |
| R6 p2            | CLAUDE.md vs 01 1a                                                                                           | CLAUDE says "full, 68%, 80% for small meta"; 1a says 80% is body and 68% is meta.                                                                                               | Fix CLAUDE.md to match 1a.                                                                                       |
| R7 p3            | 00, 02, 03, 05, 06.08, 06.09, 06.12, 06.14, 06.19, 09                                                        | Text alphas .3, .4, .42, .45 and .88 in product frames (outside annotation chrome, which uses .58/.62).                                                                         | Move them to 68%, 80% or full.                                                                                   |
| R8 p3            | 04, 05, 09, PondChart, PondRail                                                                              | `rgb(72,73,64)` and `rgb(74,73,64)` both appear; the palette neutral is `#4A4940` (74,73,64). The shadow tint `rgb(40,34,24)` isn't a palette value.                            | Use `#4A4940`. Derive shadows from ink `27,29,20`, as the design system's shadows do.                            |
| R9 p2            | 05 5l vs 02 2a, 01 1b                                                                                        | 5l has six heading levels at 26, 20 and 21 (off the ladder). h4 is serif italic with no weight given. h6 is uppercase mono, but mono is lowercase. 2a has three heading levels. | Decide the level count. Put sizes on the ladder. Set h4 at 200 italic. Make h6 lowercase.                        |
| R10 p3           | 01 1b vs 02 2f                                                                                               | Answers are "15/1.6", but the ladder has no 15.                                                                                                                                 | Add the answer size to 1b.                                                                                       |
| R11 p3           | 02 2a                                                                                                        | Tag is mono, but tags are data, not machine surface.                                                                                                                            | Sans, or justify.                                                                                                |
| R12 p3           | 01 1c                                                                                                        | Grain "4.5% multiply" vs the design system's 3.6% screen.                                                                                                                       | Pick one value.                                                                                                  |

### Words (W)

| id                              | where                                                                                                               | what's wrong                                                                                                                                                                                                                                                                                                                                                              | fix                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 ~~p1~~ closed (W1)           | 3a/0a/6m/6o "trash" vs 1e (yes-example), 7a, 7b "recently deleted"                                                  | Two names for one place.                                                                                                                                                                                                                                                                                                                                                  | Pick one and apply it everywhere, including the 1e example.                                                                                               |
| W2 ~~p1~~ closed                | 05 5af "Add a module", 07 7e "a module or page", 09 "add a module", "a table is just another module"                | "Module" isn't a Pond word; it means block.                                                                                                                                                                                                                                                                                                                               | Replace with block. (Its use in 01 and 05's design prose is fine.)                                                                                        |
| W3 ~~p1~~ closed (W3, proposed) | 06.15 6o "proposed", "waiting on you" vs 0a, 2t, 3a, 6p "to review"                                                 | One view, two names.                                                                                                                                                                                                                                                                                                                                                      | Use "to review" everywhere.                                                                                                                               |
| W4 ~~p1~~ closed (W4)           | 05 5t, 06.01 6a "keep as note"; 06.17 6q "keep in thread"                                                           | Undefined actions. Threads already keep every answer.                                                                                                                                                                                                                                                                                                                     | Remove them, or define "note" in 3a with where it lives.                                                                                                  |
| W5 ~~p1~~ closed (W5)           | meta lines everywhere: "project", "collection", "recipe", "nested page", "book", "page — empty"; 6a proposes "kind" | Page kind is used everywhere and defined nowhere. Showing the template name contradicts "no tie back".                                                                                                                                                                                                                                                                    | Define _kind_ in 3a (a label set when made, editable, not a template link) or drop it.                                                                    |
| W6 ~~p1~~ closed                | 3a statuses vs 6o/6p/6t/7b/7c/6a/6c                                                                                 | Extra statuses: recorded, edited, deleted, revised, reverted. Extra buttons: discard, keep, cancel, apply, keep table, accept 760, accept revised, revert, make page, change place.                                                                                                                                                                                       | Fix one status list and one button set. Allow named accept buttons ("accept 760") only as labels for accept.                                              |
| W7 ~~p1~~ closed                | 3a (source), 6s8 (source), 6t8 (tool)                                                                               | Handwriting and email are both a source and a tool. A source "fills a database"; handwriting doesn't.                                                                                                                                                                                                                                                                     | Sources fill databases; tools are connections Pond uses. Move handwriting, web and email to tools, and keep sheets, calendar, bank and health as sources. |
| W8 p2                           | 3a                                                                                                                  | Used in storyboards but not defined: admin, member, guest, author, only you, shared with me, switcher, presence, to review, read chip, provenance chip, made-from chip, briefing, capture, filing, coming up, snooze, tombstone, kept value, restore, revert, redo, withdrawn, handle, block menu, selection bar, pill, file block, page link, deep research, share link. | Add them, each defined once. Give the roles one entry each, not only _editor_.                                                                            |
| W9 p2                           | 04 4a/4b, 05 5q "life › life"                                                                                       | "Life" is both the pond and its root page. The breadcrumb doubles it, and the onboarding question assumes the name.                                                                                                                                                                                                                                                       | Breadcrumb starts at the root page. Copy says "this pond".                                                                                                |
| W10 ~~p1~~ closed (moderator)   | 3a, 6q                                                                                                              | _Editor_ is a role and also zen's grammar reader.                                                                                                                                                                                                                                                                                                                         | Rename the zen one (for example "proofread").                                                                                                             |
| W11 p2                          | "note"                                                                                                              | Memory notes, the notes template, notes blocks, "＋ note" (5af), "import from notes", "keep as note".                                                                                                                                                                                                                                                                     | Reserve "note" for memory notes, or define each use.                                                                                                      |
| W12 p3                          | 02 2t                                                                                                               | `PondRail state="org"` names an organisation, which Pond has no word for. It's a prop, but it leaks into handoff.                                                                                                                                                                                                                                                         | Rename to `shared`.                                                                                                                                       |

### Consistency across files (C)

| id                                  | files                                                                                                                                                         | what's wrong                                                                                        | fix                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| C1 ~~p1~~ closed (C1, session undo) | 6a, 6c ("until the next edit on this page"), 7c ("within the session") vs 0a, 3a, 7e, 6o                                                                      | Undo depth.                                                                                         | Unlimited, one history. Undo becomes a diff when it would remove others' later changes. State it once, in 7e.  |
| C2 ~~p1~~ closed (C2)               | 6a (proposal card), 4d/6d/6e (draft page: keep/move/start over), 5t (keep/move/reject + keep as note), 6r (keep/move/discard)                                 | Four patterns for answer → page.                                                                    | One pattern: a proposal card (name, parent, kind), then the page. Or: a draft page with keep / move / discard. |
| C3 ~~p1~~ closed (C3)               | 6m ("the pond's name sits at the top of the rail") vs every other rail ("pond rva—25")                                                                        | The rail header.                                                                                    | Show the pond name and glyph with the switcher chevron.                                                        |
| C4 ~~p1~~ closed (C4)               | 4a/4c vs 6d f5                                                                                                                                                | Whether picked areas show in the rail before they hold a page.                                      | Pick one.                                                                                                      |
| C5 ~~p1~~ closed (C5)               | 0a, 5v, 7g vs 6b ("the phone only puts things in"), 9n ("no editing")                                                                                         | Mobile scope.                                                                                       | Mobile does everything. Fix the 6b caption and 9n. Make filing run on any device.                              |
| C6 ~~p1~~ closed (C6)               | 2t, 6q f6 vs 6e f1                                                                                                                                            | The selection bar: the 2t/6q drawings lack link, list and copy; 6e's toolbar is different.          | One bar: style, B, I, link, list, highlight, comment, ask pond, new page from this, copy.                      |
| C7 p2                               | 6q f1 caption vs its own frame, 3a                                                                                                                            | Zen entry points.                                                                                   | List ⌘K, ⌘., asking, and the journal setting.                                                                  |
| C8 p2                               | 6a f1 vs 2f                                                                                                                                                   | Esc in the composer.                                                                                | Use 2f's rule.                                                                                                 |
| C9 p2                               | 6g vs 2e                                                                                                                                                      | Whether chart opens the source picker.                                                              | Auto-wire when one table is nearby, otherwise the picker.                                                      |
| C10 p2                              | 6c caption vs 5r/6c drawing                                                                                                                                   | When accept all appears.                                                                            | Follow the caption and remove it from single cards.                                                            |
| C11 p2                              | 6n f4/f5, 6p f6                                                                                                                                               | Sam and Lee change roles; Jo (view) proposes.                                                       | Fix the fixtures.                                                                                              |
| C12 p2                              | 6f/6i/6h rail vs title                                                                                                                                        | "chickpeas, harissa, yoghurt" vs "chickpeas, harissa".                                              | Pick one.                                                                                                      |
| C13 ~~p1~~ closed                   | 6o f1                                                                                                                                                         | A studio collective diff in the life log.                                                           | Remove it, or show the log is pond-scoped.                                                                     |
| C14 p2                              | 6b f4 vs 8a                                                                                                                                                   | A receipt diffed into a bank-fed (read-only) budget.                                                | File the receipt as a record in a user database, or relate it to the transaction.                              |
| C15 p2                              | 6l vs 6f/6i                                                                                                                                                   | "Made from" needs a tie, and the pages named used a different template.                             | Say "made from" is a provenance record only. Fix the names.                                                    |
| C16 p2                              | 02 2o/2h vs 2a                                                                                                                                                | Is the menu row an atom (PondControl) or a molecule?                                                | Pick one level.                                                                                                |
| C17 p3                              | 0a contents, 7h ledger, 7g ("m01 5v"), 9k ("titles in 5f"), 0a onboarding decision ("7a–7b"), 0a "5l–5v" (5m–5o don't exist), CLAUDE.md "5a–5ag" (5ah exists) | Stale ids from before the renumbering.                                                              | Rewrite with `_idmap.json`.                                                                                    |
| C18 p3                              | 07 intro ("the rail in both modes"), 05 closing note ("Next: … a settings surface…")                                                                          | Leftover text from earlier rounds.                                                                  | Delete it.                                                                                                     |
| C19 p3                              | 6c/6o/7 fixtures                                                                                                                                              | The worktop date is 13, 20 and 27 oct in different places. The final copy is due 27, 29 and 31 oct. | Settle each value and add it to the 7h ledger.                                                                 |
| C20 ~~p1~~ closed                   | CLAUDE.md, 6t                                                                                                                                                 | The assistant agent does a built-in job (filing).                                                   | Filing stays pond. The assistant example becomes something else.                                               |
| C21 ~~p1~~ closed                   | 2f, 6t                                                                                                                                                        | / in the composer.                                                                                  | / in the composer runs skills and blocks from one list, or skills move to ⌘K only.                             |

### Components drawn in storyboards that 02 lacks (P)

All are p2 unless marked. Each needs a 02 entry with states, or a note on which child DC renders it.

- **Breadcrumb** (with presence, "only you", "you can edit by proposing", ⌘K) — ~~p1~~ closed. It appears on every screen.
- The **block handle menu** (6j, 6k, 7c, drawn three ways).
- **Blocks** missing from 2i: board and timeline views (3a lists them; 5ah project uses both), heading/text/prose blocks, image, file block (6q), page link (6k), `pond — update` block, sources block (6r), made-from chip (6a, 5t).
- **Pond switcher** and the new-pond sheets (6m); **share dialog**, **people list**, **link request** (6n); **access-removed notice** (6p).
- **Change log record page**, **changes panel** (⌥⌘H), **history list** (7e), and **conflict side-by-side** and merge card (6p).
- **Deep research** plan, progress, claims table and source card (6r).
- **Agent draft**, agent page, skill draft and **tools list** (6t).
- **Zen type sheet** (6q f9) and **attach menu** (6q f5).
- **New-page menu** (6s f1) and the **save-as-template sheet** (6i f3, 6l).
- The **broken-link menu** (7b), **coming up** list and bell (7d), and the **capture** screen (6b).
- **Settings rows** (5p) and the **onboarding** steps (4a).
- **Diff card** variants: page proposal (6a f4), revised (6c f3), outdated with reason (6p f7), and ink diff with unsure word (6s f5).

### Shortcuts (K)

| id    | what's wrong                                                                                                                                                            | fix                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| K1 p2 | 7e says "nothing takes a key the browser keeps", but ⌘D (bookmark), ⌘1–⌘3 (6m, tab switch) and ⌘J (Chrome downloads on Windows) are browser keys.                       | Choose alternatives, or drop the claim. ⌘1–⌘3 closed 8 oct: desktop app only. |
| K2 p2 | Shown in storyboards but missing from 7e: ⌘1–⌘3 (6m), F2 rename (2r), → / ← and ⌥-click in the rail (7f), ⇥ next suggestion (6q), ⇧↵ newline (2f), → preview in / (6f). | Add them to 7e.                                                               |
| K3 p2 | There is no Windows or Linux mapping, although "web and desktop" is the platform.                                                                                       | State Ctrl substitution and exceptions.                                       |
| K4 p2 | 7e history (click a line to go back) vs 6o f8 changes panel (⌥⌘H). Two panels for similar histories.                                                                    | Say how they relate, or merge them.                                           |

### Gaps — cross-cutting states (G)

- **G1 ~~p1~~ closed — offline, slow, failure.** Only 6b (offline capture queue), 2f (answer error) and 8a (broken source) are covered. Missing:
  - offline editing on desktop and web, and sync conflicts on reconnect
  - the model being slow or unavailable
  - deep research, handwriting or transcription failing
  - uploads failing
  - an agent run failing
- **G2 ~~p1~~ closed — target changed meanwhile.** Outdated is defined for diffs. Nothing covers these cases:
  - the page a proposal would create under is deleted, moved or unshared
  - an @-mentioned page is deleted mid-question
  - the thread with a pending diff is deleted
  - a template is deleted mid-preview
- **G3 ~~p1~~ closed — self-review.** Can the person who sent a diff accept it (editor on another's page, admin, or the user reverting their own change)? 6p f6 lists Sam as a reviewer of his own diff.
- **G4 ~~p1~~ closed — the permission matrix is incomplete.** For admin, editor, member, guest and author, decide who can:
  - delete, move or rename a page they don't author
  - edit database rows through a shared view
  - delete a database, connect a source, make agents or skills, or switch tools
  - change the pond theme
  - archive, export or delete the pond
  - see change-log records and comments on pages they can't open
  - delete a memory note they can't see (admin "can delete" but "sees only what's shared")

  Agents need the same answers: whose access does an agent read with, and who reviews its diffs?

- **G5 ~~p1~~ closed — notifications vs "no pings".** Invites go "by email" (6n, 0a) and reminders push on mobile (7d), yet 6p says "no badges, emails or pushes". Link requests and @-mentions of people need somewhere to appear. Decide what is allowed and list it once.
- **G6 p2 — empty and loading states missing:** change log, comments, memory, threads, agents, skills, tools, trash, coming up, a switcher with one pond, and "shared with me" when empty.
- **G7 p2 — volume:** long page titles in the breadcrumb, composer chips and proposal cards; a large change log, rail or palette (paging and virtualisation); many reference chips; many diffs in one card.
- **G8 p2 — mobile frames missing:** 6a, 6c–6l, 5p settings, 7a–7c, 7e (undo list), 8a, and 4c/4d first run. The keyboard-up composer appears only in 2f.
- **G9 p2 — double submit and empty input.** The composer's send stays grey when empty (2f). Nothing covers a double accept, a double make page, or a double save template (disable after the first press, idempotent records).
- **G10 p2 — system databases** (change log, threads, memory, comments, agents, skills). Can they be deleted, renamed, have fields added, or be viewed on pages? 6o says the log is read-only; the others aren't stated.

### Privacy — what leaves the pond (V)

| id                                  | where                                                                               | disclosed where it happens?                                                               | fix                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| V1 ~~p1~~ closed (terms of service) | every answer                                                                        | No. Pond's own model provider is never named, nor what is sent.                           | A line in settings and in onboarding step 1.                                                            |
| V2 ~~p1~~ closed (terms of service) | 6r deep research                                                                    | Partly: "reads the web", but not what the search queries contain.                         | The plan step says what will be searched and that pond text is not sent, or is.                         |
| V3 ~~p1~~ closed (terms of service) | 6b voice transcription, 6b receipt reading, 5ag photo import, 9r calories by camera | No.                                                                                       | The same pattern as handwriting in 6s8: a named service, what is sent, and an off switch.               |
| V4 ~~p1~~ closed (terms of service) | 6s handwriting                                                                      | Yes (6s8), but the vendor is a placeholder.                                               | Name it.                                                                                                |
| V5 p2                               | 6t email tool                                                                       | "Read only" only.                                                                         | Say which mailbox and folders, and what is read per run.                                                |
| V6 ~~p1~~ closed (6p)               | 6p @pond in comments                                                                | No. The draft could quote pages other commenters can't open.                              | @pond in a comment reads only what every person on the page can open, and says so.                      |
| V7 p2                               | 6n share dialog                                                                     | Guests see members' names and emails? Not stated.                                         | State what a guest sees.                                                                                |
| V8 ~~p1~~ closed (G4/V8)            | 6n private pages                                                                    | "No one else… admins included", but an admin inherits private pages when someone leaves.  | Tell the author at the "only you" mark. Or delete private pages on leave, which is the author's choice. |
| V9 p2                               | 6n f10                                                                              | Sam's thread in his own pond keeps an answer quoting a shared page after his access ends. | Decide whether answers citing lost pages are redacted.                                                  |
| V10 —                               | 0a f4 bug reports                                                                   | Future. The flow already shows the screenshot and schema before sending.                  | None now.                                                                                               |

### Craft (X)

- **X1 p3.** 2f's mobile composer tools are 40px, under the 44px mobile minimum.
- **X2 p3.** 6n f12, 6m f8 and 6s f9 mobile frames are mostly empty in text: status bars, a title. Check they render content.
- **X3 p3.** 5q/6a f2 end the streamed answer mid-sentence, which is intended. 6d f3 ends "correct me" with no full stop after streaming finished.
- **X4 p3.** Placeholder numbers not in the 7h ledger: "3 proposed" (6o), "34 read · 12 kept · 5 cited" (6r), "21 read · 8 kept", "about 8 min", "2 sheets connected", "members · 4", "last ran" times, receipt £86.40. They are plausible, but mark them with the "mark numbers" tweak, which 7h describes and no file appears to implement (verify).
- **X5 p3.** 7h's ledger lists boards by old ids (5j, 5i, m08, 20, 21).

---

## 4. Open questions for the product owner

1. Are `pond — update` blocks and the morning briefing written without a diff (a reserved, logged, undoable block type) or proposed like everything else? (S1, S2)
2. Answer → page: a proposal card first, or a draft page with keep / move / discard? (C2)
3. How deep does undo go, and what happens when undo would remove someone else's later change? (C1)
4. Can a proposer accept their own diff, as editor, admin or when reverting? (G3)
5. When does another person's typing become a diff: on pause, on blur, or on send? And do later edits amend a pending diff or add a new one? (6n, 6p)
6. What notifications exist: invite email, reminders, link requests, person @-mentions? (G5)
7. What can admins do with content they can't see: export, delete the pond, delete memory notes? Which admin inherits a leaver's pages, and are private pages inherited or deleted? (G4, V8)
8. Does a table made from a list, or a page made under a collection, create or join a database? (6f, 6j, 7c)
9. Is "kind" a real property of a page? If so, what sets it, given templates leave no tie? (W5)
10. Handwriting, email and web: sources or tools? (W7)
11. Which model provider and which handwriting, transcription and search services? What is sent to each? (V1–V4) Handwriting answered 8 oct: a stroke-based API, sent only the selected strokes.
12. Is a phone-only person a supported user? If so, filing and review must run on mobile without a desktop. (C5)
13. Can agents use the web? And in a shared pond, whose access does an agent read with? (S9, G4)
14. What does archiving a pond mean, and where does a deleted pond's 30-day copy live? (6m)
15. Account-less use: what is blocked, and how is local data merged on sign-in? (4a)
16. Reminders only per field (every record) — is that intentional, with no per-record override? (7d)
