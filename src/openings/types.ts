/**
 * Canonical domain types for the openings research subsystem.
 *
 * These types are intentionally separate from the analysis/game import types.
 * Opponent-research data must not reuse the analysis game library or persistence path.
 */

/**
 * The top-level tools available inside an openings research session.
 *
 * P2-TREE-2 removed the left tool rail and the four research tools (opponent-repertoire,
 * prep-report, style, practice) as a deprecated experiment not proceeded with — the Opening Tree
 * is the only tool now. Legacy/removed values still normalize safely: see
 * `LegacyOpeningsTool`/`normalizeOpeningsTool` below and the invalid-param recovery path in
 * `urlState.ts`.
 */
export const OPENINGS_TOOL_IDS = [
  'opening-tree',
] as const;

export type OpeningsTool = typeof OPENINGS_TOOL_IDS[number];

/** Previous persisted/URL tool ids that still need to restore safely. */
export type LegacyOpeningsTool = 'repertoire';

export type PersistedOpeningsTool = OpeningsTool | LegacyOpeningsTool;

const OPENINGS_TOOL_ID_SET = new Set<string>(OPENINGS_TOOL_IDS);

/**
 * Normalizes a persisted/URL tool value. Returns null for anything not currently a live tool id —
 * this includes the legacy `'repertoire'` alias and the removed research-tool ids
 * (`opponent-repertoire`, `prep-report`, `style`, `practice`), all of which fall through to the
 * caller's existing invalid-param recovery (fallback: `'opening-tree'`).
 */
export function normalizeOpeningsTool(value: string): OpeningsTool | null {
  return OPENINGS_TOOL_ID_SET.has(value) ? value as OpeningsTool : null;
}

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
  /** Saved/import metadata. Active Opening Tree sessions normalize this to White or Black. */
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
