// Move tree types — adapted from lichess-org/lila: ui/lib/src/tree/types.ts

export type TreePath = string;
export type TreeNodeId = string;

export type Ply = number;
export type Uci = string; // UCI move notation e.g. "e2e4"
export type San = string; // SAN move notation e.g. "e4"
export type Fen = string; // FEN string e.g. "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"

// Centipawn or mate evaluation score
export interface EvalScore {
  cp?: number;   // centipawns, from white's perspective
  mate?: number; // moves to mate, positive = white wins
}

// Server-computed evaluation (from Stockfish batch analysis)
export interface ServerEval extends EvalScore {
  best?: Uci;
  fen: Fen;
  depth: number;
  knodes: number;
  pvs: PvData[];
}

// Client-computed evaluation (from local Stockfish Web Worker)
export interface ClientEval extends EvalScore {
  fen: Fen;
  depth: number;
  nodes: number;
  pvs: PvData[];
  bestmove?: Uci;
  millis?: number;
}

export interface PvData extends EvalScore {
  moves: string[]; // sequence of UCI moves
}

export interface TreeComment {
  id: string;
  by: string | { id: string; name: string };
  text: string;
}

export type GlyphId = number;

export interface Glyph {
  id: GlyphId;
  name: string;   // e.g. "Blunder"
  symbol: string; // e.g. "??"
}

export type Clock = number; // milliseconds remaining

export interface Shape {
  orig: string; // square key e.g. "e2"
  dest?: string; // arrow destination, absent for square highlight
}

// Base fields shared by all nodes (including incomplete/partial nodes)
export interface TreeNodeBase {
  ply: Ply;
  uci?: Uci;
  san?: San;
  fen: Fen;
  eval?: ServerEval;
  ceval?: ClientEval;
  glyphs?: Glyph[];
  comments?: TreeComment[];
  clock?: Clock;
  shapes?: Shape[];
  forceVariation?: boolean;
}

// A complete tree node — used throughout the app
export interface TreeNode extends TreeNodeBase {
  id: TreeNodeId;
  children: TreeNode[];
}

// ---- Learnable-moment reason metadata ----
//
// A stable machine-readable code for why a position was flagged as a learnable moment.
// Carried by both RetroCandidate (in retro.ts) and PuzzleCandidate (persisted to IDB).
//
// This schema is intentionally small and explicit. Before new candidate families are added
// (blown wins, missed defenses, punish-the-blunder, etc.) each new family should define its
// own ReasonCode rather than overloading the existing ones.
//
// Detection confidence:
//   'swing'       — confirmed: win-chance loss meets or exceeds the configured threshold.
//                   Matches the evalSwings |povDiff| > 0.1 branch in nodeFinder.ts.
//   'missed-mate' — confirmed: parent position had a forced mate available within the
//                   configured distance but the played move did not deliver or maintain it.
//                   Matches the prev.eval.mate && !curr.eval.mate branch in nodeFinder.ts.
//   'collapse'    — Patzer extension: user was clearly winning but squandered the advantage.
//   'defensive'   — Patzer extension: user was worse but missed a saving resource.
//   'punish'      — Patzer extension: opponent blundered but user failed to exploit it.

export type LearnableReasonCode = 'swing' | 'missed-mate' | 'collapse' | 'defensive' | 'punish';

export interface LearnableReason {
  /** Stable machine-readable identifier. Used for filtering and drill routing. */
  code:    LearnableReasonCode;
  /** Short user-facing label. */
  label:   string;
  /** One-sentence plain-language explanation. */
  summary: string;
}

// Canonical reason instances — one per code so they can be compared by reference.
export const LEARNABLE_REASONS: Readonly<Record<LearnableReasonCode, LearnableReason>> = {
  'swing': {
    code:    'swing',
    label:   'Missed opportunity',
    summary: 'The move played gave up a significant advantage.',
  },
  'missed-mate': {
    code:    'missed-mate',
    label:   'Missed forced mate',
    summary: 'A forced checkmate sequence was available but was not played.',
  },
  'collapse': {
    code:    'collapse',
    label:   'Blown win',
    summary: 'A clearly winning position was squandered in a single move.',
  },
  'defensive': {
    code:    'defensive',
    label:   'Missed defense',
    summary: 'A saving resource was available in a losing position but was not played.',
  },
  'punish': {
    code:    'punish',
    label:   'Missed punishment',
    summary: 'The opponent blundered but the advantage was not exploited.',
  },
};

// A position where the user missed a strong engine move.
// Extracted from batch analysis; persisted in the puzzle-library IDB store.
export interface PuzzleCandidate {
  gameId:   string | null; // source game
  path:     string;        // TreePath to the mistake node
  fen:      string;        // FEN of the position BEFORE the mistake (puzzle start)
  bestMove: string;        // engine best move from that position (puzzle solution)
  san:      string;        // the mistake move that was played
  loss:     number;        // win-chance shift from mover's perspective
  ply:      number;        // ply of the mistake node (for move-number display)
  /**
   * Why this position was flagged as a learnable moment.
   * Optional for backward compatibility with IDB records written before this field existed.
   * Callers should default to LEARNABLE_REASONS['swing'] when absent (all pre-existing
   * extractions used the win-chance swing path only).
   */
  reason?:  LearnableReason;
}
