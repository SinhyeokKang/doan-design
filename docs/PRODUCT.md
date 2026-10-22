# Doan Design — Product plan

> Source of truth for product judgment (problem, users, scope, loop, MVP, PoC) and for the whole decision log. Structure, formats, and conventions live in [ARCHITECTURE.md](./ARCHITECTURE.md) (split out 2026-10-21).
> This document accumulates planning decisions. [README.md](../README.md) is a draft holding background and ideas; this document records only what was agreed with the user, with dates.
> Each section stays `TBD` until a decision is made. The matching section of the README draft is linked for reference only.

## 1. Problem (2026-10-21)

The design drafts that coding agents make live outside the code (in external design services). This causes four problems. The arrow at the end of each problem points to the §3 'In scope' item that addresses it.

1. **Conversations split.** Design-draft conversations and implementation conversations pile up separately in two tools. Depending on the runtime, the agent cannot even reach the design draft (Codex could not use Claude Design or DesignSync). → Deliver
2. **Agents cannot read design drafts properly.** Large files get truncated (DesignSync `get_file` caps at 256 KiB), and the agent does not know where the human pointed. → Show · Let humans point
3. **Design drafts do not know the code.** They do not know the real tokens or implementation, so they drift from the implementation. → Tie to code · Check
4. **Records are locked into an external service.** When the service shuts down, comments disappear. Standalone Claude Design shuts down on 2026-12-14, and chats and comments are not migrated (support.claude.com/en/articles/17440474). → Store as repo files

Source: the Malmoi case in README draft §1 (2026-09 to 10).

## 2. Users

The primary users are external users in general (2026-10-21). Installation, onboarding, and documentation are within product scope.

The agents the MVP officially supports are Claude Code and Codex (2026-10-21). Onboarding installs skills and MCP into these two. Other agents can use Doan through the `doan` CLI if they can use a shell, but the user installs it themselves.

## 3. Scope

### In scope (2026-10-21)

1. **Show.** The app shows the canvas the agent wrote into the repo, with zoom in/out and frame jumps, and shows the styles and tokens of a selected element in the inspector.
2. **Let humans point.** The human leaves instruction notes (comments) on elements and frames, stored as repo files.
3. **Deliver.** The agent reads comments and the target the human selected (`active`) through the CLI, MCP, and skills, applies them, then resolves them.
4. **Check.** `doan check` statically checks the canvas's conventions, tokens, and external resources.
5. **Tie to code.** The canvas uses the repo's real token CSS, and frames point to implementation files (`data-doan-implements`). Evidence: README draft §1. In Malmoi, the design draft did not know the real tokens and diverged from the implementation in 29 places, and it drew commands that did not exist.

On top of that, Doan handles installation and onboarding so these five work.

### Out of scope (2026-10-21)

1. **Drawing.** The agent draws the design draft. Doan is not a vector tool (Figma) where humans draw shapes.
2. **Enforcing a canvas format.** The agent decides sections, notes, and layout. Doan's conventions are only the minimal attributes Doan reads (canvas, frame, and element ids, frame title, implementation path, board width).
3. **Conversation.** No built-in agent, chat, or replies. A comment is a one-way note from human to agent.
4. **Waking the agent.** The human holds the initiative in the conversation.
5. **Server.** No accounts, sync, or hosting. Sharing happens through git, and the web only serves as the download path.
6. **Git operations.** The agent makes commits and branches.
7. **Real-time co-editing.**

Source: README draft §3, revised to match the decisions so far.

## 4. Core loop

### Unit of review: one spec = one canvas (2026-10-21)

- The whole design spec of one spec (one ticket) is reviewed on **a single canvas**. The design spec contains the user flow, per-state guides for blocks and components, layout and spacing guides, and copy guides.
- **One canvas holds multiple frames.** Canvas and frame are not 1:1.
- The human zooms the canvas in and out and picks a specific frame to review.
- **One canvas = one HTML file in the repo** (2026-10-21). The agent decides whether to keep a shared shell or assets separately and reference them.
- **Doan recognizes frames by the `data-doan-frame="id"` attribute** (2026-10-21). The agent attaches this attribute to the elements it wants treated as frames and freely decides layout and look. The frame list, jumps, and comment grouping use this id.
- **Ids do not change** (2026-10-21). This is so comments follow even when a file moves or a title changes.
  - Canvas id: `<meta name="doan:canvas" content="id">` inside `<head>`.
  - Frame id: the `data-doan-frame` value. The visible name is kept separately in `data-doan-title` (optional).
  - The agent names the id when it first creates it. `doan check` catches duplicates and omissions.
- **A frame can point to an implementation file** (2026-10-21): `data-doan-implements="app/projects/new/page.tsx"`. Since one canvas has multiple frames and each frame has a different implementation file, this is set per frame, not per canvas.
- **The agent decides how to organize the inside of a canvas.** Doan does not fix the shape of the guide (section categories, note format, layout). The cases below are references only, not a format to follow.
- Cases referenced:
  - The user's Figma design guide (Skillflo B2E, FCLXP-13938 learning dashboard revamp). One section places `user-journey-map` · `template-guide` (per-block structure diagram, states, branches, layout) · `layout-guide` · `i18n-guide` side by side. The user said this format is "a bit vast" ("좀 방대하다").
  - The way Claude Design spreads a design guide over a canvas. The user said this approach is also fine. `Language Request Todo.dc.html` (about 30 KB) from the Malmoi project was read with DesignSync `get_file`.
    - One HTML page with `<meta name="design_doc_mode" content="canvas">` is one spec.
    - Header: a one-line spec title and an intro paragraph. The intro paragraph gives the brief path, the implementation components touched, the source of the dimensions, and notation rules.
    - The body stacks numbered frames (1–8, 5b) vertically. Each frame consists of a header (number badge · title · implementation file path), a screen render on the left (fixed width · theme · locale), and a 400px column of note cards on the right. Note cards hold design decisions and their rationale, with tags like "not in code · i18n key".
    - Screens are drawn with templates (`sc-for`·`sc-if`) and data inside a script (`renderVals`). Fonts and icons are loaded from a CDN.

### Loop (2026-10-21)

