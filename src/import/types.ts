// Shared types and utilities for game import adapters.
// ImportedGame will move to src/games/library.ts in the Step 9 extraction.

export interface ImportedGame {
  id: string;
  pgn: string;
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
 * Adapted from external reference-game-history-reference.md time class thresholds.
 */
export function timeClassFromTimeControl(tc: string | undefined): string | undefined {
  if (!tc || tc === '-') return undefined;
  const secs = parseInt(tc, 10); // base time in seconds (ignores increment)
  if (isNaN(secs)) return undefined;
  if (secs < 180)    return 'ultrabullet';
  if (secs < 600)    return 'bullet';
  if (secs < 1800)   return 'blitz';
  if (secs <= 10800) return 'rapid';
  return 'classical';
}
