/**
 * Opening research source adapter contract.
 *
 * Defines the interface that Lichess, Chess.com, and PGN upload adapters
 * must implement when fetching games for opponent-research purposes.
 *
 * This is intentionally separate from the analysis import adapters in
 * src/import/ — those serve the analysis game library, while these serve
 * the openings research subsystem.
 *
 * The full fetch pipeline is deferred to a later phase.
 */

import type { ResearchGame, ResearchSource } from './types';

/** Parameters for a username-based opponent research fetch. */
export interface ResearchFetchParams {
  /** Source platform. */
  source: ResearchSource;
  /** Target username to research. */
  username: string;
  /** Color the target plays as. 'both' means fetch regardless. */
  color: 'white' | 'black' | 'both';
  /** Maximum number of games to fetch (platform default if omitted). */
  maxGames?: number;
}

/** Progress callback during a research fetch. */
export interface ResearchFetchProgress {
  /** Total games found so far. */
  found: number;
  /** Whether the fetch is still in progress. */
  loading: boolean;
}

/** Result of a research fetch operation. */
export interface ResearchFetchResult {
  /** Games fetched and parsed successfully. */
  games: ResearchGame[];
  /** Source platform. */
  source: ResearchSource;
  /** Any error message (null on success). */
  error: string | null;
}

/**
 * A research source adapter fetches games for opponent prep.
 *
 * Each supported platform (Lichess, Chess.com) will implement this.
 * PGN upload is handled differently (file/paste input) but produces
 * the same ResearchGame[] output.
 */
export interface ResearchSourceAdapter {
  /** Platform identifier. */
  readonly source: ResearchSource;

  /** Fetch games for an opponent username. */
  fetch(
    params: ResearchFetchParams,
    onProgress?: (progress: ResearchFetchProgress) => void,
  ): Promise<ResearchFetchResult>;
}

/**
 * Parse raw PGN text into ResearchGame records for PGN upload source.
 * Stub — the full implementation is deferred to the import pipeline phase.
 */
export function parsePgnToResearchGames(_pgnText: string): ResearchGame[] {
  // Deferred: will parse multi-game PGN and produce ResearchGame[] records.
  return [];
}
