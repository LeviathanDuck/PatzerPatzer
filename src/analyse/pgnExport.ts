// PGN export and analysis review controls.
// Adapted from lichess-org/lila: ui/analyse/src/pgnExport.ts,
// ui/analyse/src/view/controls.ts (review button logic)

import { h, type VNode } from 'snabbdom';
import type { AnalyseCtrl } from '../analyse/ctrl';
import {
  evalCache,
  clearEvalCache, resetCurrentEval, syncArrow,
} from '../engine/ctrl';
import { reviewDepth } from '../engine/reviewProfiles';
import { analysisComplete, resetReviewStatusRuntime } from '../engine/reviewStatus';
import { enqueueAtFront, getQueueSummary, pauseBulkReview } from '../engine/reviewQueue';
import { clearPuzzleCandidates } from '../puzzles/extract';
import type { ImportedGame } from '../import/types';
import { nodeListAt, pathIsMainline } from '../tree/ops';
import type { TreeNode, TreePath } from '../tree/types';

// --- Injected deps ---

let _getCtrl:           () => AnalyseCtrl                        = () => { throw new Error('pgnExport not initialised'); };
let _getImportedGames:  () => ImportedGame[]                     = () => [];
let _getSelectedGameId: () => string | null                      = () => null;
let _clearGameAnalysis: (gameId: string) => void                 = () => {};
let _redraw:            () => void                               = () => {};

function renderAnnotatedComment(node: TreeNode, path: TreePath, annotated: boolean): string | null {
  if (!annotated) return null;
  const commentParts: string[] = [];
  const ev = evalCache.get(path);
  if (ev) {
    if (ev.mate !== undefined) {
      commentParts.push(`[%eval #${ev.mate}]`);
    } else if (ev.cp !== undefined) {
      const pawns = (ev.cp / 100).toFixed(2);
      commentParts.push(`[%eval ${pawns}]`);
    }
  }
  if (node.clock !== undefined) {
    const total = Math.round(node.clock / 100);
    const hrs = Math.floor(total / 3600);
    const m   = Math.floor((total % 3600) / 60);
    const s   = total % 60;
    commentParts.push(`[%clk ${hrs}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`);
  }
  return commentParts.length > 0 ? `{ ${commentParts.join(' ')} }` : null;
}

function renderPgnLine(
  firstNode: TreeNode,
  firstPath: TreePath,
  annotated: boolean,
  siblingVariations: Array<{ node: TreeNode; path: TreePath }> = [],
): string {
  const parts: string[] = [];
  let node: TreeNode | undefined = firstNode;
  let path = firstPath;
  let needsMoveNum = true;
  let pendingSiblingVariations = siblingVariations;

  while (node) {
    const isWhite = node.ply % 2 === 1;
    const moveNum = Math.ceil(node.ply / 2);
    if (isWhite || needsMoveNum) {
      parts.push(isWhite ? `${moveNum}.` : `${moveNum}...`);
    }

    parts.push(node.san ?? '?');

    const comment = renderAnnotatedComment(node, path, annotated);
    if (comment) {
      parts.push(comment);
      needsMoveNum = isWhite;
    } else {
      needsMoveNum = false;
    }

    for (const variation of pendingSiblingVariations) {
      parts.push(`(${renderPgnLine(variation.node, variation.path, annotated)})`);
    }
    pendingSiblingVariations = [];

    for (const child of node.children.slice(1)) {
      parts.push(`(${renderPgnLine(child, path + child.id, annotated)})`);
    }

    const next: TreeNode | undefined = node.children[0];
    if (!next) break;
    path += next.id;
    node = next;
  }

  return parts.join(' ');
}

export function initPgnExport(deps: {
  getCtrl:            () => AnalyseCtrl;
  getImportedGames:   () => ImportedGame[];
  getSelectedGameId:  () => string | null;
  clearGameAnalysis:  (gameId: string) => void;
  redraw:             () => void;
}): void {
  _getCtrl           = deps.getCtrl;
  _getImportedGames  = deps.getImportedGames;
  _getSelectedGameId = deps.getSelectedGameId;
  _clearGameAnalysis = deps.clearGameAnalysis;
  _redraw            = deps.redraw;
}

