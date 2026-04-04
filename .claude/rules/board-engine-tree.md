---
paths:
  - "src/board/**"
  - "src/engine/**"
  - "src/tree/**"
  - "src/ceval/**"
  - "src/analyse/**"
  - "src/puzzles/**"
  - "src/openings/**"
  - "src/study/practice/**"
---

# Board Implementation Direction

The chessboard should behave like Lichess.

Use:
- Chessground for rendering and interaction
- Lichess source as behavioral reference

Required features:
- arrow drawing
- square highlighting
- drag + click move input
- board flipping
- keyboard navigation
- move list synchronization
- engine evaluation bar
- engine toggle
- hints
- player metadata
- board-perimeter controls
- theme/piece customization

Behavior must match Lichess analysis board UX.

Reference: `ui/analyse/src/autoShape.ts`, `ui/analyse/src/keyboard.ts`

# Engine Architecture

Follow Lichess approach exactly:

- Use Stockfish WASM
- Run engine in a **Web Worker** — never on the main thread
- Communicate via UCI protocol
- Do NOT block UI during analysis

Reference implementation: `ui/lib/src/ceval/engines/stockfishWebEngine.ts`

Support:
- evaluation per move (centipawns + mate)
- best move suggestions
- win/draw/loss percentages (`winningChances.ts`)
- configurable depth / time

# Move Tree / Variations

Must match Lichess behavior exactly. Reference: `ui/lib/src/tree/`

Core types to match:
```typescript
type TreePath = string; // immutable path notation

type TreeNode = {
  id: string;
  ply: number;
  move: { san: string; uci: string };
  fen: string;
  eval?: { cp?: number; mate?: number; best?: string };
  glyphs: Glyph[];
  children: TreeNode[];
  comments: TreeComment[];
  clock?: Clock;
};
```

Required operations (match `ui/lib/src/tree/tree.ts` TreeWrapper interface):
- full move tree with children (not a flat list)
- side variations
- promotion to mainline
- navigation across branches
- keyboard navigation
- delete node at path
- add node / add nodes at path

Do NOT simplify this into a flat move list.

# Puzzle Generation Logic

Puzzle extraction should be derived from Lichess concepts.

Reference:
- `docs/reference/lichess-puzzle-reference.md`
- `modules/puzzle/` in Lichess source

Future configurable parameters:
- evaluation swing threshold
- minimum depth
- game phase filters
- time spent filters
