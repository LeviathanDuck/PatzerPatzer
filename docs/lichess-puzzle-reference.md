# Lichess Puzzle & Game Analysis Reference

How lichess/lila handles Stockfish game analysis and the "Learn from Your Mistakes" feature. Use this as a blueprint for your own tool.

---

## Architecture Overview

```
Game ends
    ↓
User requests analysis (manual trigger)
    ↓
Fishnet queues analysis job (Stockfish distributed network)
    ↓
Stockfish evaluates every position → returns evals (cp/mate)
    ↓
Analysis stored in MongoDB (analysis2 collection)
    ↓
AnalysisReady event published
    ↓
Each node annotated with eval, advice, glyphs (blunder/mistake/inaccuracy)
    ↓
Client loads game tree with evals
    ↓
"Learn from Mistakes" mode → finds eval swings → presents interactively
```

Puzzle creation is **separate** from game analysis — puzzles are curated externally and served from their own database. The "learn" feature works entirely from the analyzed game tree.

---

## Part 1: Stockfish Integration (Fishnet)

### Analysis Request

**Source:** `modules/fishnet/src/main/Analyser.scala:34-77`

When a user requests analysis, a `Work.Analysis` object is created:

```scala
case class Analysis(
  id: WorkId,
  sender: Work.Sender,
  game: Work.Game,
  startPly: Ply,
  origin: Work.Origin,
  createdAt: Instant
)
```

**Analysis origins and node budgets** (`modules/fishnet/src/main/Work.scala:70-76`):
```scala
enum Origin:
  case officialBroadcast  // 5,000,000 nodes/move
  case manualRequest      // 1,000,000 nodes/move  (user clicking "Request Analysis")
  case autoHunter         //   300,000 nodes/move
  case autoTutor          //   100,000 nodes/move
```

**Key constraint:** Games must be "analysable" — rated games, no AI opponents, normal game rules.

### Fishnet Client Protocol (JSON API)

Clients (Stockfish instances) poll for work and submit results via JSON.

**Acquire work:**
```json
POST /fishnet/acquire
{ "fishnet": { "apikey": "..." }, "stockfish": { "name": "...", "version": "..." } }
```

**Submit analysis result:**
```json
POST /fishnet/analysis/{workId}
{
  "fishnet": { "apikey": "..." },
  "analysis": [
    {
      "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      "depth": 24,
      "score": { "cp": 30 },
      "pv": "e7e5 g1f3 b8c6 f1b5",
      "time": 1500,
      "nodes": 1000000
    },
    // one entry per position in the game
    ...
  ]
}
```

Each position in the game gets: FEN, depth reached, score (cp or mate), best line (pv), time used, nodes searched.

### Analysis Building

**Source:** `modules/fishnet/src/main/AnalysisBuilder.scala:12-96`

The builder merges Stockfish results into a tree:

```
For each position (ply):
  - Take Stockfish eval (cp or mate)
  - Take best variation (pv moves)
  - Convert UCI moves to SAN notation
  - Build Info node: { ply, eval: { cp|mate }, variation: [moves] }
  - Merge with any cached evals from prior analysis of same position
```

Key types:
```scala
case class Info(
  ply: Ply,
  eval: Eval,           // { cp: Option[Cp], mate: Option[Mate] }
  variation: List[San]  // best line from this position
)
```

### Analysis Storage

Stored in MongoDB `analysis2` collection. After saving, a bus event fires:
```scala
Bus.publish(AnalysisReady(game, analysis))
```
Other modules (Insight, etc.) subscribe to this event to update stats.

---

## Part 2: Move Classification (Blunder/Mistake/Inaccuracy)

**Source:** `modules/tree/src/main/Advice.scala`

### Win Percent Conversion

Raw centipawn values are converted to win probability using a sigmoid curve. This makes the classification meaningful regardless of position type (winning, losing, equal).

