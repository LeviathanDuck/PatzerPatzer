# Patzer Pro — Sprint Plan (Revised)

Each numbered task = one Claude session  
Each task touches 1–3 files max  
Each task must be testable in the browser before moving on  

---

## Phase 1 — Project Scaffolding
Goal: a repo that builds and serves a blank page

| # | Task | What Claude does | Test |
|---|---|---|---|
| 1.1 | Git + ignore | Create `.gitignore` for Node/pnpm/esbuild | `git status` clean |
| 1.2 | Workspace setup | Root `package.json`, `pnpm-workspace.yaml` | `pnpm install` works |
| 1.3 | TypeScript config | `tsconfig.base.json` strict, ES2021, alias `@/*` | `tsc --noEmit` passes |
| 1.4 | esbuild config | `build.mjs` compiles `src/main.ts` → `public/js/main.js` | build runs |
| 1.5 | HTML shell | `index.html` + `main.ts` logs to console | browser log visible |
| 1.6 | SCSS setup | compile `main.scss` → `main.css` | styles load |

---

## Phase 2 — App Shell + Routing
Goal: navigable app with placeholder pages

| # | Task | What Claude does | Test |
|---|---|---|---|
| 2.1 | Snabbdom render | Render `h('h1', 'Patzer Pro')` | heading visible |
| 2.2 | Router (dynamic-ready) | Hash router supporting params (`#/analysis/:id`) | route changes work |
| 2.3 | App shell layout | Header placeholder + `<main>` | layout renders |
| 2.4 | Nav links | Analysis, Puzzles, Openings, Stats | active state works |

---

## Phase 3 — Chessground Integration
Goal: working board independent of game logic

| # | Task | What Claude does | Test |
|---|---|---|---|
| 3.1 | Install Chessground | Render board at starting position | board visible |
| 3.2 | Board controls | Flip orientation button | flip works |
| 3.3 | Basic shapes | Enable arrows + highlights (minimal working version) | shapes render |
| 3.4 | Theme setup | CSS variables for board/pieces | styles apply |

---

## Phase 4 — Move Tree (Core Data Layer)
Goal: correct Lichess-style tree, no UI yet

| # | Task | What Claude does | Test |
|---|---|---|---|
| 4.1 | Tree types | `TreeNode`, `TreePath`, etc. | compiles |
| 4.2 | Basic tree ops | `nodeAtPath`, `addNode` | console test |
| 4.3 | Navigation ops | `next`, `prev`, mainline traversal | console test |
| 4.4 | PGN parse (mainline only) | Parse PGN → linear tree | log tree |
| 4.5 | PGN variations | Add variation support | variations appear |
| 4.6 | Serialization | `toJSON` / `fromJSON` | round-trip works |

---

## Phase 5 — Analysis Controller (No Engine Yet)
Goal: board + tree + navigation fully working

| # | Task | What Claude does | Test |
|---|---|---|---|
| 5.1 | Ctrl shell | `ctrl.ts` holds tree + currentPath | loads |
| 5.2 | Sample game fixture | Hardcoded PGN → tree | loads on init |
| 5.3 | Board sync | `setPath()` updates board position | board updates |
| 5.4 | Next/prev controls | Buttons for navigation | works |
| 5.5 | Move list view | Render SAN moves with highlight | list visible |
| 5.6 | Move click | Click move → update board | works |
| 5.7 | Keyboard nav | Arrow keys navigate (Lichess-style) | works |

---

## Phase 6 — Engine Integration
Goal: evaluation system working cleanly

| # | Task | What Claude does | Test |
|---|---|---|---|
| 6.1 | Stockfish worker | Setup WASM worker | loads |
| 6.2 | UCI wrapper | Send/receive messages | `uciok` received |
| 6.3 | Engine toggle | Enable/disable engine state | toggle works |
| 6.4 | Single eval | Evaluate FEN → `{cp, mate, best}` | logs result |
| 6.5 | Eval cache | Cache by FEN+depth | repeat calls cached |
| 6.6 | Batch analysis | Analyze full tree | nodes gain eval |
| 6.7 | Win% calc | Port `winningChances.ts` | returns WDL |
| 6.8 | Eval UI | Eval bar updates | visible |
| 6.9 | Best move arrow | Draw arrow from engine | visible |

---

## Phase 7 — Full Analysis Loop (No Import Yet)
Goal: prove core product works end-to-end

| # | Task | What Claude does | Test |
|---|---|---|---|
| 7.1 | Load PGN manually | Input or hardcoded PGN → tree | game loads |
| 7.2 | Auto analysis | Engine runs on load | evals populate |
| 7.3 | Navigation + eval | Move through game with evals | works |
| 7.4 | (Optional) annotations | Add labels only if matching Lichess logic exactly | labels correct |

---

## Phase 8 — Header + Game Import
Goal: bring in external games

| # | Task | What Claude does | Test |
|---|---|---|---|
| 8.1 | TopNav shell | Adapt `TopNav.jsx` to Snabbdom | header renders |
| 8.2 | Input controls | Platform toggle + username + import button | inputs work |
| 8.3 | Game library state | Minimal state module | state updates |
| 8.4 | Chess.com API | Fetch recent games | logs games |
| 8.5 | Lichess API | Same interface | logs games |
| 8.6 | Filter pills | Time/date filters | state updates |
| 8.7 | Game list panel | Show imported games | list renders |
| 8.8 | Select game | Click → load into analysis | works |
| 8.9 | Mobile nav | Hamburger menu | works |

---

## Phase 9 — Analysis Flow (Real Data)
Goal: imported games fully usable

| # | Task | What Claude does | Test |
|---|---|---|---|
| 9.1 | Route wiring | `#/analysis/:gameId` loads game | works |
| 9.2 | PGN → tree | Load selected game | board updates |
| 9.3 | Auto analysis | Engine runs | evals populate |
| 9.4 | Metadata UI | Player names, ratings, result | visible |

---

## Phase 10 — Persistence
Goal: nothing resets on refresh

| # | Task | What Claude does | Test |
|---|---|---|---|
| 10.1 | IndexedDB wrapper | typed storage module | works |
| 10.2 | Save games | persist imported games | reload works |
| 10.3 | Save trees | persist analysis trees | reload works |
| 10.4 | Load on startup | hydrate state from storage | works |

---

## Phase 11 — Puzzle Extraction
Goal: generate puzzles from analysis

| # | Task | What Claude does | Test |
|---|---|---|---|
| 11.1 | Extraction logic | scan eval swings | candidates logged |
| 11.2 | Config | threshold + filters | results change |
| 11.3 | Review UI | list puzzle candidates | renders |
| 11.4 | Save puzzle | persist to IndexedDB | appears in list |

---

## Phase 12 — Puzzle Play
Goal: interactive puzzle solving

| # | Task | What Claude does | Test |
|---|---|---|---|
| 12.1 | Puzzle board | load position | correct |
| 12.2 | Move validation | compare to solution | feedback shown |
| 12.3 | Completion UI | success + next button | works |
| 12.4 | Puzzle list | `/puzzles` route | renders |

---

## Phase 13 — Stats (Deferred)

- Accuracy per game
- Mistake/blunder tracking
- Opening breakdown

---

## Checkpoints

| After | What you can verify |
|---|---|
| 2.4 | App navigation works |
| 3.4 | Interactive board works |
| 5.7 | Full game navigation works |
| 6.9 | Engine fully integrated |
| 7.3 | Core product loop works |
| 9.4 | Real games fully usable |
| 10.4 | Persistence works |
| 12.3 | Puzzle loop complete |