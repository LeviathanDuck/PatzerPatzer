---
paths:
  - "src/**/*.ts"
---

# Lichess Reference Source

Local path: `~/Development/lichess-source/lila`

Claude should use this for:
- analysis board behavior
- move tree and variation logic
- engine controls and UX
- puzzle extraction logic
- learn-from-mistakes / retrospection logic
- board interactions
- keyboard navigation
- UI state transitions
- contextual board UI (analysis vs puzzle vs play)

Claude must:
- study how Lichess implements a feature
- determine what can be reused directly
- adapt only what is necessary

## Key Source Paths (Lichess)

| Feature | Path within `lila/` |
|---|---|
| Move tree types & ops | `ui/lib/src/tree/` |
| Engine / ceval controller | `ui/lib/src/ceval/` |
| Stockfish Web Worker engine | `ui/lib/src/ceval/engines/stockfishWebEngine.ts` |
| UCI protocol | `ui/lib/src/ceval/protocol.ts` |
| Win/loss/draw calculation | `ui/lib/src/ceval/winningChances.ts` |
| Chessground game wrapper | `ui/lib/src/game/ground.ts` |
| Analysis board controller | `ui/analyse/src/ctrl.ts` |
| Analysis board view | `ui/analyse/src/view/` |
| Arrow / highlight drawing | `ui/analyse/src/autoShape.ts` |
| Keyboard navigation | `ui/analyse/src/keyboard.ts` |
| IndexedDB tree cache | `ui/analyse/src/idbTree.ts` |
| Puzzle controller | `ui/puzzle/src/ctrl.ts` |
| Puzzle move tree | `ui/puzzle/src/moveTree.ts` |
| PGN import (backend) | `modules/tree/src/main/ParseImport.scala` |
| Tree builder (backend) | `modules/tree/src/main/TreeBuilder.scala` |
| Analysis backend | `modules/analyse/` |
| Puzzle backend | `modules/puzzle/` |
| Game import backend | `modules/game/` |

## Reuse Priority

1. `@lichess-org/chessground` — board UI
2. `@lichess-org/pgn-viewer` — PGN display
3. Analysis board UI patterns (from `ui/analyse/`)
4. Move tree implementation (from `ui/lib/src/tree/`)
5. Engine/ceval patterns (from `ui/lib/src/ceval/`)
6. Puzzle logic (from `ui/puzzle/`)
7. Layout/styling

## Adaptation Rule

If Lichess code is tightly coupled:

1. Extract smallest useful behavior
2. Recreate it in this project's stack
3. Preserve user-facing behavior
4. Avoid copying unrelated infrastructure (MongoDB, Redis, Fishnet, etc.)