// --- PGN building ---

/**
 * Build a PGN string from the current move tree.
 * annotated=true adds { [%eval X.XX] [%clk h:mm:ss] } comments after each
 * move — exact same format Lichess uses in exported PGNs.
 * Adapted from lichess-org/lila: modules/analyse/src/main/Annotator.scala
 * and modules/tree/src/main/Info.scala pgnComment
 */
export function buildPgn(annotated: boolean): string {
  const ctrl           = _getCtrl();
  const importedGames  = _getImportedGames();
  const selectedGameId = _getSelectedGameId();
  const game           = importedGames.find(g => g.id === selectedGameId);

  const headers: [string, string][] = [
    ['Event',  '?'],
    ['Site',   'PatzerPro'],
    ['Date',   game?.date ?? '????.??.??'],
    ['White',  game?.white ?? '?'],
    ['Black',  game?.black ?? '?'],
    ['Result', game?.result ?? '*'],
  ];
  if (annotated) headers.push(['Annotator', 'PatzerPro']);
  const headerStr = headers.map(([k, v]) => `[${k} "${v}"]`).join('\n');

  const parts: string[] = [];
  const firstNode = ctrl.root.children[0];
  if (firstNode) {
    parts.push(renderPgnLine(
      firstNode,
      firstNode.id,
      annotated,
      ctrl.root.children.slice(1).map(node => ({ node, path: node.id })),
    ));
  }

  parts.push(game?.result ?? '*');
  return `${headerStr}\n\n${parts.join(' ')}\n`;
}

/**
 * Build a compact PGN string for a specific node list (line/variation).
 * Used by the move-list context menu "Copy PGN" actions.
 * Adapted from lichess-org/lila: ui/analyse/src/pgnExport.ts renderVariationPgn
 *
 * @param nodeList - ordered list of nodes from root through the selected path
 * @param onMainline - true if the path is entirely on the mainline (copy main line vs variation)
 */
export function renderVariationPgn(nodeList: TreeNode[], onMainline: boolean): string {
  const filtered = nodeList.filter(n => n.san);
  if (filtered.length === 0) return '';
  let out = '';
  for (let i = 0; i < filtered.length; i++) {
    const node = filtered[i]!;
    if (node.ply % 2 === 1) {
      // White's move: always emit move number
      out += `${Math.ceil(node.ply / 2)}. `;
    } else if (i === 0) {
      // Variation starting on black's move: emit N...
      out += `${Math.ceil(node.ply / 2)}... `;
    }
    out += `${node.san} `;
  }
  return out.trimEnd();
}

/**
 * True when `path` follows only first-children (mainline) from `root`.
 * Re-exported here so context menu rendering can check mainline status
 * without importing tree/ops directly from main.ts.
 * Mirrors lichess-org/lila: contextMenu.ts onMainline check.
 */
export function isMainlinePath(root: TreeNode, path: TreePath): boolean {
  return pathIsMainline(root, path);
}

/**
 * Copy the PGN for the line ending at `path` to the clipboard.
 * Mirrors lichess-org/lila: contextMenu.ts clipboard copy action.
 */
export function copyLinePgn(path: TreePath): void {
  const ctrl       = _getCtrl();
  const nodes      = nodeListAt(ctrl.root, path);
  const onMainline = isMainlinePath(ctrl.root, path);
  const text       = renderVariationPgn(nodes, onMainline);
  navigator.clipboard.writeText(text).catch(() => {});
}

export function downloadPgn(annotated: boolean): void {
  const pgn            = buildPgn(annotated);
  const importedGames  = _getImportedGames();
  const selectedGameId = _getSelectedGameId();
  const game           = importedGames.find(g => g.id === selectedGameId);
  const w              = (game?.white ?? 'White').replace(/\s+/g, '_');
  const b              = (game?.black ?? 'Black').replace(/\s+/g, '_');
  const suffix         = annotated ? '_annotated' : '';
  const filename       = `${w}_vs_${b}${suffix}.pgn`;

  const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  _redraw();
}

