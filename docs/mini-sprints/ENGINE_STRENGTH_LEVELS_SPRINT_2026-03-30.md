# Sprint: Play Against Computer at Various Strength Levels

Date: 2026-03-30
Status: planned, not yet started

## Context

The Opponents page has a "Practice Against Them" mode that hands off to the engine when imported repertoire confidence is exhausted. Currently, the engine handoff is **stubbed** — the banner shows "Engine has taken over" but no move is played (`src/openings/view.ts:2320-2325`). When this gets wired, the engine will play at full strength (depth 30, uncapped), which isn't useful for practice.

This sprint builds shared infrastructure so any practice surface can request the engine play a single move at a user-selected strength level. The primary consumer is Practice Against Them; future consumers include ORP drill flow and Study Library practice.

## Key Design Decisions

1. **UCI_LimitStrength + UCI_Elo** as primary mechanism (Stockfish 18 WASM supports it natively), supplemented by depth capping at lowest levels
2. **Single engine instance** — reuse existing protocol, send `setoption` to switch between analysis and play modes (avoids doubling ~96MB WASM memory)
3. **New `requestPlayMove()` API** — separate from `evalCurrentPosition()` which is deeply entangled with eval caching, multi-PV, arrows, threat mode, and batch guards
4. **8 discrete levels** matching Lichess convention (not a raw Elo slider)
5. **Mode guard in parseEngineLine** — when `engineMode === 'play'`, bestmove routes to a play callback instead of updating currentEval/evalCache

## Strength Level Mapping

| Level | Label | UCI_Elo | Max Depth | Description |
|---|---|---|---|---|
| 1 | Beginner | 1320 | 1 | Frequent blunders |
| 2 | Casual | 1500 | 3 | Weak tactics |
| 3 | Club Novice | 1650 | 5 | Basic tactics |
| 4 | Club Player | 1800 | 8 | Solid tactics |
| 5 | Tournament | 2000 | 12 | Strong tactics |
| 6 | Expert | 2200 | 16 | Few mistakes |
| 7 | Master | 2500 | 22 | Near-optimal |
| 8 | Full Strength | uncapped | 30 | UCI_LimitStrength off |

---

### Sprint Manager: CCP-564

## Phase 1 — Strength Types and UCI Integration

**Goal:** Define strength config types, add play-mode UCI option methods to the protocol layer.

| CCP | Prompt | Type | What | Files |
|---|---|---|---|---|
| CCP-565 | Manager | manager | Execute Phase 1 children | — |
| CCP-566 | 1.1 | research | Audit SF18 WASM UCI options for strength limiting; read Lichess rateBot.ts | — |
| CCP-567 | 1.2 | feature | Define `EngineMode`, `EngineStrengthConfig`, `STRENGTH_LEVELS[1-8]` | `src/engine/types.ts` (new) |
| CCP-568 | 1.3 | feature | Add `setPlayStrength(config)`, `setAnalysisMode()`, `goPlay(depth)` to StockfishProtocol | `src/ceval/protocol.ts` |
| CCP-569 | 1.4 | feature | Build + typecheck validation | — |

## Phase 2 — Engine Mode Switching

**Goal:** Add analysis/play mode awareness to ctrl.ts so the two modes don't interfere.

| CCP | Prompt | Type | What | Files |
|---|---|---|---|---|
| CCP-571 | Manager | manager | Execute Phase 2 children | — |
| CCP-572 | 2.1 | research | Trace engine lifecycle in ctrl.ts, identify safe mode-switch injection points | — |
| CCP-573 | 2.2 | feature | Add `engineMode`, `playStrengthConfig`, `enterPlayMode()`, `exitPlayMode()` to ctrl.ts; guard `evalCurrentPosition()` and `evalThreatPosition()` | `src/engine/ctrl.ts` |
| CCP-574 | 2.3 | feature | Persist last-used strength level in localStorage (`patzer.playStrengthLevel`) | `src/engine/ctrl.ts` |
| CCP-575 | 2.4 | feature | Build + typecheck + manual console validation | — |

## Phase 3 — Play Move Service

**Goal:** Shared `requestPlayMove(fen, strength, callback)` function any consumer can call.

