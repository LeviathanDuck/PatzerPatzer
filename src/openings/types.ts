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
