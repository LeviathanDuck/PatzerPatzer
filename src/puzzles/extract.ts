// Puzzle candidate extraction and rendering.
// Mirrors the swing-detection loop in lichess-org/lila: practiceCtrl.ts makeComment.

import { h, type VNode } from 'snabbdom';
import { LEARNABLE_REASONS, type PuzzleCandidate, type TreeNode } from '../tree/types';
import { LOSS_THRESHOLDS } from '../engine/winchances';
import { controlExplainerAttrs, renderDisabledControlExplainer } from '../ui/controlExplainer';

// Minimum win-chance loss to qualify as a puzzle candidate.
// Matches the blunder threshold — we only want clear mistakes. Sourced from the
// single source of truth (winchances.ts) rather than a hardcoded copy that could
// drift (BUG-2026-07-10-031 rider: the old literal 0.14 was stale vs 0.15).
const PUZZLE_CANDIDATE_MIN_LOSS = LOSS_THRESHOLDS.blunder;

// Alt-castle normalization for played==best comparison. Castling may be emitted
// king-to-destination (e1g1) or king-to-rook-square (e1h1); both forms denote the
// same move. Miniature copy of the same aliases used by src/puzzles/ctrl.ts
// `uciMatches` and src/analyse/lichessCompare.ts `normalizeCastlingUci`, kept
// local to avoid cross-module runtime coupling.
const ALT_CASTLE_UCI: Readonly<Record<string, string>> = {
  e1a1: 'e1c1',
  e1h1: 'e1g1',
  e8a8: 'e8c8',
  e8h8: 'e8g8',
};

/**
 * True when the played UCI is the engine best for the parent position, accounting
 * for alternate castling notation. A played==best move has no puzzle to solve —
 * the stored solution would be the move the player already played
 * (BUG-2026-07-10-031).
 */
