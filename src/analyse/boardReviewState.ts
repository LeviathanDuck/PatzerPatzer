














import type { AnalyseCtrl } from './ctrl';
import type { TreeNode, TreePath } from '../tree/types';
import type { ImportedGame } from '../import/types';
import type {
  AcceptedReviewResult,
  BoardTreeReviewCompletion,
  BoardTreeEnqueueResult,
} from '../engine/reviewQueue';
import { boardReviewSyntheticId, boardReviewResultBinds } from './pgnExport';

/** The bounded in-memory registry entry for the single active board-tree review. */
export interface ActiveBoardReview {
  id:           string;   // board-review:<page-session-uuid>:<board-generation>
  pgnSnapshot:  string;   // immutable snapshot of the tree at request time
  capturedRoot: TreeNode; // the ctrl.root captured at request time (identity check on hydrate)
  generation:   number;   // board/restore generation captured at request time
  engine?:      { engineName?: string; depth?: number }; // filled on completion
}

export interface BoardReviewStateDeps {
  /** The live analysis controller — read `.root` (identity check) and `.retro` (merge on complete). */
  getCtrl: () => AnalyseCtrl;
  /** The current live board/restore generation. */
  getGeneration: () => number;
  /** Stable per-page-session uuid feeding the synthetic id (never derived from PGN/FEN). */
  pageSessionUuid: string;
  /** Immutable PGN snapshot of the tree currently on the board (main.ts's `buildPgn(false)`). */
  buildPgnSnapshot: () => string;
  /** Resolve the node at a path in the CURRENT tree (undefined when the path no longer exists). */
  nodeAtPath: (root: TreeNode, path: TreePath) => TreeNode | undefined;
  /** Apply an accepted, exact-FEN-bound result to the foreground eval display (shared with imports). */
  applyAcceptedEval: (result: AcceptedReviewResult, node: TreeNode) => void;
  /** Flip runtime completion (post-game summary / move labels / Re-Analyze affordance). */
  setAnalysisComplete: (complete: boolean) => void;
  /** Drop the partial foreground eval state hydrated from a cancelled run. */
  clearPartialEval: () => void;
  redraw: () => void;
  // Queue-side seams (injected for testability) ---------------------------------------------------
  requestBoardTreeReview: (game: ImportedGame, boardReviewId: string, depth?: number) => BoardTreeEnqueueResult;
  evictBoardTreeReview: (boardReviewId: string) => void;
  cancelBoardTreeReview: (boardReviewId: string) => void;
}

export interface BoardReviewState {
  /**
   * Snapshot the tree currently on the board and enqueue a memory-only board-tree review. A previous
   * board-tree review on this board is superseded first. Returns true on a real enqueue; false on the
   * typed refusal / empty board (the drill host's honest fallback stays in place then).
   */
  request(): boolean;
  /**
   * Route an accepted review result. Returns true when the result BELONGS to the active board-tree
   * review (whether it hydrated or was stale-dropped) so the caller stops; false when it is not a
   * board-tree result and the caller should fall through to its imported-game path.
   */
  tryHydrateAccepted(result: AcceptedReviewResult): boolean;
  /** Terminal routing for the board-tree review's completion signal (complete / error / cancelled). */
  onCompletion(evt: BoardTreeReviewCompletion): void;
  /** Silent supersession: drop the registry and evict the queue entry (board replacement / next request). */
  evict(): void;
  /**
   * Explicit user cancellation from the running Analyze control: fire the queue cancellation, which
   * emits the terminal `cancelled` signal routed back through `onCompletion` (registry + partial eval
   * cleanup in one place). Returns true when there was an active board-tree review to cancel.
   */
  cancelFromControl(): boolean;
  /** The active synthetic id, or null — for the underboard progress meter (no `selectedGameId`). */
  getActiveId(): string | null;
}

