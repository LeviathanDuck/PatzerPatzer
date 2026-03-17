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
