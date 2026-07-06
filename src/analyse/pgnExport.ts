// PGN export and analysis review controls.
// Adapted from lichess-org/lila: ui/analyse/src/pgnExport.ts,
// ui/analyse/src/view/controls.ts (review button logic)

import { h, type VNode } from 'snabbdom';
import { INITIAL_FEN } from 'chessops/fen';
import { makeComment, type CommentShape, type CommentShapeColor, type Evaluation } from 'chessops/pgn';
import { parseSquare } from 'chessops/util';
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
import type { Shape, TreeNode, TreePath } from '../tree/types';
import { buildQuestionnaireSummaryComment, serializeQuestionnaireTags } from './questionnaire/model';

// --- Injected deps ---

let _getCtrl:           () => AnalyseCtrl                        = () => { throw new Error('pgnExport not initialised'); };
let _getImportedGames:  () => ImportedGame[]                     = () => [];
let _getSelectedGameId: () => string | null                      = () => null;
let _clearGameAnalysis: (gameId: string) => void                 = () => {};
let _redraw:            () => void                               = () => {};

// Legacy NAG ids the importer renders into node.glyphs ($1-$6); mirrors
// LEGACY_RENDERED_NAG_IDS in src/tree/pgn.ts. Used to avoid double-emitting a NAG
// that is present both as a rendered glyph and as a raw imported nag.
const LEGACY_RENDERED_NAG_IDS = new Set([1, 2, 3, 4, 5, 6]);

/**
 * NAG tokens for a node: authored/rendered glyphs first, then raw imported NAGs that
 * have no rendered-glyph representation. Mirrors the study serializer + import split.
 */
function renderNagTokens(node: TreeNode): string[] {
  const emitted = new Set<number>();
  const tokens: string[] = [];
  for (const g of node.glyphs ?? []) {
    if (emitted.has(g.id)) continue;
    emitted.add(g.id);
    tokens.push(`$${g.id}`);
  }
  for (const id of node.nags ?? []) {
    if (emitted.has(id) || LEGACY_RENDERED_NAG_IDS.has(id)) continue;
    emitted.add(id);
    tokens.push(`$${id}`);
  }
  return tokens;
}

// PGN comment text must not contain braces — strip them like lila's PgnDump sanitizer.
function sanitizeCommentText(text: string): string {
  return text.replace(/[{}]/g, '').trim();
}

// Chessops' 4 standard drawable colors — matches the brush values written by both the
// Study authoring path (src/study/studyDetailView.ts) and PGN import (tree/pgn.ts), so
// only an unrecognized/missing brush needs a fallback (mirrors the 'green' default used
// at those same call sites).
const SHAPE_COLORS = new Set<CommentShapeColor>(['green', 'red', 'yellow', 'blue']);

function toCommentShapeColor(brush: string | undefined): CommentShapeColor {
  return brush !== undefined && SHAPE_COLORS.has(brush as CommentShapeColor)
    ? (brush as CommentShapeColor)
    : 'green';
}

/**
 * Converts a Patzer Shape (square-name orig/dest, e.g. "e2") to a chessops
 * CommentShape (numeric squares, to===from encodes a %csl circle) so
 * makeComment() can format it. Returns undefined for an unparseable square.
 */
function treeShapeToCommentShape(shape: Shape): CommentShape | undefined {
  const from = parseSquare(shape.orig);
  if (from === undefined) return undefined;
  const to = shape.dest !== undefined ? parseSquare(shape.dest) : from;
  if (to === undefined) return undefined;
  return { color: toCommentShapeColor(shape.brush), from, to };
}

/**
 * %csl/%cal tokens for a node's shapes, built via chessops' own makeComment().
 * Emitted in BOTH plain and annotated modes — arrows/circles are user content
 * (drawn during Study authoring or carried in from an imported PGN), not engine
 * synthesis. Phase 2 T1 persistence/portability contract §4.
 */
