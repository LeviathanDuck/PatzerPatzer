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
import { encodeLocalPgnComment, LOCAL_COMMENT_ID, sanitizePgnCommentText } from '../tree/commentIdentity';
import { buildQuestionnaireSummaryComment, serializeQuestionnaireTags } from './questionnaire/model';
import { controlExplainerAttrs, renderDisabledControlExplainer } from '../ui/controlExplainer';

// --- Injected deps ---

let _getCtrl:           () => AnalyseCtrl                        = () => { throw new Error('pgnExport not initialised'); };
let _getImportedGames:  () => ImportedGame[]                     = () => [];
let _getSelectedGameId: () => string | null                      = () => null;
let _clearGameAnalysis: (gameId: string) => void                 = () => {};
let _redraw:            () => void                               = () => {};






let _requestBoardTreeAnalysis: () => boolean                     = () => false;
let _getActiveBoardReviewId:   () => string | null               = () => null;




let _cancelBoardTreeReview:    () => boolean                      = () => false;

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
  const metadataParts: string[] = [];

  const shapeToken = renderShapeTokens(node.shapes);
  if (shapeToken) metadataParts.push(shapeToken);

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
      if (evalToken) metadataParts.push(evalToken);
    }
    if (node.clock !== undefined) {
      const total = Math.round(node.clock / 100);
      const hrs = Math.floor(total / 3600);
      const m   = Math.floor((total % 3600) / 60);
      const s   = total % 60;
      metadataParts.push(`[%clk ${hrs}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`);
    }






    if (node.moveTime !== undefined) {
      const emtToken = makeComment({ emt: node.moveTime / 100 });
      if (emtToken) metadataParts.push(emtToken);
    }
  }

  const commentBlocks: string[] = [];
  if (metadataParts.length > 0) commentBlocks.push(`{ ${metadataParts.join(' ')} }`);
  for (const c of node.comments ?? []) {
    const text = sanitizePgnCommentText(c.text);
    if (!text) continue;
    const persistedText = c.id === LOCAL_COMMENT_ID ? encodeLocalPgnComment(text) : text;
    commentBlocks.push(`{ ${persistedText} }`);
  }
  return commentBlocks.length > 0 ? commentBlocks.join(' ') : null;
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
  requestBoardTreeAnalysis?: () => boolean;
  getActiveBoardReviewId?:   () => string | null;
  cancelBoardTreeReview?:    () => boolean;
}): void {
  _getCtrl           = deps.getCtrl;
  _getImportedGames  = deps.getImportedGames;
  _getSelectedGameId = deps.getSelectedGameId;
  _clearGameAnalysis = deps.clearGameAnalysis;
  _redraw            = deps.redraw;
  if (deps.requestBoardTreeAnalysis) _requestBoardTreeAnalysis = deps.requestBoardTreeAnalysis;
  if (deps.getActiveBoardReviewId)   _getActiveBoardReviewId   = deps.getActiveBoardReviewId;
  if (deps.cancelBoardTreeReview)    _cancelBoardTreeReview    = deps.cancelBoardTreeReview;
}



/**
 * The synthetic id for a board-tree Game Review: `board-review:<page-session-uuid>:<board-generation>`.
 * Identity is NEVER derived solely from PGN/FEN (consult §(a)) — two identical drill trees loaded on
 * separate board generations are distinct board sessions, so the monotonic generation is load-bearing.
 */
export function boardReviewSyntheticId(pageSessionUuid: string, boardGeneration: number): string {
  return `board-review:${pageSessionUuid}:${boardGeneration}`;
}

export interface BoardReviewBindInput {
  /** The active board-review synthetic id, or null when no board-tree review is registered. */
  activeBoardReviewId: string | null;
  /** The board generation captured when the active review was registered. */
  activeGeneration:    number | null;
  /** The current live board/restore generation. */
  currentGeneration:   number;
  /** True only while the captured `ctrl.root` reference is still the live root. */
  capturedRootIsCurrent: boolean;
  /** `AcceptedReviewResult.gameId` — the id the queue tagged this result with. */
  resultGameId:        string;
  /** FEN of the node found at the result's path in the CURRENT tree, or undefined if absent. */
  nodeFenAtResultPath: string | undefined;
  /** `AcceptedReviewResult.fen` — the exact FEN the engine searched. */
  resultFen:           string;
}

/**
 * Whether an accepted board-tree review result may hydrate the foreground display (consult §(b)).
 * ALL of the following must hold, or the result is stale-dropped (mirrors Lichess `onNewCeval`'s
 * `node.fen !== ev.fen → return`):
 *   1. a board-tree review is registered (`activeBoardReviewId !== null`);
 *   2. the result belongs to it (`resultGameId === activeBoardReviewId`);
 *   3. the captured board generation is still current AND the captured root is still live (no board
 *      replacement since the request);
 *   4. the node still exists at the result's path AND its FEN exactly equals the searched FEN.
 * Any mismatch — wrong FEN, replaced root, stale generation, or an old synthetic id — returns false.
 */
