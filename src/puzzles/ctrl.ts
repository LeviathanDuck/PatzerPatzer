// ---------------------------------------------------------------------------
// Puzzle V1 — Minimal route controller
// Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts (module pattern only)
//
// This is the puzzle product's route owner. It manages page-level state for
// the puzzle library and individual puzzle round views. The solve loop, board
// ownership, and engine integration will be added in later phases.
// ---------------------------------------------------------------------------

import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { parseFen } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { Chess } from 'chessops/chess';
import { listPuzzleDefinitions, getPuzzleDefinition } from './puzzleDb';
import type { PuzzleDefinition } from './types';

export type PuzzleView = 'library' | 'round';

export interface PuzzlePageState {
  view: PuzzleView;
  puzzleId?: string;
}

export interface LibraryCounts {
  imported: number;
  user: number;
}

export interface PuzzleRoundState {
  definition: PuzzleDefinition | null;
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

let state: PuzzlePageState = { view: 'library' };
let libraryCounts: LibraryCounts | undefined;
let roundState: PuzzleRoundState | null = null;

export function initPuzzlePage(view: PuzzleView, puzzleId?: string): void {
  state = { view, puzzleId };
}

export function getPuzzlePageState(): PuzzlePageState {
  return state;
}

export function getLibraryCounts(): LibraryCounts | undefined {
  return libraryCounts;
}

// --- Puzzle round ---

export function getPuzzleRoundState(): PuzzleRoundState | null {
  return roundState;
}

/**
 * Load a puzzle definition from IDB and transition to the round view.
 * Calls redraw once the definition is loaded (or on error).
 * Idempotent — skips if already loading/loaded for the same puzzle id.
 */
export async function openPuzzleRound(id: string, redraw: () => void): Promise<void> {
  // Avoid re-fetching if we already have the right puzzle loaded or loading
  if (roundState && state.puzzleId === id && roundState.status !== 'error') return;

  state = { view: 'round', puzzleId: id };
  roundState = { definition: null, status: 'loading' };
  redraw();

  try {
    const def = await getPuzzleDefinition(id);
    if (!def) {
      roundState = { definition: null, status: 'error', error: `Puzzle "${id}" not found` };
    } else {
      roundState = { definition: def, status: 'ready' };
    }
  } catch (e) {
    roundState = {
      definition: null,
      status: 'error',
      error: e instanceof Error ? e.message : 'Failed to load puzzle',
    };
  }
  redraw();
}

// --- Puzzle board ---
// Puzzle-local Chessground instance. Kept separate from the analysis board's
// cgInstance so the two products don't interfere when only one is active.
// Mirrors lichess-org/lila: ui/puzzle/src/view/chessground.ts (per-puzzle CG lifecycle)

let puzzleCg: CgApi | undefined;
let puzzleOrientation: 'white' | 'black' = 'white';

export function getPuzzleCg(): CgApi | undefined { return puzzleCg; }
export function getPuzzleOrientation(): 'white' | 'black' { return puzzleOrientation; }

/**
 * Initialize (or reinitialize) the Chessground board for the current puzzle.
 * Call this from a Snabbdom insert hook once the DOM element is available.
 * Mirrors lichess-org/lila: ui/puzzle/src/view/chessground.ts makeConfig
 */
export function mountPuzzleBoard(el: HTMLElement, redraw: () => void): void {
  const def = roundState?.definition;
  if (!def) return;

  // Determine orientation: solver plays the side to move at startFen.
  // Mirrors lichess-org/lila: ui/puzzle/src/ctrl.ts makeCgOpts orientation
  const setup = parseFen(def.startFen);
  if (setup.isErr) {
    console.error('[puzzle-ctrl] invalid startFen', def.startFen);
    return;
  }
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) {
    console.error('[puzzle-ctrl] invalid position from startFen', def.startFen);
    return;
  }
  const turn: 'white' | 'black' = pos.value.turn;
  puzzleOrientation = turn;

  // Compute legal destinations for the starting position
  const dests = chessgroundDests(pos.value) as Map<Key, Key[]>;

  // Destroy previous instance if any
  puzzleCg?.destroy();

  puzzleCg = makeChessground(el, {
    orientation: puzzleOrientation,
    fen: def.startFen,
    turnColor: turn,
    viewOnly: false,
    movable: {
      free: false,
      color: turn,
      dests,
      showDests: true,
    },
    drawable: { enabled: true },
    animation: { enabled: true, duration: 200 },
    events: {
      move: (_orig, _dest) => {
        // Free movement for now — no validation. A future phase will wire the solve loop.
        redraw();
      },
    },
  });
}

/**
 * Tear down the puzzle Chessground instance. Called from Snabbdom destroy hook.
 */
export function destroyPuzzleBoard(): void {
  puzzleCg?.destroy();
  puzzleCg = undefined;
}

// --- Library counts ---

/**
 * Load puzzle counts from IndexedDB, grouped by sourceKind.
 * Calls redraw when complete so the view reflects the loaded data.
 */
export async function loadLibraryCounts(redraw: () => void): Promise<void> {
  try {
    const all = await listPuzzleDefinitions();
    let imported = 0;
    let user = 0;
    for (const p of all) {
      if (p.sourceKind === 'imported-lichess') imported++;
      else if (p.sourceKind === 'user-library') user++;
    }
    libraryCounts = { imported, user };
  } catch (e) {
    console.warn('[puzzle-ctrl] loadLibraryCounts failed', e);
    libraryCounts = { imported: 0, user: 0 };
  }
  redraw();
}
