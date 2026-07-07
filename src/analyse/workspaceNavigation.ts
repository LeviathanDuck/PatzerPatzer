


















/**
 * Ordered hook points a caller can supply around the generic P0 transition. All hooks receive
 * `(fromPath, toPath)` so a caller can compute things (e.g. "is this a single forward step?")
 * without this module needing to know what a "step" means.
 */
export interface NavigationHooks {
  /** Reads the cursor's current path. Called once, before anything else, for the no-op guard. */
  getPath: () => string;
  /** Applies the path transition to the cursor (tree wrapper / session). */
  setPath: (path: string) => void;
  /** Applies the resulting position directly to the board (Chessground), synchronously — must
   *  not be gated behind any engine/arrow/eval/explorer work (P0 constraint). */
  syncBoard: () => void;
  /** Snabbdom redraw, run after the board sync and all after-board-sync side effects. */
  redraw: () => void;
  /** Centers the active move in the move list; run after redraw. */
  requestActiveMoveScroll: () => void;

  /** Runs before the cursor transition, while the cursor is still at `fromPath`. */
  beforeTransition?: (fromPath: string, toPath: string) => void;
  /** Runs immediately after `setPath`, before `syncBoard`. */
  afterTransition?: (fromPath: string, toPath: string) => void;
  /** Runs immediately after `syncBoard`, before `redraw`. */
  afterBoardSync?: (fromPath: string, toPath: string) => void;
}

/**
 * The ordered generic navigation primitive (design §3.2's `navigateTo`). Mirrors
 * lichess-org/lila ui/analyse/src/ctrl.ts jump(): no-op guard → cursor transition → direct
 * Chessground sync → terminal redraw + active-move-scroll, with caller hooks interleaved at the
 * three defined points. The order here is the contract — do not reorder.
 */
export function runNavigate(path: string, hooks: NavigationHooks): void {
  const fromPath = hooks.getPath();
  // Guard: no-op when already at this path. Mirrors lila's `pathChanged` guard — prevents
  // re-entering engine/board work when the caller passes the current path (e.g. clicking the
  // active move in the move list, clicking the current position in the eval graph).
  if (path === fromPath) return;

  hooks.beforeTransition?.(fromPath, path);
  hooks.setPath(path);
  hooks.afterTransition?.(fromPath, path);

  // P0: the board is synced directly through Chessground before any lower-priority work
  // (arrows/engine/explorer/route) runs.
  hooks.syncBoard();
  hooks.afterBoardSync?.(fromPath, path);

  hooks.redraw();
  hooks.requestActiveMoveScroll();
}