1. **The agent writes the canvas.** It writes `design/<spec>.html` and verifies it itself with `doan check` (static).
2. **The human views it in the app.** They view with zoom in/out and frame jumps, and the view live-reloads when the file changes.
3. **The human points.** Comments left on elements and frames accumulate in `.doan/comments/`.
4. **The human talks to their own agent.** They say "fix this" (the agent finds the target via `active`) or paste a sentence copied from the app. Doan does not wake the agent.
5. **The agent applies it.** It reads with `doan comments` and `doan active` → edits the canvas → `doan check` → `doan comment resolve`. Then back to 2. The human checks, and reopens if needed.

Reference: the README draft §4 loop, revised to match the decisions so far.

## 5. MVP

What the human does is **view + comment**; approval is deferred until after the MVP (2026-10-21). The feature list was finalized on 2026-10-21.

### App (Mac)

0. **First-run onboarding** (2026-10-21)
   1. CLI install: link the `doan` inside the app bundle onto PATH. Reference: Orca and ego-browser put the CLI inside the app bundle and only place a symlink on PATH (confirmed in the local bundle).
   2. Agent connection: detect whether Claude Code and Codex are installed, then install skills and register MCP for the chosen one.
   3. Open a repo: when a folder is chosen, create `design/` and `.doan/` and ask for the token CSS path. Same logic as `doan init`; repos already set up are skipped. The app runs the bundled `doan init --json --token-css <path>` instead of re-implementing it in TypeScript (2026-10-21), so the `init` result shape is a contract between the app and the CLI.
   4. First canvas: instead of an empty screen, let the user copy "the first sentence to send to the agent" (e.g. `make a <spec> canvas with the doan skill`). No sample canvas ships in the app.
   - Steps 1 and 2 happen once per machine; step 3 happens per repo.
1. Opening a repo folder shows the list of canvases (HTML files).
2. Canvas view: zoom in/out, pan, live reload.
3. Frame list and jumps. Frames are found by `data-doan-frame`.
4. **Selection and inspector** (2026-10-21)
   - The human selects an element or frame by clicking. Hover only highlights candidates.
   - This single selection is shared by the inspector, comment creation, and `doan active`.
   - Selecting an element opens one panel showing the inspector and that element's comments together. Comments are created, viewed, edited, and deleted in this panel (CRUD). The inspector is view-only (2026-10-21).
   - The inspector is read-only. It shows:
     - Box: size · padding · margin · gap
     - Typography: font · size · line height · weight
     - Color (text · background · border) · radius · shadow
     - `data-doan-*` attributes (id · implements)
   - For each value, if a token was used, the token name is shown alongside (e.g. `--foreground` → `#0a0a0a`); if hardcoded, that is marked. There is no editing. The agent is the one who draws.
5. Comments
   - **Element comments**: click an element to attach a note. The anchor's first priority is `data-doan-id`, and selector · HTML snippet · text quote · design-draft hash are stored together as fallbacks.
   - **Frame comments**: attached to `data-doan-frame`. Because canvas organization is up to the agent, many elements have no `data-doan-id`, and a frame anchor is more robust than an anchor on such elements.
   - **Canvas comments**: a comment with neither a frame nor an element attaches to the whole canvas, because the conventions do not require frames (2026-10-21).
   - Status has two stages: `open` → `resolved`. The agent that applied it resolves it, and the human can reopen it after checking in the app. The human can also resolve a comment in the app (2026-10-21).
   - Only the human edits or deletes the body, and only in the app. The agent (CLI · MCP) only resolves (2026-10-21).
   - Shown as pins; comments whose design-draft hash changed are marked outdated.
6. Copy a sentence to send to the agent.
7. Tell the CLI the currently selected frame or element (the source of `doan active`).

### CLI `doan`

