/**
 * Canonical domain types for the openings research subsystem.
 *
 * These types are intentionally separate from the analysis/game import types.
 * Opponent-research data must not reuse the analysis game library or persistence path.
 */

/** The top-level tools available inside an openings research session. */
export type OpeningsTool = 'opening-tree' | 'repertoire' | 'prep-report' | 'style' | 'practice';

/** Source platform for opponent research games. */
export type ResearchSource = 'lichess' | 'chesscom' | 'pgn';

/** A single game fetched for opponent-research purposes. */
export interface ResearchGame {
  /** Stable unique id within the collection. */
  id: string;
  /** Full PGN text. */
  pgn: string;
  /** White player name. */
  white?: string;
  /** Black player name. */
  black?: string;
  /** Game result: '1-0', '0-1', '1/2-1/2', '*'. */
  result?: string;
  /** Date string from the PGN header. */
  date?: string;
  /** Time control class (bullet, blitz, rapid, classical). */
  timeClass?: string;
  /** Opening name from PGN header. */
  opening?: string;
  /** ECO code. */
  eco?: string;
  /** Source platform. */
  source?: ResearchSource;
  /** White ELO. */
  whiteRating?: number;
  /** Black ELO. */
  blackRating?: number;
  /** Per-move remaining clock times in centiseconds, alternating white/black moves. */
  clocks?: number[];
}

/** Snapshot of the import settings used when a collection was created. */
export interface ResearchSettings {
  /** Time control filters active at import time. Empty means "all". */
  speeds: string[];
  /** Date range filter. */
  dateRange: string;
  /** Custom date range start (YYYY-MM-DD), if dateRange === 'custom'. */
  customFrom?: string;
  /** Custom date range end (YYYY-MM-DD), if dateRange === 'custom'. */
  customTo?: string;
  /** Whether only rated games were included. */
  rated: boolean;
  /** Max games requested. */
  maxGames: number;
}

/** Import provenance summary captured at collection creation time. */
export interface ResearchProvenance {
  /** Total games fetched before filtering. */
  fetchedCount: number;
  /** Total games after all filters were applied. */
  filteredCount: number;
  /** Timestamp of the import (Date.now()). */
  importedAt: number;
}

/** A saved research collection — one opponent prep session. */
export interface ResearchCollection {
  /** Stable unique id. */
  id: string;
  /** Display name (e.g., opponent username or "PGN Upload 2026-03-27"). */
  name: string;
  /** Source platform used for this collection. */
  source: ResearchSource;
  /** Username or label that was researched. */
  target: string;
  /** Color perspective: which side is the research subject playing? */
  perspective: 'white' | 'black' | 'both';
  /** Games in this collection. */
  games: ResearchGame[];
  /** When this collection was created (Date.now()). */
  createdAt: number;
  /** When this collection was last updated (Date.now()). */
  updatedAt: number;
  /** Settings snapshot from import time. Absent on collections created before this field. */
  settings?: ResearchSettings;
  /** Import provenance. Absent on collections created before this field. */
  provenance?: ResearchProvenance;
}

// ---------------------------------------------------------------------------
// Opening Repetition Practice (ORP) — saved variations for line drilling
// ---------------------------------------------------------------------------

/** A saved variation from opponent research, ready for ORP line drilling. */
export interface SavedVariation {
  /** Unique ID. */
  id: string;
  /** Collection this was extracted from. */
  collectionId: string;
  /** Move sequence (UCI). */
  moves: string[];
  /** SAN sequence for display. */
  sans: string[];
  /** Color perspective the user is training as. */
  trainAs: 'white' | 'black';
  /** Optional user label/note. */
  label?: string;
  /** When saved. */
  createdAt: number;
  /** Training stats (populated by future ORP drill flow). */
  stats?: {
    attempts: number;
    correct: number;
    lastAttempt: number;
  };
}

// ---------------------------------------------------------------------------
// Practice session state
// ---------------------------------------------------------------------------

/**
 * Whether the opponent's next move is covered by the imported repertoire
 * or has been handed off to the engine.
 *
 *  'repertoire' — the current position has at least one child node with
 *                 sufficient game frequency to make a weighted repertoire pick.
 *  'engine'     — the repertoire has no data here; engine plays best move.
 *  'exhausted'  — the tree has run out of moves AND no engine is available.
 */
export type PracticeOpponentSource = 'repertoire' | 'engine' | 'exhausted';

/**
 * Active practice session state.
 *
 * One `PracticeSession` exists while the user is playing in Practice mode.
 * It is null when the user is in any other tool (Opening Tree, Prep Report, etc.).
 * Cleared on `closeSession()` and `stopPractice()`.
 *
 * Design notes (mirroring lichess-org/lila: ui/analyse/src/practice/practiceCtrl.ts):
 *  - `userColor` is fixed for the life of the session; the user cannot flip mid-session.
 *  - `opponentSource` reflects the current position's coverage state and updates on
 *    every half-move (after user moves AND after opponent moves).
 *  - `running` may be false if the user paused / navigated back manually; the session
 *    is preserved but the auto-advance loop is halted.
 *  - `startFen` records where the session began so "restart" can return there.
 */
export interface PracticeSession {
  /** Color the user is playing in this session. */
  userColor: 'white' | 'black';
  /** UCI path of moves played so far in this session (starting from startFen). */
  moveHistory: string[];
  /** FEN at session start (root of the practice sequence). */
  startFen: string;
  /** Whether the session auto-advance loop is running. False = paused. */
  running: boolean;
  /**
   * Who is providing the opponent's move at the current position.
   * Kept up to date so the view can show an honest handoff banner.
   */
  opponentSource: PracticeOpponentSource;
  /**
   * Minimum game frequency a tree child must have to be eligible
   * for repertoire play. Positions below this threshold are treated as
   * `'engine'` handoff even if children exist.
   * Default: 2 (opponent has played this move at least twice in imported games).
   */
  minRepertoireFreq: number;
  /**
   * Engine strength level (1–8) used when opponentSource transitions to 'engine'.
   * Index into STRENGTH_LEVELS from src/engine/types.ts.
   */
  strengthLevel: number;
}