function renderShapeTokens(shapes: Shape[] | undefined): string {
  if (!shapes || shapes.length === 0) return '';
  const converted = shapes
    .map(treeShapeToCommentShape)
    .filter((s): s is CommentShape => s !== undefined);
  return converted.length > 0 ? makeComment({ shapes: converted }) : '';
}

/**
 * Comment block for a node. User comments and shapes are always emitted (they are
 * part of the game record / user content and must survive Save-to-Library, which
 * exports in plain mode); [%eval]/[%clk] synthesis is annotated-mode only.
 */
function renderAnnotatedComment(node: TreeNode, path: TreePath, annotated: boolean): string | null {
  const commentParts: string[] = [];

  const shapeToken = renderShapeTokens(node.shapes);
  if (shapeToken) commentParts.push(shapeToken);

  if (annotated) {
    const ev = evalCache.get(path);
    // Live evalCache value wins when present; otherwise fall back to the imported
    // [%eval] commentary so it survives round-trips instead of vanishing.
    // Phase 2 T1 contract §4 / BUG-2026-07-05-018.
    const evaluation: Evaluation | undefined =
      ev?.mate !== undefined ? { mate: ev.mate } :
      ev?.cp   !== undefined ? { pawns: ev.cp / 100 } :
      node.importedEval;
    if (evaluation) {
      const evalToken = makeComment({ evaluation });
      if (evalToken) commentParts.push(evalToken);
    }
    if (node.clock !== undefined) {
      const total = Math.round(node.clock / 100);
      const hrs = Math.floor(total / 3600);
      const m   = Math.floor((total % 3600) / 60);
      const s   = total % 60;
      commentParts.push(`[%clk ${hrs}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`);
    }
  }
  for (const c of node.comments ?? []) {
    const text = sanitizeCommentText(c.text);
    if (text) commentParts.push(text);
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

    // NAG tokens ($N) between the move and its comment block — standard PGN order,
    // mirrors serializeStudyNode in src/study/studyDetailCtrl.ts.
    const nagTokens = renderNagTokens(node);
    parts.push(...nagTokens);

    const comment = renderAnnotatedComment(node, path, annotated);
    if (comment) parts.push(comment);

    // A RAV is an alternative to the move that PRECEDES it, so variations must be
    // emitted after the mainline move they replace ("1. e4 e5 (1... c5)"), never
    // before it — chessops silently drops variations emitted ahead of the reply.
    const flushedVariations = pendingSiblingVariations;
    for (const variation of flushedVariations) {
      parts.push(`(${renderPgnLine(variation.node, variation.path, annotated)})`);
    }
    // Queue this node's side lines: they are alternatives to node.children[0] and are
    // flushed right after that move is emitted on the next iteration.
    pendingSiblingVariations = node.children
      .slice(1)
      .map(child => ({ node: child, path: path + child.id }));

    // Any annotation or variation between moves means the following black move
    // restates its number.
    needsMoveNum =
      (comment !== null || nagTokens.length > 0 || flushedVariations.length > 0)
        ? isWhite
        : false;

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
















export function buildPgn(annotated: boolean): string {
  const ctrl           = _getCtrl();
  const importedGames  = _getImportedGames();
  const selectedGameId = _getSelectedGameId();
  const game           = importedGames.find(g => g.id === selectedGameId);

  const headers: [string, string][] = [
    ['Event',  '?'],
    ['Site',   'PatzerPro'],
    ['Date',   game?.date ?? '????.??.??'],
    ['Round',  '?'],
    ['White',  game?.white ?? '?'],
    ['Black',  game?.black ?? '?'],
    ['Result', game?.result ?? '*'],
  ];

  // [FEN] + [SetUp "1"] are MANDATORY and unconditional whenever the tree's root
  // position is not the standard start — omitting them is round-trip-breaking
  // (BUG-2026-07-05-017): re-importing the exported PGN would silently replay
  // from the standard start instead of the actual root position.
  const rootFen = ctrl.root.fen;
  if (rootFen !== INITIAL_FEN) {
    headers.push(['FEN', rootFen], ['SetUp', '1']);
  }

  if (game?.eco)         headers.push(['ECO', game.eco]);
  if (game?.opening)     headers.push(['Opening', game.opening]);
  if (game?.timeControl) headers.push(['TimeControl', game.timeControl]);
  if (game?.whiteRating) headers.push(['WhiteElo', String(game.whiteRating)]);
  if (game?.blackRating) headers.push(['BlackElo', String(game.blackRating)]);
  if (game?.termination) headers.push(['Termination', game.termination]);

  if (annotated) headers.push(['Annotator', 'PatzerPro']);






  if (game?.questionnaire) headers.push(...serializeQuestionnaireTags(game.questionnaire));

  const headerStr = headers.map(([k, v]) => `[${k} "${v}"]`).join('\n');

  // The human-readable { Patzer: ... } summary comment (T1 contract §3's dual-home copy) is
  // emitted immediately before move 1, ahead of the mainline's own move text.
  const parts: string[] = [];
  if (game?.questionnaire) parts.push(buildQuestionnaireSummaryComment(game.questionnaire));
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

// Percent for the running-state meter (approved redesign 2026-07-05, underboard round 3):
// mirrors the games-list `.grr__review--running` percent derivation (done/total, clamped).
function reviewProgressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (done / total) * 100)));
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

