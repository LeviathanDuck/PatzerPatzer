/**
 * Canonical domain types for the openings research subsystem.
 *
 * These types are intentionally separate from the analysis/game import types.
 * Opponent-research data must not reuse the analysis game library or persistence path.
 */

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
}