```
winningChances(cp) ≈ 1 / (1 + e^(-0.004 * cp))  (logistic function)
```

This is handled by `chess.eval.WinPercent.winningChances(cp)`.

### Centipawn-Based Classification

```scala
// winningChanceJudgements in CpAdvice
List(
  0.3 -> Blunder,     // lost ≥30% winning chances
  0.2 -> Mistake,     // lost ≥20% winning chances
  0.1 -> Inaccuracy   // lost ≥10% winning chances
)

// delta = how much winning chance the player LOST with this move
// (sign-adjusted so positive = bad for the player who moved)
delta = (currentWinningChances - prevWinningChances) negated for color
judgement = first threshold where delta >= threshold
```

### Mate-Based Classification

```scala
// MateAdvice cases:
MateCreated (opponent now has forced mate):
  - prevCp < -999 → Inaccuracy
  - prevCp < -700 → Mistake
  - otherwise     → Blunder

MateLost (player had forced mate but lost it):
  - newCp > 999  → Inaccuracy
  - newCp > 700  → Mistake
  - otherwise    → Blunder
```

### Annotation (Glyphs)

After classification, moves get PGN glyphs:
- `!?` — Inaccuracy
- `?` — Mistake
- `??` — Blunder

The best alternative move is stored as the "comp" (computer) child node of the move before the mistake, with the variation line.

---

## Part 3: "Learn from Your Mistakes" Algorithm

**Source:** `ui/analyse/src/retrospect/retroCtrl.ts` and `ui/analyse/src/nodeFinder.ts`

This is a **client-side feature** that works entirely from the already-analyzed game tree. No server calls are needed beyond loading the analysis.

### Step 1: Finding Candidate Mistakes

**`evalSwings` function** (`ui/analyse/src/nodeFinder.ts:19-30`):

```typescript
export const evalSwings = (
  mainline: TreeNode[],
  nodeFilter: (node: TreeNode) => boolean
): TreeNode[] =>
  mainline.slice(1).filter((curr, i) => {
    const prev = mainline[i];
    return (
      nodeFilter(curr) &&          // only this player's moves
      curr.eval &&                 // must have eval
      prev.eval &&                 // previous position must have eval
      hasCompChild(prev) &&        // must have a computer alternative move
      (
        Math.abs(winningChances.povDiff('white', prev.eval, curr.eval)) > 0.1 ||
        (prev.eval.mate && !curr.eval.mate && Math.abs(prev.eval.mate) <= 3)  // missed short mate
      )
    );
  });
```

**Key logic:**
- Only consider moves by the target color (`ply % 2 === colorModulo`)
- A node is a candidate if the eval dropped by >10% winning chances (same threshold as Inaccuracy)
- OR if a forced mate in ≤3 was available but not played
- The previous node must have a "comp" child — the computer's suggestion

### Step 2: Presenting the Puzzle

For each candidate mistake:

```typescript
interface Retrospection {
  fault: NodeWithPath;    // the bad move the player played
  prev: NodeWithPath;     // the position BEFORE the bad move (puzzle start)
  solution: NodeWithPath; // the computer's best move (comp child of prev)
  openingUcis: Uci[];    // opening book moves (if in opening)
}
```

The UI jumps to `prev` (the position before the mistake). The player must find the correct move.

**Opening explorer check:** If the game position is in the opening (before `game.division.middle` ply), the system fetches master opening data. If the mistake was actually a common opening move (played by masters), it's cancelled — not counted as a real mistake.

```typescript
// Skip if the "mistake" was a mainline opening move
if (ucis.includes(fault.node.uci)) {
  explorerCancelPlies.push(fault.node.ply);
  setTimeout(jumpToNext, 100);
}
```

### Step 3: Evaluating the Player's Answer