export function boardReviewResultBinds(input: BoardReviewBindInput): boolean {
  if (input.activeBoardReviewId === null) return false;
  if (input.resultGameId !== input.activeBoardReviewId) return false;
  if (input.activeGeneration === null) return false;
  if (input.activeGeneration !== input.currentGeneration) return false;
  if (!input.capturedRootIsCurrent) return false;
  if (input.nodeFenAtResultPath === undefined) return false;
  if (input.nodeFenAtResultPath !== input.resultFen) return false;
  return true;
}

// --- PGN building ---
















export function buildPgn(annotated: boolean): string {
  const ctrl           = _getCtrl();
  const importedGames  = _getImportedGames();
  const selectedGameId = _getSelectedGameId();
  const game           = importedGames.find(g => g.id === selectedGameId);

  const headers: [string, string][] = [
    ['Event',  '?'],
    ['Site',   'ChessPatzer'],
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

  if (annotated) headers.push(['Annotator', 'ChessPatzer']);






  if (game?.questionnaire) headers.push(...serializeQuestionnaireTags(game.questionnaire));

  const headerStr = headers.map(([k, v]) => `[${k} "${v}"]`).join('\n');

  // The human-readable { Patzer: ... } summary comment (T1 contract §3's dual-home copy) is
  // emitted immediately before move 1, ahead of the mainline's own move text.
  const parts: string[] = [];





























  const freshSummary = game?.questionnaire ? buildQuestionnaireSummaryComment(game.questionnaire) : undefined;
  const freshSummaryText = freshSummary?.replace(/^\{\s*|\s*\}$/g, '');
  const rootComments = freshSummaryText
    ? (ctrl.root.comments ?? []).filter(c => c.text.trim() !== freshSummaryText)
    : (ctrl.root.comments ?? []);
  const rootComment = renderAnnotatedComment({ ...ctrl.root, comments: rootComments }, '', annotated);
  if (rootComment) parts.push(rootComment);
  if (freshSummary) parts.push(freshSummary);
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
  a.dataset.uiExplainerExempt = 'programmatic-download-node';
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




  if (selectedGameId === null) {
    return _requestBoardTreeAnalysis();
  }
  return enqueueSelectedGameForReview();
}

function selectedGameReviewProgress(): { active: boolean; done: number; total: number } {


  const progressGameId = _getSelectedGameId() ?? _getActiveBoardReviewId();
  const summary = getQueueSummary();
  if (!progressGameId || summary.currentGameId !== progressGameId || !summary.running) {
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




  const runningIsBoardTree = reviewProgress.active && _getSelectedGameId() === null;
  const runningProgressLabel = reviewProgress.active
    ? formatReviewPositionProgress(reviewProgress.done, reviewProgress.total)
    : null;
  if (reviewProgress.active) {
    const percent = reviewProgressPercent(reviewProgress.done, reviewProgress.total);
    reviewTitle = runningIsBoardTree
      ? 'Analyzing this position — click to cancel and discard the in-progress analysis'
      : 'Analysis in progress — click to pause';
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



      if (!_cancelBoardTreeReview()) pauseBulkReview();
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
      hasGame ? h('button.btn-review', {
        class: {
          'btn-review--complete': !reviewProgress.active && analysisComplete,
          'btn-review--primary':  !reviewProgress.active && !analysisComplete && hasGame,
          'btn-review--running':  reviewProgress.active,
        },
        attrs: controlExplainerAttrs({
          label: reviewProgress.active
            ? (runningIsBoardTree ? 'Cancel analysis' : 'Pause analysis')
            : analysisComplete ? 'Re-Analyze game' : 'Analyze game',
          description: reviewTitle,
          // Cancel-and-discard is consequential/destructive → Essential help; pause keeps the
          // default richer-help tier.
          tier: runningIsBoardTree ? 'essential' : 'more-help',
        }),
        on: { click: reviewClick },
      }, reviewContent) : renderDisabledControlExplainer({
        label: 'Analyze game',
        description: 'Load or select a game before analyzing it.',
      }, h('button.btn-review', {
        attrs: { disabled: true, ...controlExplainerAttrs({
          label: 'Analyze game',
          description: reviewTitle,
        }) },
        on: { click: reviewClick },
      }, reviewContent)),
      hintText,
      ...(extraButtons ?? []),
    ]),
    statusLine,
  ]);
}
