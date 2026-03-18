# Patzer Pro — Sprint Plan (Revised v2)

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
| 1.3 | TypeScript config | `tsconfig.base.json` strict | `tsc --noEmit` passes |
| 1.4 | esbuild config | compile `src/main.ts` → `public/js/main.js` | build runs |
| 1.5 | HTML shell | `index.html` + console log | visible |
| 1.6 | SCSS setup | compile styles | styles load |

---

## Phase 2 — App Shell + Routing

| # | Task | What Claude does | Test |
|---|---|---|---|
| 2.1 | Snabbdom render | basic render | visible |
| 2.2 | Router | hash router | works |
| 2.3 | Layout | header + main | renders |
| 2.4 | Nav | links + active state | works |

---

## Phase 3 — Chessground

| # | Task | What Claude does | Test |
|---|---|---|---|
| 3.1 | Board | render chessboard | visible |
| 3.2 | Flip | orientation toggle | works |
| 3.3 | Shapes | arrows/highlights | works |
| 3.4 | Theme | CSS variables | applied |

---

## Phase 4 — Move Tree

| # | Task | What Claude does | Test |
|---|---|---|---|
| 4.1 | Types | TreeNode etc | compiles |
| 4.2 | Ops | add/get nodes | works |
| 4.3 | Navigation | next/prev | works |
| 4.4 | PGN parse | mainline | logs |
| 4.5 | Variations | support branches | works |
| 4.6 | Serialize | save/load | works |

---

## Phase 5 — Analysis Controller

| # | Task | What Claude does | Test |
|---|---|---|---|
| 5.1 | Ctrl | holds state | loads |
| 5.2 | Sample game | PGN fixture | loads |
| 5.3 | Sync board | path → board | works |
| 5.4 | Controls | next/prev | works |
| 5.5 | Move list | render SAN | visible |
| 5.6 | Click moves | jump position | works |
| 5.7 | Keyboard | arrow nav | works |

---

## Phase 6 — Engine Integration

| # | Task | What Claude does | Test |
|---|---|---|---|
| 6.1 | Worker | load Stockfish | loads |
| 6.2 | UCI | protocol | uciok |
| 6.3 | Toggle | engine on/off | works |
| 6.4 | Eval | single position | logs |
| 6.5 | Cache | store evals | works |
| 6.6 | Batch | full game analysis | works |
| 6.7 | Win% | convert cp | works |
| 6.8 | Eval UI | bar | visible |
| 6.9 | Arrow | best move | visible |

---

## Phase 7 — Core Loop

| # | Task | What Claude does | Test |
|---|---|---|---|
| 7.1 | Load PGN | game loads | works |
| 7.2 | Auto eval | engine runs | works |
| 7.3 | Navigation | eval persists | works |

---

## Phase 8 — Game Import

| # | Task | What Claude does | Test |
|---|---|---|---|
| 8.1 | Header | UI shell | visible |
| 8.2 | Inputs | username + import | works |
| 8.3 | State | game list | works |
| 8.4 | Chess.com | fetch games | works |
| 8.5 | Lichess | fetch games | works |
| 8.6 | Filters | speed/rated | works |
| 8.7 | List | show games | visible |
| 8.8 | Select | load game | works |

---

## Phase 9 — Real Analysis

| # | Task | What Claude does | Test |
|---|---|---|---|
| 9.1 | Routing | load by id | works |
| 9.2 | PGN → tree | load game | works |
| 9.3 | Auto eval | run engine | works |
| 9.4 | Metadata | show players | visible |

---

## Phase 10 — Persistence

| # | Task | What Claude does | Test |
|---|---|---|---|
| 10.1 | DB | IndexedDB | works |
| 10.2 | Save games | persist | reload works |
| 10.3 | Save analysis | persist tree | works |
| 10.4 | Restore | load on start | works |
| 10.5 | Filters persist | optional | works |

---

## Phase 11 — Analysis System (Lichess Parity)

| # | Task | What Claude does | Test |
|---|---|---|---|
| 11.1 | Analyze all | batch analysis | works |
| 11.2 | Candidate debug | show candidates | visible |
| 11.3 | Controls | depth + reanalyze + progress | works |
| 11.4 | Cache stability | consistent eval storage | stable |
| 11.5 | Move labels | refine classification | correct |
| 11.6 | Eval graph | render graph | visible |
| 11.7 | Sync graph | graph ↔ board | works |
| 11.8 | Engine UI | eval + best move | visible |
| 11.9 | Summary | mistakes + accuracy | visible |

---

## Phase 12 — Puzzle System

| # | Task | What Claude does | Test |
|---|---|---|---|
| 12.1 | Refine extraction | better filtering | improved |
| 12.2 | Save puzzles | persist | reload works |
| 12.3 | Puzzle board | load puzzle | correct |
| 12.4 | Validation | check moves | works |
| 12.5 | Completion | success UI | works |
| 12.6 | Puzzle list | route | visible |

---

## Checkpoints

| After | Verify |
|---|---|
| 3 | Board works |
| 5 | Game navigation works |
| 6 | Engine works |
| 9 | Real games work |
| 10 | Persistence works |
| 11 | Full analysis parity |
| 12 | Puzzle system works |
