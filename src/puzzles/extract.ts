// Puzzle candidate extraction and rendering.
// Mirrors the swing-detection loop in lichess-org/lila: practiceCtrl.ts makeComment.

import { h, type VNode } from 'snabbdom';
import type { PuzzleCandidate, TreeNode } from '../tree/types';

// Minimum win-chance loss to qualify as a puzzle candidate.
// Matches the blunder threshold — we only want clear mistakes.
const PUZZLE_CANDIDATE_MIN_LOSS = 0.14;

// Eval lookup: structural type matching PositionEval without importing it.
type EvalLookup = (path: string) => { best?: string; loss?: number } | undefined;

// Module-level puzzle candidate state.
let puzzleCandidates: PuzzleCandidate[] = [];

/**
 * Scan the current mainline for blunder-level moves that have engine data.
 * Stores results in module state and returns the list.
 * Mirrors the swing-detection loop in lichess-org/lila: practiceCtrl.ts makeComment.
 */
export function extractPuzzleCandidates(
  mainline: TreeNode[],
  getEval:  EvalLookup,
  gameId:   string | null,
): PuzzleCandidate[] {
  const candidates: PuzzleCandidate[] = [];
  let path = '';
  for (let i = 1; i < mainline.length; i++) {
    const node   = mainline[i]!;
    const parent = mainline[i - 1]!;
    path += node.id;

    const nodeEval   = getEval(path);
    const parentEval = getEval(path.slice(0, -2));

    // Require: evaluated loss above threshold + engine best move from parent position
    if (
      nodeEval?.loss !== undefined &&
      nodeEval.loss >= PUZZLE_CANDIDATE_MIN_LOSS &&
      parentEval?.best
    ) {
      candidates.push({
        gameId,
        path,
        fen:      parent.fen,
        bestMove: parentEval.best,
        san:      node.san ?? '',
        loss:     nodeEval.loss,
        ply:      node.ply,
      });
    }
  }
  puzzleCandidates = candidates;
  console.log('[puzzles] extracted', candidates.length, 'candidates', candidates);
  return candidates;
}

/** Clear the puzzle candidate list (call on game load and re-analyze). */
export function clearPuzzleCandidates(): void {
  puzzleCandidates = [];
}

export interface PuzzleRenderDeps {
  mainline:       TreeNode[];
  getEval:        EvalLookup;
  gameId:         string | null;
  currentPath:    string;
  engineEnabled:  boolean;
  batchAnalyzing: boolean;
  batchState:     'idle' | 'analyzing' | 'complete';
  savedPuzzles:   PuzzleCandidate[];
  navigate:       (p: string) => void;
  savePuzzle:     (c: PuzzleCandidate, redraw: () => void) => void;
  uciToSan:       (fen: string, uci: string) => string;
  redraw:         () => void;
}

export function renderPuzzleCandidates(deps: PuzzleRenderDeps): VNode {
  const { engineEnabled, batchAnalyzing, batchState, savedPuzzles, currentPath } = deps;
  const canExtract = engineEnabled && !batchAnalyzing;
  const btnLabel = canExtract
    ? `Find Puzzles (${puzzleCandidates.length})`
    : batchAnalyzing ? 'Find Puzzles (analyzing…)' : 'Find Puzzles (engine off)';

  const rows = puzzleCandidates.map(c => {
    const moveNum  = Math.ceil(c.ply / 2);
    const side     = c.ply % 2 === 1 ? '' : '…';
    const heading  = `${moveNum}${side}. ${c.san}`;
    const lossText = `−${(c.loss * 100).toFixed(0)}%`;
    const isActive = currentPath === c.path;
    const isSaved  = savedPuzzles.some(p => p.gameId === c.gameId && p.path === c.path);
    return h('li', { attrs: { style: 'display:flex;align-items:center' } }, [
      h('button.game-list__row', {
        class: { active: isActive },
        attrs: { style: 'flex:1' },
        on: { click: () => deps.navigate(c.path) },
      }, [
        h('span', { attrs: { style: 'font-weight:600;margin-right:8px' } }, heading),
        h('span', { attrs: { style: 'color:#f88;margin-right:8px' } }, lossText),
        h('span', { attrs: { style: 'color:#888;font-size:0.8rem' } }, `best: ${deps.uciToSan(c.fen, c.bestMove)}`),
      ]),
      h('button', {
        attrs: {
          style: 'flex-shrink:0;padding:2px 8px;font-size:0.75rem;margin-left:4px;cursor:pointer',
          disabled: isSaved,
          title: isSaved ? 'Already saved' : 'Save this puzzle',
        },
        on: { click: () => { deps.savePuzzle(c, deps.redraw); } },
      }, isSaved ? '✓ Saved' : 'Save'),
    ]);
  });

  return h('div.game-list', [
    h('div.pgn-import__row', { attrs: { style: 'margin-bottom:6px' } }, [
      h('button', {
        attrs: { disabled: !canExtract },
        on: { click: () => { extractPuzzleCandidates(deps.mainline, deps.getEval, deps.gameId); deps.redraw(); } },
      }, btnLabel),
    ]),
    puzzleCandidates.length > 0
      ? h('ul', rows)
      : h('div.game-list__header', batchState === 'complete'
          ? 'No blunder-level candidates found in this game.'
          : 'Run extraction after analysis completes.'),
  ]);
}