8. `doan init`: creates `design/` and `.doan/` in the repo, adds union merge for comments to `.gitattributes`, and asks for the token CSS path. Does the same as app onboarding step 3, from the terminal. It does not install skills (2026-10-21): installing the skill stub is tied to detecting Claude Code and Codex, so it belongs to onboarding step 2 (#8 `onboard-dist`).
9. `doan ls` · `doan comments` · `doan comment resolve` · `doan skill`. They only read and write repo files, so they work without the app.
10. `doan active`: returns the frame or element the human selected in the app. Lets the agent find the target from just "fix this". Requires the app to be running.
11. `doan check` does **static checks only**. It looks at what HTML parsing alone can catch: undefined `var(--*)`, duplicate `data-doan-id`, missing or duplicate canvas ids and frame ids, missing `doan:width` (error), comment files with no matching canvas, and whether `data-doan-implements` target files exist. External URLs (CDN scripts and fonts) are not blocked but shown as a warning list (2026-10-21). If token CSS exists and hex or rgb colors are used directly, it warns (2026-10-21). Comment files with no matching canvas are a warning, not an error (2026-10-21). Full criteria: ARCHITECTURE §1 'Conventions'.

### MCP

12. Provide the same functionality as the CLI as MCP tools.

### Skills

13. Install skills for Claude Code and Codex.

### Feature split (2026-10-21)

The MVP is split into 8 features. One feature is one `/feature` run and is managed in `docs/features/<slug>/`. The order follows dependencies. For each feature, the spec is first established as the source of truth with `/feature` (2026-10-21 user), and the §6 PoC runs before implementing the features that rely on its assumptions. Establishing formats and the CLI first lets the agent-side loop (read comments · resolve · check) be verified without the app, and the app builds on top of those formats.

| # | slug | Scope |
|---|---|---|
| 1 | `formats` | JSON Schema (comment events · config · CLI envelope) + fixtures + event folding (TS·Go) |
| 2 | `cli-core` | Go CLI: `init` · `ls` · `comments` · `comment resolve` · `check` (static) · `skill` (with its body), `--json` · exit codes · repo discovery |
| 3 | `mcp` | `doan mcp` (stdio) |
| 4 | `app-shell` | Electron skeleton: multiple folders · local server (serving scope) · file watching · canvas list. The real-app verification loop (`/runtime-test` skill) is built here. The app-driving tool (among Playwright Electron · CDP · `computer-use`) is decided in this feature's `/feature` (2026-10-21) |
| 5 | `canvas-view` | sandbox iframe · board size · zoom in/out and pan · frame list and jumps. When this feature is done, build the `/design-sync` skill (see 'Dogfooding' below) |
| 6 | `select-inspect` | selection · inspector · `runtime.json` + socket · `doan active` |
| 7 | `comments-ui` | panel comment CRUD · pins · outdated · sentence copy |
| 8 | `onboard-dist` | first-run onboarding · skill stub install · refine `doan skill` body · notarized dmg · brew cask · auto-update |

### Dogfooding: doan's UI drafts live in doan (2026-10-21)

- Design drafts for the doan app UI are kept as canvases in this repo's `design/` (ARCHITECTURE §1 Conventions), and viewed and commented on in the doan app. Whether the implementation matches the design draft is compared via computed style (`/design-sync`).
- Order: build doan's canvas features before UI design drafts are needed. #4 `app-shell` and #5 `canvas-view` are implemented with minimal UI and no design drafts, and once #5 is done, the `/design-sync` skill is built. From #6 `select-inspect` on, the design draft → implementation → comparison loop runs.
- Why: apply the problem doan aims to solve (design drafts live outside the code, §1) to doan itself first to verify it. Standalone Claude Design shuts down on 2026-12-14, so a Malmoi-style handoff cannot be relied on.

### Deferred

- Approval
- Width, theme, and state switching
- Render checks (overlap, overflow, console errors). Static `check` comes first so the MVP is not tied to a render implementation. When render checks are added, they use the app's Electron offscreen rendering (2026-10-21). If the app is off, the CLI fails and asks for the app to be started. Whether offscreen output matches the visible window in DPI and fonts must be confirmed with a PoC.
- Screenshots, ref comparison, `doan doctor`
- Web (doan.design) stack. The web only serves as the path to download the app, so it is decided after the app is done (2026-10-21).

## 6. Pre-implementation PoC (2026-10-21)

Unverified assumptions among the decisions are verified before implementation. Ordered by risk. If 1 or 2 fails, the canvas rendering structure (sandbox iframe + injected script) is decided again. Experiment code goes in `.scratch/`.

| # | What | Pass criteria |
|---|---|---|
| 1 | sandbox iframe + injected script | Without `allow-same-origin`, element click selection · highlight · board height measurement work via `postMessage` |
| 2 | Inspector token names | Trace `var(--x)` from repo CSS and inline styles back per element. Record how far CDN stylesheets can be handled |
| 3 | Pin position during zoom | Pins stay attached to elements as the transform scale changes |
| 4 | Local server serving scope | Responds only to allowed paths, relative links resolve, and a `/.env` request from the iframe fails |
| 5 | `merge=union` | When two branches append add and delete events to the same JSONL, they merge without conflict and the folded result matches expectations |
| 6 | Go CLI ↔ Electron socket + Go MCP SDK | Connects via `runtime.json` and receives `active`, and `doan mcp` shows up as a tool in Claude Code and Codex |

Results:

- PoC 5 merge half — passed (2026-10-21, git 2.50.1, `.scratch/`). Branch A appended a `create` and a `delete`, branch B appended a `create` and an agent `resolve` to the end of the same JSONL. With `.doan/comments/*.jsonl merge=union` in `.gitattributes`, the merge succeeded without conflict and kept all 5 lines; the merged file is not in `at` order (B's lines follow A's), which folding handles by sorting. Control without the attribute: the same merge conflicted. Fold half — passed (2026-10-21): the same merged file (hashes normalized to a valid 64-hex value) is the `union-merge` fold fixture, and both the TS and Go `foldText` produce the expected state with no warnings. PoC 5 passed.
- PoC 6 MCP half — passed (2026-10-21, go-sdk v1.8.0, Claude Code 2.1.306, Codex 0.163.0, `.scratch/`). A minimal stdio server with one tool `ping` returning `text-channel-ok` as text content and `{"channel":"structured-ok"}` as `structuredContent` was registered one-off in each agent (`claude -p --mcp-config --strict-mcp-config`, `codex exec -c mcp_servers.…`) and both agents launched from the worktree root. Both saw `ping` in their tool list (Codex names it `mcp__doan_poc6__ping`, hyphen turned into underscore) and received a call result. Both launched the server with the worktree root (the project directory) as its working directory. Channel: Claude Code showed only `structuredContent` (`{"channel":"structured-ok"}`) and said it received no other block; Codex showed both. `claude mcp list` and `codex mcp list` were identical before and after. Socket half (Go CLI ↔ Electron via `runtime.json`) is still pending, before feature #6 select-inspect.
- PoC 6 MCP half, real server — passed (2026-10-21, `doan mcp` built from `feat-mcp`, Claude Code 2.1.306, Codex 0.163.0). Registered one-off as `doan-mcp-check` in each agent with every call passing an absolute temp `repo`: `init`, then (after seeding a canvas and one open comment) `ls`, `comments`, `check`, `resolve_comments` and `skill` all returned `ok: true`; the comment JSONL gained one `resolve` event whose `by.name` was the `agent` passed (`claude-code`, `codex`); `claude mcp list` and `codex mcp list` were identical before and after. Codex refuses `codex exec` outside a trusted (git) directory without `--skip-git-repo-check`, so it was run from the worktree.
- PoC 4 — passed with `Access-Control-Allow-Origin: null` on in-scope 200 responses (2026-10-21, Electron 45.0.0 (Chrome 156.0.8078.48), Playwright 1.64.1, `.scratch/`). A minimal Electron app ran one `127.0.0.1` server following the app-shell decision order (Host check, raw-path parse without `new URL()`, realpath, segment-wise inside-root check, scope check, open + `fstat` regular file) for a temp repo with scope `design`, `tokens.css` (`tokenCss`), `fonts` (`serve`), and loaded `/t/<token>/<key>/design/a.html` from a `file://` host page into a `sandbox="allow-scripts"` iframe. First run, with no CORS header: the iframe's origin is `null`, so Chromium fetches the `@font-face` font and `<script type="module" src>` in CORS mode; the server logged 200 for both, but Chromium blocked both ("blocked by CORS policy"), so the font did not load and the module did not run. Re-run with `Access-Control-Allow-Origin: null` on in-scope 200 responses only (no other CORS headers, 404s unchanged): the font loaded, the module script ran, and the canvas's relative `../tokens.css` resolved and applied (`var(--brand)` computed to the token value); allowed paths returned 200 with `Content-Type`, `Cache-Control: no-store` and exactly that one CORS header. Accepted consequence: an iframe `fetch` of an in-scope file (`a.js`) is now readable. From the iframe, `fetch('/.env')`, `fetch('/t/<token>/<key>/.env')` and `fetch('/t/<token>/<key>/src/secret.ts')` each rejected and were server-logged 404 with no CORS header; a relative `../.env` was normalized by the browser to `/t/<token>/<key>/.env` and was 404. Raw paths sent with `http.request` (same in both runs): `..`, `%2e%2e`/`%2E%2E`, `%2f`, `%5c`, a raw `\`, `%00` and a bad percent escape were 404 at the parse step; `design/link-out` (symlink outside the repo) was 404 at the inside-root step; a directory, a wrong token, an unknown folder key, `Host: localhost:<port>` or `evil.test:<port>`, and `POST` were 404; `HEAD` was 200. `DESIGN/A.HTML` was 200 and served `design/a.html`; NFC and NFD Hangul file names were 200 whether requested in NFC or NFD. realpath: under both Node 26.4.0 and Electron's Node 24.22.0, `fs.promises.realpath` and `fs.realpath.native` return the on-disk spelling (letter case and NFC/NFD form), while the JS `fs.realpath`/`fs.realpathSync` keeps the request's spelling; the server will use `fs.promises.realpath`, so no extra disk-spelling step is needed. `_electron.launch` launched the Electron 45.0.0 app. Electron 45's npm package has no postinstall; its binary downloads on the first `require('electron')`.
- PoC 1 — passed (2026-10-22, Electron 45.0.0 (Chrome 156.0.8078.48), Playwright 1.64.1, macOS 26.3.1, `.scratch/poc1-canvas/`). Setup mirrored the app: a window page (`contextIsolation`, `sandbox: true`, preload, CSP `frame-src http://127.0.0.1:*`) hosting a `sandbox="allow-scripts"` iframe (no `allow-same-origin`) loaded from a `127.0.0.1:<random port>/t/<token>/<key>/design/<x>.html` server sending `Access-Control-Allow-Origin: null`; zoom/pan was `transform: translate() scale()` on a wrapper outside the iframe; the canvas ran in its own renderer process (OOPIF). Items:
  1. Injection — passed. Main ran `WebFrameMain.executeJavaScript` from webContents `did-frame-navigate` (sub-frame only, frame from `webFrameMain.fromId(processId, routingId)`, injected only when its parent is the window's main frame and its URL is under the token path); the script ran at `readyState` `loading` and started its observers on `DOMContentLoaded`. It re-injected on every navigation: 3 reloads by re-setting `src`, an in-canvas link to another canvas of the same key, and a new iframe. With a 3 s subresource, injection happened ~3 ms after `did-frame-navigate` and ~3 s before `did-frame-finish-load`. A canvas with `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; …">` blocked its own inline script but the injected script ran and reported its height (1234). Frame `dom-ready` also worked (ran at `interactive`); `frame-created` did not (the frame was still `about:blank` or empty). The server sent disk bytes unchanged. The injected code runs in the canvas's main world (canvas scripts can see its globals); `WebFrameMain` has no isolated-world call.
  2. Height — passed with this rule: on every `src` set (open and reload) the renderer resets the iframe height to 150px; the script reports `Math.ceil(document.documentElement.getBoundingClientRect().height)`; if, right after its own resize (`innerHeight` changed to the last reported height ±1), the document is still taller than `innerHeight` + 1, the content depends on the viewport and the height freezes at the last reported value for that load; the renderer caps the height at 200,000px. Results: normal 2345 (expected 2345); `min-height: 100vh` 500 (content 500); `min-height: 100vh` + `padding: 40px` 580 (content 500 + padding), frozen after one step; `height: calc(100vh + 200px)` + 300px frozen at 650 (no fixed point exists; the hero then renders at 850 inside 650, so the last 200px are clipped); a canvas rewritten from 3000px to 1000px measured 1000 after reload, and an in-page shrink to 400 measured 400 without reload. Each case stopped changing within 2 s (layout count unchanged from 2 s to 3.5 s). 50,000px board (50 frames) at scale 0.05: rendered, first `layout` 29 ms after open, bottom rendered at scale 1, total app working set 496 → 527 MB; a 200,000px board: rendered, 541 MB. rAF-batched `layout` updates were not delivered while the iframe was fully off screen (0 in 1.5 s) and arrived once it was visible again; the first `layout` is sent synchronously and arrived off screen.
  3. Wheel — passed. A plain wheel and a `ctrlKey` or `metaKey` wheel over the iframe reached the renderer through the injected script's `postMessage`. Deltas arrive in screen px at every scale (`page.mouse.wheel(30, 100)` gave `dx 30, dy 100` at 0.25, 1 and 4), so the pan over the iframe equalled the pan over the margin with no conversion (multiplying by the scale broke it). `clientX + scrollX` mapped to the right board point; a cursor-anchored ctrl/meta zoom over the iframe kept the board point under the cursor with 0 drift. A wheel over a scrollable inner element scrolled it (`scrollTop` 100, nothing forwarded, view unchanged); at its end the wheel panned the board. `getZoomFactor()` stayed 1 and no `zoom-changed` fired.
  4. Menu accelerators — passed. With focus inside the iframe (`document.activeElement` the iframe, `document.hasFocus()` true in the canvas), real key events sent by System Events (Cmd+=, Cmd+0, Shift+1, Cmd+-) ran the custom View menu items (zoom in, actual size, fit, zoom out); focus stayed in the iframe and `getZoomFactor()` stayed 1. Keys synthesized by Playwright (`keyboard.press`, CDP) did not reach native menu accelerators.
  5. Navigation — failed with the designed `about:blank` rule; passed with an initiator condition (see the end of this item). Electron 45 gives `details.initiator`: the app's main frame (no parent) for the renderer's `src`, the canvas frame for in-canvas links. On the first navigation `details.frame.url` is `about:blank` and its parent is the window's main frame; it was allowed. In-canvas links: same folder key allowed; another folder key, outside the token, `/t/<token>x/`, `%2e%2e` (normalized to another key), and another port refused by `will-frame-navigate`. `localhost`, `https://example.com` and `data:` were stopped earlier by the window CSP `frame-src` (no `will-frame-navigate`; the frame landed on `chrome-error://chromewebdata/`); with `frame-src` opened up, the handler refused all three. `target=_top` was blocked by the sandbox; hash links fire no `will-frame-navigate`. Re-setting `src` on the same iframe to another folder key was refused; a new iframe for it was allowed. Added case (conductor request): the canvas navigating itself to `about:blank` (`location.href` or a `target=_self` link) fired `did-frame-navigate` but no `will-frame-navigate`, and the frame stayed on `about:blank`; a navigation to another folder key started from that frame (script run by Playwright, initiator = the frame itself) was then allowed by the designed rule ("current URL `about:blank` and new URL under the token"). Also, after a CSP-blocked link the frame's main-side URL is the blocked URL (`https://example.com/`) while it shows `chrome-error://chromewebdata/`, so the renderer re-setting `src` on the same iframe (reload) was refused and the canvas stayed on the error page. Variant tested: allow when `details.initiator` is the window's main frame and the new URL is under the token; otherwise allow only a same-key navigation from a token URL. With it, the `about:blank` → other key navigation was refused, both reloads (from the error page and from `about:blank`) were allowed, and every other case above kept its result except re-setting `src` on the same iframe to another key (now allowed). Not established: whether canvas content alone can run script in that `about:blank` document.
  6. Selection — passed. With select mode on, clicking an element in the iframe at scales 1, 0.25, 0.5 and 4 posted its id and board rect; the injected highlight matched the element rect exactly (0px); a link clicked in select mode was selected, not followed.
- PoC 3 — passed (2026-10-22, same setup as PoC 1). A marker in the overlay layer took the board rect the injected script posted. The element's screen rect was measured from screenshot pixels (DPR 2) and compared with the marker's DOM rect: max edge error 0.563px over scales 1, 0.25, 0.5, 2.5, 4, 0.05 and 1.3333 with fractional translations, after a ctrl-wheel zoom and a wheel pan over the iframe, after reload, and after a reload that moved the element down 123px (the renderer re-requested the rect). Playwright's `boundingBox()` of an element inside the scaled iframe ignores the scale (width 120 at scale 0.25 instead of 30), so it cannot be used as the reference.

## 7. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-10-21 | Primary users are external users in general | User decision |
| 2026-10-21 | The human's screen starts as a Mac app | User decision |
| 2026-10-21 | MVP is view + comment; approval later | User decision — first see whether the loop (draw → note → apply) works |
| 2026-10-21 | Comments are received via CLI + MCP | User decision. Reference: Agentation and Doop pass comments over MCP (github.com/benjitaylor/agentation, github.com/kgoedecke/doop) |
| 2026-10-21 | Anchor is `data-doan-id` + multiple fallbacks | User decision. Evidence: Agentation docs recommend a stable data attribute and state the limits of reflow tracking (agentation.com/features). Doop stores a selector and an HTML snippet together |
| 2026-10-21 | Comment status is `open` → `resolved` | User decision |
| 2026-10-21 | The agent resolves; the human reopens | User decision |
| 2026-10-21 | MVP viewer is canvas overview + `doan check`; width, theme, and state switching are left out | User decision |
| 2026-10-21 | The agent decides how guides are organized inside a canvas. Doan does not fix a format | User decision |
| 2026-10-21 | Frames are marked with a single `data-doan-frame` attribute | User decision — format stays free, but this is the minimal convention needed for frame selection and comment grouping |
| 2026-10-21 | One canvas = one HTML file | User decision. Reference: in Claude Design too, one spec is one `.dc.html` page |
| 2026-10-21 | `doan check` does static checks only in the MVP; render checks later | User decision — so the MVP is not tied to a render engine decision |
| 2026-10-21 | Frame comments in addition to element comments | User decision — canvas organization is up to the agent, so many elements have no `data-doan-id` |
| 2026-10-21 | `doan active` included in the MVP | User decision — so "fix this" alone finds the target. A command that was in README draft §9 |
| 2026-10-21 | `doan init` included in the MVP | User decision — first-time setup for external users |
| 2026-10-21 | MVP feature list finalized (§5) | User decision |
| 2026-10-21 | App first-run onboarding in 4 steps (CLI install · agent connection · open repo · copy first sentence) | User decision — external users start with no CLI, skills, or repo setup |
| 2026-10-21 | Comments are append-only events in `.doan/comments/<canvas path>.jsonl` (same day: path → changed to canvas id) | User decision. Reference: git-appraise's one-line JSON. Conflict-avoidance rationale corrected the same day (ARCHITECTURE §2 Comment storage) |
| 2026-10-21 | Canvas rendering is local HTTP server + sandboxed iframe + injected script (`postMessage`) | User decision. Evidence: `file://` multi-file limits (baoyu-design), isolating agent-written HTML |
| 2026-10-21 | CLI ↔ app is runtime file + unix socket + token | User decision. Evidence: Orca's `orca-runtime.json` structure |
| 2026-10-21 | MCP is `doan mcp` over stdio, same code as the CLI | User decision. Evidence: avoids Pencil MCP's dependency on the app running |
| 2026-10-21 | Skills are stub + `doan skill` body + end marker | User decision. Evidence: Orca's and ego-browser's skill-stub approach |
| 2026-10-21 | App is Electron + TypeScript | User decision. Evidence: render match with what agents actually measure (Chromium), Orca precedent. Cost: app size |
| 2026-10-21 | CLI is a Go or Rust native binary | User decision. Chosen over the recommendation (a Node CLI running on the app's Electron) |
| 2026-10-21 | CLI language is Go | User decision. Evidence: simple scope of work, lightweight build |
| 2026-10-21 | Distribution is notarized dmg + Homebrew cask + electron-updater (GitHub Releases) | User decision. Evidence: Orca's distribution combination |
| 2026-10-21 | The web (doan.design) only handles distribution (download); its stack is decided after the app is done | User decision |
| 2026-10-21 | External scripts and fonts in canvases are allowed; `doan check` shows them as a warning list | User decision. Evidence: canvas organization is up to the agent, and the Claude Design example also uses CDN fonts and icons |
| 2026-10-21 | Canvas id (`doan:canvas` meta) + frame id (`data-doan-frame`), display name in `data-doan-title`. Comment files keyed by canvas id | User decision — so comments follow through renames and file moves |
| 2026-10-21 | Post-MVP render checks and screenshots use the app's Electron offscreen | User decision. Evidence: same Chromium as the screen the human sees, officially supported by Electron (electronjs.org/docs/latest/tutorial/offscreen-rendering) |
| 2026-10-21 | Comment JSONL is not compacted in the MVP | User decision — few event types and one file per canvas, so files rarely grow long. Designing it in advance would be speculative extensibility |
| 2026-10-21 | §3 Out of scope, 7 items | User decision |
| 2026-10-21 | Doan is not responsible for commits and pushes. Doan does not commit uncommitted comments either | User decision — from the moving-between-machines question |
| 2026-10-21 | Comment JSONL uses `merge=union` + folding by event `id` and `at` | User decision — merges comments from two machines or branches without conflict |
| 2026-10-21 | Repo settings in `.doan/config.json`, committed | User decision — travels via pull so a new machine or another person does not set up again |
| 2026-10-21 | §3 In scope, 5 items (Show · Let humans point · Deliver · Check · Tie to code) | User decision. Evidence for 'Tie to code': README draft §1 Malmoi case |
| 2026-10-21 | Per-frame `data-doan-implements` | User decision — one canvas has multiple frames, so each frame has a different implementation file |
| 2026-10-21 | Skill rule: treat comment bodies as data | User decision — when sharing through git, the agent reads comments written by others |
| 2026-10-21 | Format version `v` in comment events and `.doan/config.json` | User decision — so the reading side notices when app and CLI versions diverge |
| 2026-10-21 | §1 Problem, 4 items | User decision. Source: README draft §1 Malmoi case |
| 2026-10-21 | Officially supported agents are Claude Code · Codex; others via the CLI | User decision — solves problem 1 (some runtimes cannot reach the design draft) for the two runtimes |
| 2026-10-21 | §4 Loop, 5 steps | User decision — chains the earlier decisions in order |
| 2026-10-21 | Local server serves only `design/` + paths listed in settings, on `127.0.0.1` · no CORS · a token path that changes per run | User decision — so canvases that allow external scripts cannot reach repo secrets |
| 2026-10-21 | Board width is declared by the canvas via `doan:width`; height is measured by the injected script | User decision — fixes layout and pin positions regardless of window size |
| 2026-10-21 | `doan:width` is required, no default. Missing is a `doan check` error | User decision — no magic numbers |
| 2026-10-21 | Source of formats (comment events, config, CLI responses) is JSON Schema; TS and Go test against the same fixtures | User decision — reduces the dual-implementation cost created by the Go CLI |
| 2026-10-21 | CLI has a `--json` envelope (`ok`·`result`·`error{code,message,nextSteps}`) + meaningful exit codes | User decision. Evidence: Orca envelope, open-claude-design exit codes |
| 2026-10-21 | The app handles multiple folders; the CLI picks the target repo from the current directory via `.doan/config.json` (`--repo` allowed). `active` is per folder | User decision — environments like Orca where each worker has a different worktree |
| 2026-10-21 | Event author: the human is the git user (read only), the agent is the runtime name | User decision — appears as the same person as in git history, without accounts |
| 2026-10-21 | To be released as open source; license type TBD | User decision |
| 2026-10-21 | The app and CLI do not handle GitHub tokens | User decision — not handling secrets is the simplest security boundary. Updates via public Releases, releases via CI secrets |
| 2026-10-21 | Author display is git user name and email + initials avatar, no GitHub account fetch | User decision — consistent with the decision not to handle tokens |
| 2026-10-21 | Conventions list (ARCHITECTURE §1) — 10 canvas conventions + agent rules A–H | User decision |
| 2026-10-21 | Token CSS is linked by a path relative to the canvas; the server serves allowed paths following the repo structure | User decision — the same links resolve outside the app (editor, browser) too |
| 2026-10-21 | Hardcoded colors are a `doan check` warning; things not in code are stated on the canvas (no check) | User decision. Evidence: §1 problem 3, Malmoi `malmoi push` case |
| 2026-10-21 | Inspector in the MVP (read-only, key styles + token names). The inspector, comments, and `active` share one selection | User decision — view styles like developer tools, but only what design review needs |
| 2026-10-21 | Selecting an element shows one panel with inspector (view only) + comments (CRUD). Only the human edits or deletes; deletion is a delete event | User decision. Delete events keep deleted comments from reviving under union merge |
| 2026-10-21 | 6 pre-implementation PoC items and pass criteria (§6) | User decision |
| 2026-10-21 | MVP split into 8 features and their order (§5 Feature split) | User decision — formats and CLI first, the app on top |
| 2026-10-21 | For each feature, establish the spec with `/feature` first; run the PoC before implementing the relevant feature | User decision |
| 2026-10-21 | ARCHITECTURE.md split: moved PRODUCT §4 'Conventions' and §6 'Architecture · stack'. The decision log stays in one place, in PRODUCT | User decision — PRODUCT exceeded 340 lines, and a structural source of truth was needed to promote feature conclusions into |
| 2026-10-21 | `/runtime-test` gets its tool decided and is built in #4 `app-shell` | User decision — written now, with no app launch command or driving tool, it would be an empty skill |
| 2026-10-21 | Dogfooding: doan's UI drafts as canvases in this repo's `design/`; `/design-sync` is built after #5 `canvas-view` and used from #6 | User decision — build canvas features before UI is needed |
| 2026-10-21 | Review the whole design spec of one spec on a single canvas via zoom in/out and frame selection. One canvas holds multiple frames | User decision. Reference: the user's Figma design guide ("a bit vast" ("좀 방대하다")), Claude Design `Language Request Todo.dc.html` |
| 2026-10-21 | The human can also resolve comments in the app; the agent still only resolves | User decision (formats review) — otherwise the only way for a human to close a comment they handled themselves is delete, which loses the record |
| 2026-10-21 | The CLI envelope also carries format version `v`; all three formats have `v` | User decision (formats Q5) — same reason as the comment-event and config `v` |
| 2026-10-21 | Agent author `by.name` is a lowercase kebab string, not a fixed list | User decision (formats review) — other agents also use the CLI (§2), and adding one should not require a new `v` |
| 2026-10-21 | Code layout: root `go.mod`, `schema/` embedded by `schema/embed.go`, Go formats in `cli/internal/formats/`, TS in `app/` (npm). JSON Schema 2020-12, ajv (TS), santhosh-tekuri/jsonschema v6 (Go) | User decision (formats) — `go:embed` cannot reach parent directories, so the module root must contain `schema/` |
| 2026-10-21 | Event ids `evt_`/`cmt_` + lowercase UUIDv4; `at` in UTC milliseconds fixed by pattern | User decision (formats Q2) — order comes from `at`, so ids need no time |
| 2026-10-21 | Element `html` snippet capped at 2,000 code points, cut with `truncated: true` | User decision (formats Q3) — bounds line size without dropping the anchor |
| 2026-10-21 | CLI exit codes 0–4 and the MVP `error.code` list (ARCHITECTURE §12); `doan check` findings exit 4 with `ok: true` | User decision (formats Q4 and review) — findings must stay in `result` for the agent to fix them |
| 2026-10-21 | Folding rejects agent `create` too; the agent only resolves | User decision (formats review) — §3 Out of scope: comments are one-way, human to agent |
| 2026-10-21 | Same event `id` with different content: drop every copy and warn | User decision (formats review) — order-independent without canonical serialization |
| 2026-10-21 | Fold judgment order permission → deleted → existence → apply; `updatedAt` changes only on create/edit; repeated resolve/reopen is a silent no-op | User decision (formats review) — permission does not depend on state, so it is checked first |
| 2026-10-21 | Folding is two pure functions `parseLines` + `fold`, exposed together as `foldText`; warnings `{code, line, event?, comment?}` sorted by line | User decision (formats review) — line numbers and broken JSON need text input; one public function keeps callers from re-implementing the merge |
| 2026-10-21 | Fixtures compared by parse-then-deep-equal, not bytes | User decision (formats review) — agents parse JSON; byte equality across TS and Go (HTML escaping, U+2028, key order) adds cost with no product benefit |
| 2026-10-21 | Writers keep `at` strictly increasing per file (+1ms) | User decision (formats review) — same-millisecond create/edit could otherwise reorder by id |
| 2026-10-21 | Dropped `target.point`; `target.frame` optional (canvas comments); human `email` optional | User decision (formats review) — `point` was speculative; conventions do not require frames; git `user.email` may be empty |
| 2026-10-21 | Config is `tokenCss` (single, optional) + `serve`; schema rejects absolute, `..`, empty, and dot-only paths | User decision (formats review) — onboarding asks for one path; `serve: ["."]` would expose the repo root |
| 2026-10-21 | Blank JSONL lines are SP/HT/CR only and one leading BOM is stripped; `canvasHash` is 64 lowercase hex | User decision (formats review) — TS and Go must use the same character set; one spelling per hash keeps outdated detection exact |
| 2026-10-21 | Canvas id is lowercase kebab `^[a-z0-9]+(-[a-z0-9]+)*$` (ARCHITECTURE §1 convention 2) | User decision (cli-core Q1) — the id becomes a comment file name, and macOS file names are case-insensitive |
| 2026-10-21 | `doan comment resolve` takes the agent name from a required `--agent` flag | User decision (cli-core Q2) — one place to read it, nothing guessed |
| 2026-10-21 | `doan init` does not install skills; skill stub install moves to #8 `onboard-dist`; #2 `cli-core` builds the `doan skill` body | User decision (cli-core Q3) — stub install is tied to agent detection in onboarding step 2 |
| 2026-10-21 | `doan check` reports comment files with no matching canvas as a warning | User decision (cli-core Q4) — as an error, an agent could delete comment files to pass check, but only humans delete comments |
| 2026-10-21 | `doan check` counts only token definitions the canvas actually reaches (its styles, linked local CSS and their imports), not the unlinked `tokenCss` | User decision (cli-core review Q5) — matches what the browser resolves, so a missing token CSS link is caught |
| 2026-10-21 | Tokens defined only in external (CDN) stylesheets are an `undefined_token` error | User decision (cli-core review Q6) — tokens come from the repo's local CSS (§3 'Tie to code'); the CLI does no network requests |
| 2026-10-21 | A local stylesheet the canvas reaches outside the serving scope is a `doan check` error | User decision (cli-core review Q8) — the human would see the canvas unstyled, and the agent can fix it via `serve` |
| 2026-10-21 | App onboarding step 3 runs the bundled `doan init --json`; the `init` result is an app–CLI contract | User decision (cli-core review Q9) — a TypeScript re-implementation would drift like the fold divergence in POSTMORTEM |
| 2026-10-21 | Hardcoded-color warning also covers canvas custom property declarations and `var()` fallbacks | User decision (cli-core review Q13) — convention 10 as written; a re-declared token drifts from the real one |
| 2026-10-21 | cli-core tasks 1–8 run as one `/orchestrate` on one `feat-cli-core` branch and one PR | User decision (cli-core review Q7) — one feature, one reviewable unit |
| 2026-10-21 | `doan init` may create a repo under an existing one; discovery picks the inner repo | User decision (cli-core review Q10) — subfolders can be design repos of their own |
| 2026-10-21 | `doan init` on a broken config fails with its code and never overwrites it | User decision (cli-core review Q11) — onboarding must not treat a broken repo as set up and fail later |
| 2026-10-21 | No `doan comments --all` for resolved comments | User decision (cli-core review Q12) — no scenario uses it |
| 2026-10-21 | CLI `result` shapes are prose in ARCHITECTURE §12, not JSON Schema (§11 exception) | User decision (cli-core design) — Go is the only producer, so there is nothing to drift |
| 2026-10-21 | A canvas the HTML parser rejects is a `doan check` error `unparsable_canvas` (19th rule), not a command failure | User decision (cli-core orchestration) — check tells the agent where to fix; `internal_error` looks like a CLI bug and hides every other canvas's results |
| 2026-10-21 | CLI path resolution returns the on-disk spelling on case-insensitive filesystems; `doan init` stores `tokenCss` in that spelling | User decision (cli-core orchestration) — one file must be one key, and the stored config must resolve on case-sensitive machines too |
| 2026-10-21 | Path errors that content alone can cause (`ENOTDIR`, NUL, too long, symlink loop) count as missing and become findings; only environment errors are `internal_error` | Conductor call (cli-core orchestration) — a canvas href must not abort `doan check` |
| 2026-10-21 | `orphan_comment_file` matches comment files against any canvas's first id string, valid or not | Conductor call (cli-core orchestration) — `invalid_canvas_id` already points at the fix; avoids nudging agents to delete comments (Q4) |
| 2026-10-21 | Findings from an indirect `@import` go to the CSS file that contains it, once; empty hrefs are ignored | Conductor call (cli-core orchestration) — the fix is in that file; the browser does not fetch an empty href |
| 2026-10-21 | `doan comment resolve` builds and validates all events before writing any file | Conductor call (cli-core orchestration) — deterministic failures must not leave some files written |
| 2026-10-21 | PoC 6 MCP half runs as task 0 of feature `mcp`, gating the rest; the socket half waits for #6 | User decision (mcp feature) — `doan mcp` needs the SDK and agent behavior confirmed first; the socket only matters for `active` |
| 2026-10-21 | MCP exposes `init`, `ls`, `comments`, `resolve_comments`, `check`, `skill`; `init`'s description says to use it only when asked and to ask for the token CSS path first | User decision (mcp Q1, review) — PRODUCT §5 12 "same functions as the CLI"; MCP cannot prompt, so the agent asks instead |
| 2026-10-21 | MCP tool results are the CLI `--json` envelope, as text and `structuredContent`; `isError` is `!ok` | User decision (mcp Q2) — one shape for CLI and MCP; PoC 6 showed Claude Code reads only `structuredContent` |
| 2026-10-21 | MCP picks the repo from the server's working directory, overridden by `repo?`, which must be absolute | User decision (mcp Q3, review) — the server's directory is fixed and invisible to the agent, so a relative path could hit the wrong place |
| 2026-10-21 | The guide reaches MCP through the `skill` tool plus a one-line `instructions` | User decision (mcp Q4) — one body, one version, the end marker unchanged |
| 2026-10-21 | MCP `agent` is required and never taken from `clientInfo.name` | User decision (mcp review) — ARCHITECTURE §2: runtime names come only from `--agent` |
| 2026-10-21 | MCP code lives in package `cli`; tools build an argv and call `cli.Run`; low-level `Server.AddTool` + `IOTransport`; `doan mcp` rejects every flag and skips `emit` | User decision (mcp review) — avoids an import cycle, makes tool output equal CLI output by construction, keeps argument errors in our envelope and stdout protocol-only |
| 2026-10-21 | The MCP server advertises only the `tools` capability | User decision (mcp orchestration) — it sends no logs or list-changed notifications |
| 2026-10-21 | Keep the SDK's drop-on-EOF behavior and document it | User decision (mcp orchestration) — real clients keep stdin open; writes are never cut in half |
| 2026-10-21 | `doan mcp -h`/`--help` print usage and exit 0 | Conductor call (mcp orchestration) — ARCHITECTURE §12 applies `-h`/`--help` to every command; no server starts |
| 2026-10-21 | A Claude worker may call `codex exec` for the mcp real-agent checks (tasks 0 and 4) only | User decision (mcp review) — crossing the model boundary needs explicit permission, scoped to these checks |
| 2026-10-21 | The local server sends `Access-Control-Allow-Origin: null` on in-scope 200 responses only (replaces "no CORS") | User decision (app-shell orchestration, Q13) — PoC 4: the `null`-origin sandbox iframe could not load repo fonts or module scripts without it; out-of-scope paths stay 404 with no header |
| 2026-10-21 | The app's canvas list is the bundled `doan ls --json` output, used as-is | User decision (app-shell Q1) — one listing rule; TS and Go comment folding already diverged once (POSTMORTEM) |
| 2026-10-21 | The serving scope comes from `doan ls` `result.scope`, computed by one Go function shared with `doan check` | User decision (app-shell Q2, Q7, Q10) — the server and `css_not_served` cannot disagree |
| 2026-10-21 | During development the app finds the CLI through `DOAN_CLI`, then `PATH`; tests build it with a vitest `globalSetup` | User decision (app-shell Q3, Q9) — the bundled path is #8's job; `npm --prefix app test` stays one command |
| 2026-10-21 | App build is `electron-vite`; the renderer is plain DOM until #6 picks a UI framework | User decision (app-shell Q4) — #4 and #5 have no design draft (§5 Dogfooding) |
| 2026-10-21 | `/runtime-test` drives the real app with Playwright `_electron` | User decision (app-shell Q5) — scripted launch, main-process evaluate, DOM reads and screenshots on the same Chromium; CDP would rebuild waits and selectors, `computer-use` needs a visible screen |
| 2026-10-21 | Opening a repo subfolder opens the repo root that `doan ls` reports; a subfolder of a failing repo is not stored | User decision (app-shell Q6) and conductor call (app-shell orchestration) — discovery stays in Go; storing the subfolder would lead to a nested `doan init` |
| 2026-10-21 | Electron 45.0.0 is kept | User decision (app-shell Q8) — PoC 4 launched it with Playwright `_electron.launch` |
| 2026-10-21 | Scope entries that resolve to the repo root are dropped; the server also checks `Host` | User decision (app-shell Q11) and design review — the schema only blocks a literal `.`, and the token alone does not stop DNS rebinding |
| 2026-10-21 | Folder keys in serving URLs are random per open | User decision (app-shell Q12) — no repo path leaks into URLs |
| 2026-10-21 | #4 watches comment files, only to refresh open comment counts | User decision (app-shell feature-review) |
| 2026-10-21 | `folders.json` that cannot be read starts empty, and a later write may replace it | User decision (app-shell orchestration) — only the folder list is lost, and reopening restores it |
| 2026-10-22 | Deferred from #4: an uninitialized subfolder stays "not initialized" after `doan init` in its parent (#8); closing the window quits the app (#6); "folder not found" has no recovery hint (#6) | User decision (app-shell orchestration) — rare, no data lost |

## 8. Open questions

Carried over from README draft §15. When closed, they move to the matching section and the §7 decision log. Shared fragments (include vs. whole HTML) were closed as up to the agent (2026-10-21, §4 Unit of review).

- Open source license type (MIT · Apache-2.0, etc.)
- A comment event `at` that matches the schema pattern but is not a calendar time (`2026-02-30`, `T24`, a `:60` second) can only come from a hand-edited file; if it is a file's max `at`, `doan comment resolve` on that file fails with `internal_error` (2026-10-21, cli-core user decision to defer). Options: a calendar check in the schema (TS and Go together), or a dedicated error code.
- Should onboarding step 3 pass `--token-css` as a repo-relative path, or should `doan init` accept an absolute path inside the repo? Today an absolute path is `usage_error` (2026-10-21, cli-core). Decide before #8 `onboard-dist`.

- An uninitialized subfolder opened before `doan init` ran in its parent keeps showing "not initialized" (the app reads it with `--repo <subfolder>`), and following that hint creates a nested repo. Decide with the onboarding `doan init` location in #8 `onboard-dist` (2026-10-22, app-shell).
- Closing the window quits the app, unlike the macOS convention; and a "folder not found" entry gives no hint that reopening it restores the list. Decide in #6 with the UI framework (2026-10-22, app-shell).

`doan:width` was closed as required with no default (2026-10-21).

Comment JSONL compaction was decided against for the MVP (2026-10-21). It will be decided if a case of files actually growing long comes up.