function playedIsBest(played: string, best: string): boolean {
  if (played === best) return true;
  if (ALT_CASTLE_UCI[played] === best) return true;
  if (ALT_CASTLE_UCI[best] === played) return true;
  return false;
}

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

    // Require: evaluated loss above threshold + engine best move from parent position,
    // and the played move must NOT be the engine best (BUG-2026-07-10-031): a
    // played==best position has no puzzle — its stored answer would equal the move
    // already played.
    if (
      nodeEval?.loss !== undefined &&
      nodeEval.loss >= PUZZLE_CANDIDATE_MIN_LOSS &&
      parentEval?.best &&
      !(node.uci && playedIsBest(node.uci, parentEval.best))
    ) {
      candidates.push({
        gameId,
        path,
        fen:      parent.fen,
        bestMove: parentEval.best,
        san:      node.san ?? '',
        loss:     nodeEval.loss,
        ply:      node.ply,
        // extract.ts uses only the win-chance swing condition; all candidates here are 'swing'.
        reason:   LEARNABLE_REASONS['swing'],
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

// --- Sequential mistake navigation ---
// Mirrors the nextGlyphSymbol() pattern in lichess-org/lila: ui/analyse/src/nodeFinder.ts —
// find the next/prev mainline node matching a criterion from the current path.
// Candidates are stored in ascending mainline order (path length grows with ply).

function prevMistake(currentPath: string): PuzzleCandidate | null {
  const idx = puzzleCandidates.findIndex(c => c.path === currentPath);
  if (idx > 0) return puzzleCandidates[idx - 1]!;
  if (idx === 0) return null; // already at first candidate
  // Not on a candidate: return the last candidate that precedes the current position.
  let last: PuzzleCandidate | null = null;
  for (const c of puzzleCandidates) {
    if (c.path.length < currentPath.length) last = c;
    else break;
  }
  return last;
}

function nextMistake(currentPath: string): PuzzleCandidate | null {
  const idx = puzzleCandidates.findIndex(c => c.path === currentPath);
  if (idx >= 0) return puzzleCandidates[idx + 1] ?? null;
  // Not on a candidate: return the first candidate that follows the current position.
  return puzzleCandidates.find(c => c.path.length > currentPath.length) ?? null;
}

/**
 * Standalone Find Puzzles button — placed in the analysis controls bar alongside
 * the move navigation buttons. Separated from renderPuzzleCandidates so the
 * trigger action lives next to other board controls while the candidate list
 * stays in the tools panel.
 */
export function renderFindPuzzlesButton(deps: PuzzleRenderDeps): VNode {
  const canExtract = deps.engineEnabled && !deps.batchAnalyzing;
  const btnLabel = canExtract
    ? `Find Puzzles (${puzzleCandidates.length})`
    : deps.batchAnalyzing ? 'Find Puzzles (analyzing…)' : 'Find Puzzles (engine off)';
  const reason = deps.batchAnalyzing
    ? 'Wait for the current batch analysis to finish.'
    : 'Enable the engine before finding puzzle candidates.';
  const explainer = {
    label: 'Find puzzle candidates',
    description: canExtract ? 'Scan completed analysis for blunder-level puzzle candidates.' : reason,
  };
  const control = h('button', {
    attrs: { disabled: !canExtract, ...controlExplainerAttrs(explainer) },
    on: { click: () => { extractPuzzleCandidates(deps.mainline, deps.getEval, deps.gameId); deps.redraw(); } },
  }, btnLabel);
  return canExtract ? control : renderDisabledControlExplainer(explainer, control);
}

export function renderPuzzleCandidates(deps: PuzzleRenderDeps): VNode | null {
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
        attrs: { style: 'flex:1', ...controlExplainerAttrs({
          label: `Open candidate ${heading}`,
          description: `Move to the position before ${heading}.`,
        }) },
        on: { click: () => deps.navigate(c.path) },
      }, [
        h('span', { attrs: { style: 'font-weight:600;margin-right:8px' } }, heading),
        h('span', { attrs: { style: 'color:#f88;margin-right:8px' } }, lossText),
        h('span', { attrs: { style: 'color:#888;font-size:0.8rem' } }, `best: ${deps.uciToSan(c.fen, c.bestMove)}`),
      ]),
      isSaved ? renderDisabledControlExplainer({
        label: 'Save puzzle candidate',
        description: 'This puzzle candidate is already saved.',
      }, h('button', {
        attrs: {
          style: 'flex-shrink:0;padding:2px 8px;font-size:0.75rem;margin-left:4px;cursor:pointer',
          disabled: true,
          ...controlExplainerAttrs({ label: 'Save puzzle candidate', description: 'This puzzle candidate is already saved.' }),
        },
        on: { click: () => { deps.savePuzzle(c, deps.redraw); } },
      }, '✓ Saved')) : h('button', {
        attrs: {
          style: 'flex-shrink:0;padding:2px 8px;font-size:0.75rem;margin-left:4px;cursor:pointer',
          ...controlExplainerAttrs({ label: 'Save puzzle candidate', description: 'Save this candidate to the puzzle library.' }),
        },
        on: { click: () => { deps.savePuzzle(c, deps.redraw); } },
      }, 'Save'),
    ]);
  });

  // Navigation strip — shown only when candidates exist.
  // Mirrors lichess-org/lila: ui/analyse/src/nodeFinder.ts nextGlyphSymbol sequential nav.
  let navRow: VNode | null = null;
  if (puzzleCandidates.length > 0) {
    const currentIdx = puzzleCandidates.findIndex(c => c.path === currentPath);
    const posLabel   = currentIdx >= 0
      ? `${currentIdx + 1} / ${puzzleCandidates.length}`
      : `— / ${puzzleCandidates.length}`;
    const prev = prevMistake(currentPath);
    const next = nextMistake(currentPath);
    navRow = h('div.pgn-import__row', { attrs: { style: 'margin-bottom:4px' } }, [
      prev ? h('button', {
        attrs: { ...controlExplainerAttrs({ label: 'Previous puzzle candidate', description: 'Move to the previous puzzle candidate.' }) },
        on: { click: () => { if (prev) deps.navigate(prev.path); } },
      }, '← Prev') : renderDisabledControlExplainer({
        label: 'Previous puzzle candidate',
        description: 'You are at the first puzzle candidate.',
      }, h('button', { attrs: { disabled: true, ...controlExplainerAttrs({
        label: 'Previous puzzle candidate', description: 'You are at the first puzzle candidate.',
      }) } }, '← Prev')),
      h('span', { attrs: { style: 'margin:0 8px;font-size:0.85rem;color:#aaa' } }, posLabel),
      next ? h('button', {
        attrs: { ...controlExplainerAttrs({ label: 'Next puzzle candidate', description: 'Move to the next puzzle candidate.' }) },
        on: { click: () => { if (next) deps.navigate(next.path); } },
      }, 'Next →') : renderDisabledControlExplainer({
        label: 'Next puzzle candidate',
        description: 'You are at the last puzzle candidate.',
      }, h('button', { attrs: { disabled: true, ...controlExplainerAttrs({
        label: 'Next puzzle candidate', description: 'You are at the last puzzle candidate.',
      }) } }, 'Next →')),
    ]);
  }

  if (puzzleCandidates.length === 0) return null;

  return h('div.game-list', [
    navRow,
    h('ul', rows),
  ]);
}