export function createBoardReviewState(deps: BoardReviewStateDeps): BoardReviewState {
  let active: ActiveBoardReview | null = null;

  function request(): boolean {
    // A previous board-tree review on this same board is superseded by a new request.
    evict();

    const generation    = deps.getGeneration();
    const capturedRoot   = deps.getCtrl().root;
    const pgnSnapshot    = deps.buildPgnSnapshot();
    const boardReviewId  = boardReviewSyntheticId(deps.pageSessionUuid, generation);

    // SYNTHETIC record — id is the board-review id, pgn is the immutable snapshot. Never an imported
    // game; never added to `importedGames` or any games-store.
    const result = deps.requestBoardTreeReview({ id: boardReviewId, pgn: pgnSnapshot }, boardReviewId);
    if (result.kind !== 'enqueued') return false;

    active = { id: boardReviewId, pgnSnapshot, capturedRoot, generation };
    return true;
  }

  function tryHydrateAccepted(result: AcceptedReviewResult): boolean {
    const current = active;
    if (current === null || current.id !== result.gameId) return false; // not a board-tree result

    const root = deps.getCtrl().root;
    const node = deps.nodeAtPath(root, result.nodePath);
    // Exact-FEN binding (mirrors Lichess onNewCeval `node.fen !== ev.fen → return`): synthetic id +
    // board generation + live captured root + exact node FEN. Any mismatch stale-drops.
    if (!boardReviewResultBinds({
      activeBoardReviewId:   current.id,
      activeGeneration:      current.generation,
      currentGeneration:     deps.getGeneration(),
      capturedRootIsCurrent: current.capturedRoot === root,
      resultGameId:          result.gameId,
      nodeFenAtResultPath:   node?.fen,
      resultFen:             result.fen,
    })) {
      return true; // was a board-tree result, but stale-dropped — caller must NOT fall through
    }

    deps.applyAcceptedEval(result, node!);
    return true;
  }

  function onCompletion(evt: BoardTreeReviewCompletion): void {
    const current = active;
    if (current === null || current.id !== evt.boardReviewId) return; // stale / already evicted

    if (evt.status === 'error' || evt.status === 'cancelled') {
      // Non-resumable memory-only run ended without completing — drop the registry; nothing durable
      // to clean up. A user cancellation additionally drops the partial foreground eval state.
      active = null;
      if (evt.status === 'cancelled') deps.clearPartialEval();
      deps.redraw();
      return;
    }

    // A board replacement since the request means this completion is stale — the results were bound
    // to a tree that is no longer on the board (mirrors the hydrate-gate generation/root check).
    if (current.generation !== deps.getGeneration() || current.capturedRoot !== deps.getCtrl().root) {
      active = null;
      deps.redraw();
      return;
    }

    current.engine = {
      ...(evt.engineName !== undefined ? { engineName: evt.engineName } : {}),
      ...(evt.depth !== undefined ? { depth: evt.depth } : {}),
    };
    // Flip runtime completion so the post-game summary, move labels, and Re-Analyze affordance light
    // up off the foreground evalCache the accepted-result listener already populated. No IDB write.
    deps.setAnalysisComplete(true);
    // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts onMergeAnalysisData() retro call.
    deps.getCtrl().retro?.onMergeAnalysisData();
    deps.redraw();
  }

  function evict(): void {
    const current = active;
    if (current === null) return;
    active = null;
    deps.evictBoardTreeReview(current.id);
  }

  function cancelFromControl(): boolean {
    const current = active;
    if (current === null) return false;
    // Keep the registry set so the terminal `cancelled` signal's id-match gate passes when it arrives
    // (synchronously, in production) and routes through onCompletion for the single-source cleanup.
    deps.cancelBoardTreeReview(current.id);
    return true;
  }

  function getActiveId(): string | null {
    return active?.id ?? null;
  }

  return { request, tryHydrateAccepted, onCompletion, evict, cancelFromControl, getActiveId };
}