function formatReviewPositionProgress(done: number, total: number): string | null {
  if (total <= 0) return null;
  const analyzed = Math.min(Math.max(0, done), total);
  return `${analyzed}/${total} positions analyzed`;
}

function renderReviewProgressLabel(label: string): VNode {
  return h('span.review-progress-label', [
    h('span.review-progress-label__text', label),
  ]);
}

function enqueueSelectedGameForReview(): boolean {
  const selectedGameId = _getSelectedGameId();
  const game = selectedGameId
    ? _getImportedGames().find(candidate => candidate.id === selectedGameId)
    : undefined;
  if (!game) return false;
  enqueueAtFront([game], reviewDepth);
  return true;
}

function selectedGameReviewProgress(): { active: boolean; done: number; total: number } {
  const selectedGameId = _getSelectedGameId();
  const summary = getQueueSummary();
  if (!selectedGameId || summary.currentGameId !== selectedGameId || !summary.running) {
    return { active: false, done: 0, total: 0 };
  }
  return {
    active: true,
    done:   summary.positionsAnalyzed,
    total:  summary.totalPositions,
  };
}

export function renderAnalysisControls(extraButtons?: VNode[]): VNode {
  const ctrl           = _getCtrl();
  const selectedGameId = _getSelectedGameId();
  const hasGame        = ctrl.mainline.length > 1;

  // Review button label and behavior change based on state.
  // Mirrors the single-action pattern in Lichess analysis controls.
  let reviewLabel: string;
  let reviewTitle: string;
  const reviewProgress = selectedGameReviewProgress();
  const runningProgressLabel = reviewProgress.active
    ? formatReviewPositionProgress(reviewProgress.done, reviewProgress.total)
    : null;
  if (reviewProgress.active) {
    reviewLabel = reviewProgress.total > 0
      ? `${Math.min(Math.max(0, reviewProgress.done), reviewProgress.total)}/${reviewProgress.total}`
      : 'Reviewing…';
    reviewTitle = 'Analysis in progress — click to pause';
  } else if (analysisComplete) {
    reviewLabel = 'Re-analyze';
    reviewTitle = 'Clear previous analysis and run again';
  } else {
    reviewLabel = 'Review';
    reviewTitle = 'Analyze this game to detect mistakes and blunders';
  }

  const reviewClick = () => {
    if (reviewProgress.active) {
      pauseBulkReview();
      _redraw();
      return;
    }
    if (analysisComplete) {
      // Re-analyze: clear persisted data and batch state.
      if (selectedGameId) _clearGameAnalysis(selectedGameId);
      clearPuzzleCandidates();
      resetReviewStatusRuntime();
      syncArrow();
    }
    // Always clear the eval cache before starting a review.
    // The live analysis engine may have populated it at shallow depth; those
    // values would be reused as-is (skipped in the batch queue), causing the
    // accuracy formula to operate on noisy low-depth evals and inflate scores.
    clearEvalCache();
    resetCurrentEval();
    if (!enqueueSelectedGameForReview()) {
      console.warn('[review-button] no selected imported game available for priority review enqueue');
    }
    _redraw();
  };

  // Status line: shown only while analysis is running so the user understands
  // the compact count in the button and how many positions have been analyzed.
  // Mirrors the inline completion indicator in Lichess retro mode controls.
  const statusLine = reviewProgress.active && runningProgressLabel
    ? h('div.analyse-review-controls__status', [
        renderReviewProgressLabel(runningProgressLabel),
      ])
    : null;



  const hintText = !reviewProgress.active && !analysisComplete && hasGame
    ? h('span.analyse-review-controls__hint', 'Stockfish finds your mistakes and blunders')
    : null;

  return h('div.analyse-review-controls', [
    h('div.analyse-review-controls__row', [
      h('button.btn-review', {
        class: {
          'btn-review--complete': analysisComplete,
          'btn-review--primary':  !reviewProgress.active && !analysisComplete && hasGame,
        },
        attrs: { disabled: !hasGame, title: reviewTitle },
        on: { click: reviewClick },
      }, reviewLabel),
      hintText,
      ...(extraButtons ?? []),
    ]),
    statusLine,
  ]);
}