export function requestSelectedGameAnalysis(): boolean {
  const selectedGameId = _getSelectedGameId();
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
  return enqueueSelectedGameForReview();
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
  const hasGame        = ctrl.mainline.length > 1;

  // Review button content/behavior changes based on state (approved redesign 2026-07-05,
  // underboard round 3: ghost Analyze -> underline-meter Analyzing -> dimmer ghost Re-analyze).
  // Mirrors the single-action pattern in Lichess analysis controls.
  let reviewTitle: string;
  let reviewContent: (VNode | string)[];
  const reviewProgress = selectedGameReviewProgress();
  const runningProgressLabel = reviewProgress.active
    ? formatReviewPositionProgress(reviewProgress.done, reviewProgress.total)
    : null;
  if (reviewProgress.active) {
    const percent = reviewProgressPercent(reviewProgress.done, reviewProgress.total);
    reviewTitle = 'Analysis in progress — click to pause';
    reviewContent = [
      h('span.btn-review__bolt.--breathing', '⚡'),
      h('span.btn-review__label', ['Analyzing · ', h('span.btn-review__pct', `${percent}%`)]),
      h('div.btn-review__fill', { style: { width: `${percent}%` } }),
    ];
  } else if (analysisComplete) {
    // Re-run composite icon (arc + small bolt): the bolt marks it as an engine action, the arc
    // marks re-run. Title mentions it replaces the stored review per the approved spec.
    reviewTitle = 'Re-analyze this game — replaces the stored review';
    reviewContent = [
      h('span.btn-review__icon', ['↻', h('span.btn-review__icon-bolt', '⚡')]),
      h('span.btn-review__label', ' Re-analyze'),
    ];
  } else {
    reviewTitle = 'Analyze this game to detect mistakes and blunders';
    reviewContent = [
      h('span.btn-review__bolt', '⚡'),
      h('span.btn-review__label', ' Analyze'),
    ];
  }

  const reviewClick = () => {
    if (reviewProgress.active) {
      pauseBulkReview();
      _redraw();
      return;
    }
    if (!requestSelectedGameAnalysis()) {
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
          'btn-review--complete': !reviewProgress.active && analysisComplete,
          'btn-review--primary':  !reviewProgress.active && !analysisComplete && hasGame,
          'btn-review--running':  reviewProgress.active,
        },
        attrs: { disabled: !hasGame, title: reviewTitle },
        on: { click: reviewClick },
      }, reviewContent),
      hintText,
      ...(extraButtons ?? []),
    ]),
    statusLine,
  ]);
}
