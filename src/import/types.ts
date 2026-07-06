// Shared types and utilities for game import adapters.
// ImportedGame will move to src/games/library.ts in the Step 9 extraction.

import type { QuestionnaireAnswers } from '../analyse/questionnaire/model';

export interface ImportedGame {
  id: string;
  pgn: string;










  sourcePgn?: string;
  white?: string;
  black?: string;
  result?: string;
  date?: string;
  timeClass?: string;
  opening?: string;
  eco?: string;
  source?: 'chesscom' | 'lichess';
  whiteRating?: number;
  blackRating?: number;
  // Username of the player who triggered the import (lowercased). Absent for PGN paste.
  importedUsername?: string;
  // Registry account id (`${platform}:${lowercased username}`, see src/accounts).
  // Absent for PGN-paste games until they are categorized.
  accountId?: string;
  // Local timestamp for when this game was first added to the browser library.
  importedAt?: number;






  /**
   * Platform-computed post-game accuracy percentages (e.g. chess.com's own
   * "Game Review" analysis), present only when the platform has analyzed the
   * game. This is PLATFORM data and must never be conflated or merged with
   * Patzer's own Stockfish-based review accuracy, which is computed and
   * stored separately (see `src/engine/reviewQueue.ts` analyzedGameAccuracy).
   */
  platformAccuracies?: { white?: number; black?: number };
  /** Per-player platform result code describing how the game actually ended
   *  (e.g. "win", "resigned", "checkmated", "timeout", "abandoned"). */
  whiteResultCode?: string;
  blackResultCode?: string;
  /** PGN `Termination` header text (e.g. "Opponent resigned"). */
  termination?: string;
  /** Platform game UUID — stable dedupe/enrichment join key, independent of
   *  the numeric game id parsed from the game URL. */
  uuid?: string;
  /** Final position FEN reported by the platform at game end. */
  finalFen?: string;
  /** Platform opening-explorer URL for this game (chess.com's archive `eco`
   *  field is a URL, distinct from the 3-letter `eco` code above). */
  openingUrl?: string;
  /** Platform game variant/rules (e.g. "chess", "chess960"). Lets variant
   *  games be identified/excluded from standard stats. */
  variant?: string;
  /** Raw platform time control string (e.g. "600", "180+2"). */
  timeControl?: string;
  /** Explicit rated flag from the platform archive. */
  rated?: boolean;
  /** Game start/end epoch seconds as reported by the platform. */
  startTime?: number;
  endTime?: number;
  /** Tournament or match URL, when the game was part of one. */
  tournamentUrl?: string;
  matchUrl?: string;
  /**
   * Imported account's own rating delta for this game: `rating(this) -
   * rating(previous)`, computed at import time from the account's own rated
   * game sequence within the fetched archive(s), separated by time class.
   * Absent when there is no prior baseline (first game of a time class in
   * the fetched range). Account side only — this is not the opponent's delta.
   */
  ratingDelta?: number;















  opponentRatingDelta?: number;















  questionnaire?: QuestionnaireAnswers;
}

/** Callbacks injected by main.ts so adapters don't depend on application state. */
export interface ImportCallbacks {
  addGames: (games: ImportedGame[], first: ImportedGame) => void;
  redraw: () => void;
}

let gameIdCounter = 0;

export function nextGameId(): string {
  return `game-${++gameIdCounter}`;
}

/**
 * Restore the counter after IDB load so new imports don't collide with
 * existing game ids. Pass the highest existing numeric suffix.
 */
export function restoreGameIdCounter(max: number): void {
  if (max > gameIdCounter) gameIdCounter = max;
}

/** Extract a PGN header tag value, e.g. parsePgnHeader(pgn, 'White') → 'Magnus'. */
export function parsePgnHeader(pgn: string, tag: string): string | undefined {
  return pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`))?.[1];
}

/** Parse a PGN ELO string (e.g. "1456") into a number. Returns undefined if absent, zero, or non-numeric. */
export function parseRating(s: string | number | undefined): number | undefined {
  if (typeof s === 'number') return s > 0 ? s : undefined;
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return isNaN(n) || n <= 0 ? undefined : n;
}

/**
 * Converts a PGN TimeControl header value (e.g. "600+0", "180+2") to a time class name.
 * Standard time class thresholds for PGN TimeControl classification.
 */
export function timeClassFromTimeControl(tc: string | undefined): string | undefined {
  if (!tc || tc === '-') return undefined;
  const secs = parseInt(tc, 10); // base time in seconds (ignores increment)
  if (isNaN(secs)) return undefined;
  if (secs < 30)     return 'ultrabullet';
  if (secs < 180)    return 'bullet';
  if (secs < 480)    return 'blitz';
  if (secs < 1500)   return 'rapid';
  return 'classical';
}