```typescript
// When player plays a move at the fault position:
if (cur.openingUcis.includes(node.uci) || node.san?.endsWith('#') || node.comp)
  onWin()   // played an opening move, gave checkmate, or played comp's suggestion
else if (node.eval)
  onFail()  // played a known bad move (same bad move from game)
else {
  // Unknown move — run local Stockfish (ceval) to evaluate
  feedback('eval');
  // Wait for ceval depth ≥ 18, or depth ≥ 14 after 6 seconds
  // If povDiff > -0.04 (not significantly worse) → Win
  // Otherwise → Fail
}
```

**Win condition threshold:** `povDiff > -0.04` — the player's move must not lose more than 4% winning chances compared to the engine's suggestion.

### State Machine

```
'find'     → waiting for player to make a move
'eval'     → running local engine to evaluate an unknown move
'win'      → player found a good move
'fail'     → player played a bad move
'view'     → player clicked "View Solution"
'offTrack' → player navigated away from the puzzle position
```

### Completion Tracking

```typescript
completion: () => [solvedPlies.length, candidateNodes.length]
// Shows "3 / 7" style progress
```

Solved plies are tracked in memory (not persisted). Reset resets `solvedPlies = []`.

---

## Part 4: Game Tree Data Structure

Understanding the tree structure is essential for implementing any of this.

### TreeNode

```typescript
interface TreeNode {
  id: string;           // move id (encoded from UCI)
  ply: Ply;             // full-game ply number (1-indexed, white's first move = 1)
  uci: string;          // UCI move string e.g. "e2e4"
  san: string;          // SAN notation e.g. "e4"
  fen: string;          // FEN after this move
  children: TreeNode[]; // variations; children[0] is mainline
  comp?: boolean;       // true if this is the engine's suggestion (not played)
  eval?: {
    cp?: number;        // centipawn eval (positive = good for side to move)
    mate?: number;      // mate in N (positive = side to move wins)
    best?: string;      // best move UCI
  };
  ceval?: {             // local engine eval (browser stockfish)
    depth: number;
    cp?: number;
    mate?: number;
    millis?: number;    // time spent
  };
  glyphs?: { symbol: string; name: string; id: number }[];
}
```

The mainline is `node.children[0]` recursively. Variations are `node.children[1+]`. Computer suggestion nodes are children with `comp: true`.

### Analysis Info (Server-Side Scala)

```scala
case class Info(
  ply: Ply,
  eval: Eval,           // { cp: Cp | mate: Mate }
  variation: List[San]  // best line (up to ~5 moves)
)
```

The server merges Info nodes onto the game tree and returns the full annotated tree as JSON.

---

## Part 5: Building Your Own Tool

### Minimum Requirements

1. **Stockfish binary** — local or via `stockfish` npm package
2. **Chess library** — for FEN parsing, move generation, UCI↔SAN conversion
3. **PGN parser** — to load games

### Recommended Libraries

| Purpose | Library |
|---------|---------|
| Chess logic (JS/TS) | `chess.js` |
| Chess logic (Python) | `python-chess` |
| Stockfish (Node) | `stockfish.js` or spawn local binary |
| Stockfish (Python) | `chess.engine` (part of python-chess) |
| PGN parsing | `chess.js` or `python-chess` |

### Core Pipeline

```python
import chess
import chess.engine
import chess.pgn

def analyze_game(pgn_string: str, engine_path: str = "stockfish") -> list[dict]:
    """Returns list of positions with evaluations."""

    game = chess.pgn.read_game(io.StringIO(pgn_string))
    board = game.board()

    with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
        positions = []

        for move in game.mainline_moves():
            # Eval BEFORE the move
            info = engine.analyse(board, chess.engine.Limit(nodes=1_000_000))

            positions.append({
                'fen': board.fen(),
                'move': board.san(move),
                'uci': move.uci(),
                'eval_before': extract_eval(info),
                'best_move': info.get('pv', [None])[0],
                'best_line': [m.uci() for m in info.get('pv', [])[:5]],
            })

            board.push(move)

        return positions

def extract_eval(info: dict) -> dict:
    score = info['score'].white()
    if score.is_mate():
        return {'mate': score.mate()}
    else:
        return {'cp': score.score()}
```