| CCP | Prompt | Type | What | Files |
|---|---|---|---|---|
| CCP-577 | Manager | manager | Execute Phase 3 children | — |
| CCP-578 | 3.1 | research | Design bestmove routing for play mode — callback slot in ctrl.ts vs dedicated listener | — |
| CCP-579 | 3.2 | feature | Implement `requestPlayMove()` and `cancelPlayMove()` with one-shot bestmove callback routing | `src/engine/playMove.ts` (new), `src/engine/ctrl.ts` |
| CCP-580 | 3.3 | feature | Add `playMoveWithDelay()` — variable delay scaled by strength level + random jitter | `src/engine/playMove.ts` |
| CCP-581 | 3.4 | feature | Build + typecheck + console integration test (call from devtools, verify move returned) | — |

## Phase 4 — Practice Against Them Integration

**Goal:** Wire the play-move service into the existing Practice Against Them flow.

| CCP | Prompt | Type | What | Files |
|---|---|---|---|---|
| CCP-582 | Manager | manager | Execute Phase 4 children | — |
| CCP-583 | 4.1 | feature | Add `strengthLevel` to PracticeSession type; accept in `startPractice()` | `src/openings/types.ts`, `src/openings/ctrl.ts` |
| CCP-584 | 4.2 | feature | Wire `requestPlayMove` into `schedulePracticeOpponentResponse` at the `'request-engine'` branch (view.ts:2320); call `exitPlayMode()` on practice stop | `src/openings/view.ts`, `src/openings/ctrl.ts` |
| CCP-585 | 4.3 | feature | Update practice banner to show strength level label when source is 'engine' | `src/openings/view.ts` |
| CCP-586 | 4.4 | feature | End-to-end validation: practice until repertoire exhausts, verify engine plays at reduced strength, verify analysis resumes after stop | — |

## Phase 5 — Strength Selector UI

**Goal:** Reusable strength selector component embeddable in any practice surface.

| CCP | Prompt | Type | What | Files |
|---|---|---|---|---|
| CCP-587 | Manager | manager | Execute Phase 5 children | — |
| CCP-588 | 5.1 | research | Audit Lichess AI level selector UI pattern — see [`docs/reference/LICHESS_AI_LEVEL_SELECTOR_AUDIT.md`](../reference/LICHESS_AI_LEVEL_SELECTOR_AUDIT.md) | — |
| CCP-589 | 5.2 | feature | Create `renderStrengthSelector(level, onChange)` Snabbdom view function | `src/engine/strengthView.ts` (new) |
| CCP-590 | 5.3 | feature | Embed selector in practice setup panel (view.ts `renderPracticeSetupPanel`) | `src/openings/view.ts` |
| CCP-591 | 5.4 | feature | Add `.strength-selector` styles, responsive for mobile | `src/styles/main.scss` |
| CCP-592 | 5.5 | feature | Visual + functional validation across viewports | — |

---

## New Files

| File | Purpose |
|---|---|
| `src/engine/types.ts` | EngineMode, EngineStrengthConfig, STRENGTH_LEVELS presets |
| `src/engine/playMove.ts` | requestPlayMove(), cancelPlayMove(), playMoveWithDelay() |
| `src/engine/strengthView.ts` | renderStrengthSelector() Snabbdom component |

## Modified Files

| File | Changes |
|---|---|
| `src/ceval/protocol.ts` | setPlayStrength(), setAnalysisMode(), goPlay() methods |
| `src/engine/ctrl.ts` | engineMode state, enterPlayMode(), exitPlayMode(), play-mode bestmove routing |
| `src/openings/types.ts` | strengthLevel on PracticeSession |
| `src/openings/ctrl.ts` | Pass strength to startPractice(), exitPlayMode() on session close |
| `src/openings/view.ts` | Wire requestPlayMove in engine branch, embed strength selector, update banner |
| `src/styles/main.scss` | Strength selector styling |

## Verification

- **Phase 1-2:** `npm run build && npx tsc --noEmit` pass; analysis mode unaffected
- **Phase 3:** Call `requestPlayMove()` from dev console at Level 1 and Level 8 — verify different move quality
- **Phase 4:** Start Practice Against Them, play until repertoire exhausts, verify engine responds at selected strength; stop practice, verify analysis eval resumes
- **Phase 5:** Verify selector renders in practice setup, level persists across reloads, works on mobile

## Prompt Count

CCP-564 through CCP-592 (27 prompts + 1 overall sprint manager)

- 1 sprint manager (CCP-564)
- 5 phase managers (CCP-565, CCP-571, CCP-577, CCP-582, CCP-587)
- 4 research prompts (CCP-566, CCP-572, CCP-578, CCP-588)
- 13 feature prompts
- 5 validation prompts (CCP-569, CCP-575, CCP-581, CCP-586, CCP-592)