### Win Probability (same formula as lichess)

```python
import math

def win_percent(cp: float) -> float:
    """Convert centipawns to win probability [0,1] from white's perspective."""
    return 1 / (1 + math.exp(-0.00368208 * cp))

def classify_move(cp_before: float, cp_after: float, color: str) -> str | None:
    """
    cp_before: eval before the move (from white's POV)
    cp_after:  eval after the move (from white's POV)
    color: 'white' or 'black' — the player who just moved
    """
    wp_before = win_percent(cp_before)
    wp_after  = win_percent(cp_after)

    # From the moving player's perspective, positive delta is good
    if color == 'white':
        delta = wp_before - wp_after   # how much white lost
    else:
        delta = wp_after - wp_before   # how much black lost (wp_after lower = better for black)

    if delta >= 0.3:
        return 'blunder'
    elif delta >= 0.2:
        return 'mistake'
    elif delta >= 0.1:
        return 'inaccuracy'
    return None
```

### Finding "Learn from Mistakes" Candidates

```python
def find_mistakes(positions: list[dict], color: str) -> list[dict]:
    """
    Returns positions where the player made a significant mistake.
    Each returned item includes: position before the mistake, the bad move, best move.
    """
    mistakes = []
    color_ply_offset = 0 if color == 'white' else 1  # white moves on odd plies

    for i in range(1, len(positions)):
        curr = positions[i]
        prev = positions[i - 1]

        # Only check this player's moves
        if i % 2 != color_ply_offset:
            continue

        eval_before = prev.get('eval_before', {})
        eval_after = curr.get('eval_before', {})  # eval before curr's move = after prev's move

        cp_before = eval_before.get('cp')
        cp_after  = eval_after.get('cp')

        if cp_before is None or cp_after is None:
            continue  # skip mate sequences for simplicity (handle separately)

        classification = classify_move(cp_before, cp_after, color)
        if classification in ('blunder', 'mistake'):
            mistakes.append({
                'ply': i,
                'fen_before': prev['fen'],       # position to show the puzzle from
                'bad_move': curr['move'],        # the move played (SAN)
                'bad_move_uci': curr['uci'],
                'best_move': prev['best_move'],  # engine's suggestion (UCI)
                'best_line': prev['best_line'],  # full best variation
                'classification': classification,
                'eval_before': cp_before,
                'eval_after': cp_after,
            })

    return mistakes
```

### Interactive "Learn" Loop

```python
def learn_from_mistakes(pgn: str, color: str = 'white'):
    positions = analyze_game(pgn)
    mistakes = find_mistakes(positions, color)

    print(f"Found {len(mistakes)} mistakes/blunders to review.\n")

    for i, m in enumerate(mistakes, 1):
        print(f"\n--- Mistake {i}/{len(mistakes)} ({m['classification']}) ---")
        print(f"Position: {m['fen_before']}")
        print(f"You played: {m['bad_move']}")
        print(f"Best was:   {m['best_move']}")
        print(f"Best line:  {' '.join(m['best_line'])}")

        # Render board, prompt user to find the move...
        # Check if user's move matches best move or is within threshold
```

---

## Part 6: Puzzle Data Model (if you want to save/replay puzzles)

Lichess puzzle structure (`modules/puzzle/src/main/Puzzle.scala`):

```scala
case class Puzzle(
  id: PuzzleId,
  gameId: GameId,         // source game
  fen: String,            // starting position FEN
  line: NonEmptyList[Uci], // solution moves in UCI (first move is forced, rest are player)
  glicko: Glicko,         // difficulty rating
  plays: Int,
  vote: Float,            // -1 to +1
  themes: Set[PuzzleTheme.Key]
)
```

For your own tool, a simpler model:

```python
@dataclass
class Puzzle:
    id: str
    source_game_id: str
    source_ply: int         # ply where puzzle starts
    fen: str                # FEN of starting position
    player_color: str       # 'white' or 'black'
    solution_moves: list[str]  # UCI moves: [best_move, opponent_reply, best_move2, ...]
    classification: str     # 'blunder', 'mistake'
    cp_loss: float          # centipawn swing that triggered this puzzle
    themes: list[str]       # e.g. ['endgame', 'mateIn2']
```

### MongoDB Schema (if you use it)

```javascript
// puzzle collection
{
  _id: "abc123",
  gameId: "xyz789",
  fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  line: "f3g5 d8e7 g5f7",   // space-separated UCI moves
  glicko: { r: 1500.0, d: 500.0, v: 0.09 },
  plays: 0,
  vote: 0.0,
  themes: ["middlegame", "fork"]
}
```

---

## Part 7: Key Thresholds & Numbers

| Parameter | Value | Source |
|-----------|-------|--------|
| Inaccuracy threshold | ≥10% win chance lost | `Advice.scala:48` |
| Mistake threshold | ≥20% win chance lost | `Advice.scala:47` |
| Blunder threshold | ≥30% win chance lost | `Advice.scala:46` |
| "Learn" eval swing threshold | >10% (same as Inaccuracy) | `nodeFinder.ts:27` |
| Local engine accept threshold | povDiff > -0.04 | `retroCtrl.ts:163` |
| Manual analysis node budget | 1,000,000 nodes/move | `Work.scala` |
| Official broadcast node budget | 5,000,000 nodes/move | `Work.scala` |
| Auto-analysis node budget | 100,000–300,000 nodes/move | `Work.scala` |
| Ceval "ready" depth | ≥18, or ≥14 after 6s | `retroCtrl.ts:154` |
| Missed short mate threshold | mate ≤ 3 | `nodeFinder.ts:28` |
| Win chance logistic coefficient | -0.00368208 | lichess ceval lib |

---

## Part 8: File Map

```
modules/fishnet/src/main/
  Analyser.scala          — queues analysis jobs, checks if game is analysable
  AnalysisBuilder.scala   — builds Analysis from Stockfish results
  FishnetApi.scala        — acquire/submit work API
  Work.scala              — data types (Analysis, Origin, node budgets)
  JsonApi.scala           — JSON protocol for fishnet clients

modules/tree/src/main/
  Advice.scala            — Blunder/Mistake/Inaccuracy classification
  Info.scala              — per-position eval data structure

modules/analyse/src/main/
  Analyser.scala          — saves analysis, publishes AnalysisReady event

modules/puzzle/src/main/
  Puzzle.scala            — puzzle data model
  PuzzleFinisher.scala    — Glicko rating update when puzzle solved
  PuzzleSelector.scala    — picks next puzzle for user
  PuzzleOpening.scala     — links openings to relevant puzzles

ui/analyse/src/
  nodeFinder.ts           — evalSwings() — finds candidate mistake nodes
  retrospect/retroCtrl.ts — "Learn from mistakes" state machine
  retrospect/retroView.ts — UI rendering
  view/actionMenu.ts      — "Learn from your mistakes" button trigger
  view/roundTraining.ts   — puzzle link and training buttons
```

---

## Quick Start Checklist

- [ ] Parse PGN into move list + FEN at each ply
- [ ] Run Stockfish at each position (1M nodes or depth 18-20 is plenty)
- [ ] Store `{ fen, move_played, eval_cp, best_move_uci, best_line }` per ply
- [ ] Apply win% sigmoid to convert cp → probability
- [ ] Flag positions where player's move loses ≥20% win chance as mistakes
- [ ] For each mistake: store `{ fen_before, best_move, best_line }` as a puzzle
- [ ] Build interactive loop: show position → player inputs move → compare to engine
- [ ] Accept player move if it's within 4% win chance of the engine's best
