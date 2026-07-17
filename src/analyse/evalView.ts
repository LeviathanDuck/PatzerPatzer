// Evaluation display: eval bar, eval graph, analysis summary.
// Adapted from lichess-org/lila: ui/analyse/src/view/ and ui/chart/src/acpl.ts

import { h, type VNode } from 'snabbdom';
import { evalWinChances, type MoveLabel } from '../engine/winchances';
import { getEvalCacheRevision } from '../engine/ctrl';
import { labelForReviewEval } from './deepenedEval';
import {
  getEvalGraphGuides,
  getEvalGraphRingMarker,
  getEvalGraphTheme,
  getEvalGraphTooltip,
  resetEvalGraphSettingsRuntimeForDataManagement,
  type EvalGraphTheme,
} from './graphSettings';
import type { TreeNode } from '../tree/types';
import type { ReviewEngineMetadata } from '../idb/index';
import { controlExplainerAttrs } from '../ui/controlExplainer';
import { requestAdvancedAppearance } from '../appearance/entryPoints';

// Local structural type for evalCache entries — matches PositionEval shape.
// Using a structural type keeps this module free of the PositionEval declaration
// until that type is extracted to its own module.
// label is present when analysis was saved and restored from IDB; absent during live analysis.
interface EvalEntry {
  cp?:    number;
  mate?:  number;
  best?:  string;
  loss?:  number;
  delta?: number;
  label?: MoveLabel;
  depth?: number;
}
type EvalCache = ReadonlyMap<string, EvalEntry>;

type MoveColor = 'white' | 'black';

// --- Score formatting ---
// Adapted from lichess-org/lila: ui/lib/src/ceval/util.ts renderEval
// Score is always from white's perspective (positive = white winning).

/** Format centipawns as +0.8 / -1.2 / #3 / #-3 / #KO. Matches Lichess renderEval util.
 *  #KO is the terminal-mate case (mate === 0): the position is already checkmated. */
export function formatScore(ev: { cp?: number; mate?: number }): string {
  if (ev.mate !== undefined) {
    if (ev.mate === 0) return '#KO!';
    return `#${ev.mate}`;
  }
  if (ev.cp !== undefined) {
    // Round to 1 decimal, cap at ±99 — mirrors lichess-org/lila: ui/lib/src/ceval/util.ts
    const e = Math.max(Math.min(Math.round(ev.cp / 10) / 10, 99), -99);
    return (e > 0 ? '+' : '') + e.toFixed(1);
  }
  return '…';
}

// --- Analysis accuracy summary ---
// Adapted from lichess-org/lila: modules/analyse/src/main/AccuracyPercent.scala
//
// Per-move accuracy uses the exponential decay curve fit to win-percent loss.
// Game accuracy = (volatility-weighted mean + harmonic mean) / 2.
// Both formulas match Lichess exactly — see AccuracyPercent.scala for derivation.

export interface PlayerSummary {
  accuracy:     number | null;
  blunders:     number;
  mistakes:     number;
  inaccuracies: number;
}

export interface AnalysisSummary {
  white: PlayerSummary;
  black: PlayerSummary;
}

/**
 * Per-move accuracy from a win-percent diff (mover's perspective).
 * diff > 0 = mover lost advantage; diff < 0 = mover improved.
 * Matches lichess-org/lila: modules/analyse/src/main/AccuracyPercent.scala fromWinPercentDiff
 */
function moveAccuracyFromDiff(diff: number): number {
  if (diff < 0) return 100; // improvement → perfect
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * diff) + -3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1));
}

function standardDeviation(values: readonly number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function scoreAsCp(ev: EvalEntry): number | null {
  if (ev.cp !== undefined) return ev.cp;
  if (ev.mate !== undefined) {
    // Lichess gameAccuracy uses Eval.forceAsCp before WinPercent conversion:
    // mate scores become extreme cp values, then WinPercent clamps them.
    return ev.mate < 0 ? Number.MIN_SAFE_INTEGER - ev.mate : Number.MAX_SAFE_INTEGER - ev.mate;
  }
  return null;
}

function scoreToWinPercent(ev: EvalEntry): number | null {
  const cp = scoreAsCp(ev);
  if (cp === null) return null;
  const wc = evalWinChances({ cp });
  return wc === undefined ? null : (wc + 1) / 2 * 100;
}

/**
 * Aggregate per-move accuracy into a game accuracy figure for one side.
 * Mirrors lichess-org/lila: modules/analyse/src/main/AccuracyPercent.scala gameAccuracy.
 */
function aggregateAccuracy(
  accs: readonly { accuracy: number; color: MoveColor }[],
  allWinPercents: readonly number[],
  color: MoveColor,
): number | null {
  const colorAccs = accs.filter(acc => acc.color === color);
  if (colorAccs.length === 0) return null;

  const n = accs.length;
  const cpCount = Math.max(0, allWinPercents.length - 1);
  const window = Math.max(2, Math.min(8, Math.floor(cpCount / 10)));

  // Lichess prepends repeated opening windows before the normal sliding windows so the first
  // moves get volatility weights even when the window is larger than the early prefix.
  const weights: number[] = [];
  const repeatedOpeningWindows = Math.max(0, Math.min(window, allWinPercents.length) - 2);
  for (let i = 0; i < repeatedOpeningWindows; i++) {
    const slice = allWinPercents.slice(0, window);
    weights.push(Math.max(0.5, Math.min(12, standardDeviation(slice))));
  }
  for (let s = 0; s + window <= allWinPercents.length; s++) {
    const slice = allWinPercents.slice(s, s + window);
    weights.push(Math.max(0.5, Math.min(12, standardDeviation(slice))));
  }

  // Lichess zip truncates to the shorter sequence.
  let weightedSum = 0;
  let totalWeight = 0;
  const colorWeightedAccs: number[] = [];
  for (let i = 0; i < accs.length && i < weights.length; i++) {
    const acc = accs[i]!;
    if (acc.color !== color) continue;
    const weight = weights[i]!;
    weightedSum += acc.accuracy * weight;
    totalWeight += weight;
    colorWeightedAccs.push(acc.accuracy);
  }
  if (colorWeightedAccs.length === 0 || totalWeight <= 0) return null;
  const weightedMean = totalWeight > 0 ? weightedSum / totalWeight : 0;

  const harmonicMean = colorAccs.length
    / colorAccs.reduce((acc, a) => acc + 1 / Math.max(a.accuracy, 0.001), 0);

  return Math.max(0, Math.min(100, (weightedMean + harmonicMean) / 2));
}

export function computeLichessStyleGameAccuracy(
  scores: readonly EvalEntry[],
  startColor: MoveColor = 'white',
): { white: number; black: number } | null {
  const allWinPercents = [{ cp: 15 }, ...scores]
    .map(scoreToWinPercent)
    .filter((wp): wp is number => wp !== null);
  if (allWinPercents.length < 3) return null;

  const accs: { accuracy: number; color: MoveColor }[] = [];
  for (let i = 0; i + 1 < allWinPercents.length; i++) {
    const prev = allWinPercents[i]!;
    const next = allWinPercents[i + 1]!;
    const whiteTurn = (i % 2 === 0) === (startColor === 'white');
    const color: MoveColor = whiteTurn ? 'white' : 'black';
    const before = whiteTurn ? prev : next;
    const after = whiteTurn ? next : prev;
    accs.push({ accuracy: moveAccuracyFromDiff(before - after), color });
  }

  const white = aggregateAccuracy(accs, allWinPercents, 'white');
  const black = aggregateAccuracy(accs, allWinPercents, 'black');
  if (white === null || black === null) return null;
  return { white, black };
}
























interface SummaryCacheEntry {
  root:         TreeNode | undefined;
  leaf:         TreeNode | undefined;
  length:       number;
  evalRev:      number;
  reviewEngine: ReviewEngineMetadata | undefined;
  result:       AnalysisSummary | null;
}
let summaryCache: SummaryCacheEntry | null = null;

export function computeAnalysisSummary(
  mainline:  TreeNode[],
  evalCache: EvalCache,
  reviewEngine?: ReviewEngineMetadata,
): AnalysisSummary | null {
  const root    = mainline[0];
  const leaf    = mainline[mainline.length - 1];
  const evalRev = getEvalCacheRevision();

  const cached = summaryCache;
  if (
    cached &&
    cached.root === root &&
    cached.leaf === leaf &&
    cached.length === mainline.length &&
    cached.evalRev === evalRev &&
    cached.reviewEngine === reviewEngine
  ) {
    return cached.result;
  }

  const result = computeAnalysisSummaryUncached(mainline, evalCache, reviewEngine);
  summaryCache = { root, leaf, length: mainline.length, evalRev, reviewEngine, result };
  return result;
}

function computeAnalysisSummaryUncached(
  mainline:  TreeNode[],
  evalCache: EvalCache,
  reviewEngine?: ReviewEngineMetadata,
): AnalysisSummary | null {
  if (evalCache.size === 0) return null;

  const accuracyScores: EvalEntry[] = [];
  let wBlunders = 0, wMistakes = 0, wInaccuracies = 0;
  let bBlunders = 0, bMistakes = 0, bInaccuracies = 0;

  let path = '';
  for (let i = 1; i < mainline.length; i++) {
    const node = mainline[i]!;
    path += node.id;
    const parentPath = path.slice(0, -2);

    const nodeEval   = evalCache.get(path);
    const parentEval = evalCache.get(parentPath);
    if (nodeEval && scoreAsCp(nodeEval) !== null) accuracyScores.push(nodeEval);
    if (!nodeEval || !parentEval) continue;

    const nodeWc   = evalWinChances(nodeEval);
    const parentWc = evalWinChances(parentEval);
    if (nodeWc === undefined || parentWc === undefined) continue;

    const isWhiteMove = node.ply % 2 === 1;

    const playedBest = node.uci !== undefined && node.uci === parentEval.best;
    const label = labelForReviewEval(nodeEval, playedBest, true, reviewEngine);
    if (isWhiteMove) {
      if (label === 'blunder') wBlunders++;
      else if (label === 'mistake') wMistakes++;
      else if (label === 'inaccuracy') wInaccuracies++;
    } else {
      if (label === 'blunder') bBlunders++;
      else if (label === 'mistake') bMistakes++;
      else if (label === 'inaccuracy') bInaccuracies++;
    }
  }

  const firstMovePly = mainline[1]?.ply;
  const startColor: MoveColor = firstMovePly !== undefined && firstMovePly % 2 === 0 ? 'black' : 'white';
  const accuracy = computeLichessStyleGameAccuracy(accuracyScores, startColor);
  if (!accuracy && wBlunders === 0 && wMistakes === 0 && wInaccuracies === 0 && bBlunders === 0 && bMistakes === 0 && bInaccuracies === 0) return null;

  return {
    white: { accuracy: accuracy?.white ?? null, blunders: wBlunders, mistakes: wMistakes, inaccuracies: wInaccuracies },
    black: { accuracy: accuracy?.black ?? null, blunders: bBlunders, mistakes: bMistakes, inaccuracies: bInaccuracies },
  };
}

export function renderAnalysisSummary(
  analysisComplete: boolean,
  evalCache:        EvalCache,
  mainline:         TreeNode[],
  whiteName:        string,
  blackName:        string,
  reviewEngine?:    ReviewEngineMetadata,
): VNode {
  // Only show once there's enough eval data to be meaningful
  if (!analysisComplete && evalCache.size < 4) return h('div');

  const summary = computeAnalysisSummary(mainline, evalCache, reviewEngine);
  if (!summary) return h('div');

  function playerCol(name: string, data: PlayerSummary, color: 'white' | 'black'): VNode {
    const accText = data.accuracy !== null ? `${Math.round(data.accuracy)}%` : '—';
    const breakdown: VNode[] = [];
    if (data.blunders     > 0) breakdown.push(h('span.summary__blunder',    `${data.blunders} blunder${data.blunders !== 1 ? 's' : ''}`));
    if (data.mistakes     > 0) breakdown.push(h('span.summary__mistake',    `${data.mistakes} mistake${data.mistakes !== 1 ? 's' : ''}`));
    if (data.inaccuracies > 0) breakdown.push(h('span.summary__inaccuracy', `${data.inaccuracies} inaccurac${data.inaccuracies !== 1 ? 'ies' : 'y'}`));
    return h('div.summary__col', [
      h('div.summary__name', [
        h('span.summary__color-icon', { class: { 'summary__color-icon--white': color === 'white', 'summary__color-icon--black': color === 'black' } }),
        name,
      ]),
      h('div.summary__accuracy', accText),
      breakdown.length > 0 ? h('div.summary__breakdown', breakdown) : h('div.summary__breakdown', '—'),
    ]);
  }

  return h('div.analysis-summary-wrap', [
    h('div.analysis-summary', [
      playerCol(whiteName, summary.white, 'white'),
      playerCol(blackName, summary.black, 'black'),
    ]),
  ]);
}

// --- Post-game summary panel ---
// Collapsible panel rendered below the analysis controls.
// Shows per-player accuracy + worst-move info with a navigation link.
// Collapsed/open state persisted in localStorage.

const POST_GAME_PANEL_KEY = 'patzer.postGameSummaryOpen';

function getPostGamePanelOpen(): boolean {
  return localStorage.getItem(POST_GAME_PANEL_KEY) !== 'false';
}

function setPostGamePanelOpen(open: boolean): void {
  localStorage.setItem(POST_GAME_PANEL_KEY, open ? 'true' : 'false');
}

/**
 * Find the path of the move with the highest win-chance loss for the given player color.
 * Returns null if evalCache has no loss data.
 */
function findWorstMovePath(
  mainline:   TreeNode[],
  evalCache:  EvalCache,
  userColor?: 'white' | 'black',
): { path: string; loss: number; ply: number } | null {
  let worstPath: string | null = null;
  let worstLoss = 0;
  let worstPly  = 0;
  let path = '';
  for (let i = 1; i < mainline.length; i++) {
    const node = mainline[i]!;
    path += node.id;
    const isWhiteMove = node.ply % 2 === 1;
    if (userColor === 'white'  && !isWhiteMove) continue;
    if (userColor === 'black'  && isWhiteMove) continue;
    const ev = evalCache.get(path);
    if (ev?.loss !== undefined && ev.loss > worstLoss) {
      worstLoss = ev.loss;
      worstPath = path;
      worstPly  = node.ply;
    }
  }
  return worstPath ? { path: worstPath, loss: worstLoss, ply: worstPly } : null;
}

export function renderPostGameSummaryPanel(
  analysisComplete: boolean,
  evalCache:        EvalCache,
  mainline:         TreeNode[],
  whiteName:        string,
  blackName:        string,
  userColor:        'white' | 'black' | null | undefined,
  navigate:         (path: string) => void,
  redraw:           () => void,
): VNode {
  // Hidden — panel not ready to ship. Re-enable by removing this early return.
  return h('div');
  if (!analysisComplete) return h('div');

  const summary = computeAnalysisSummary(mainline, evalCache);
  if (!summary) return h('div');

  const open = getPostGamePanelOpen();

  // Opening line: first 8 half-moves formatted as "1. e4 e5 2. Nf3 Nc6 …"
  const openingParts: string[] = [];
  for (const node of mainline.slice(1, 9)) {
    const san = node.san;
    if (!san) break;
    if (node.ply % 2 === 1) openingParts.push(`${Math.ceil(node.ply / 2)}. ${san}`);
    else openingParts.push(san!);
  }
  const openingText = openingParts.join(' ');

  // Worst move for user's color (or the side with the worst single blunder overall)
  const worst = findWorstMovePath(mainline, evalCache, userColor ?? undefined);
  const summaryData = summary!;

  // Missed moments: all labeled moves for user's color (or total if no user color)
  const uSummary = userColor === 'black' ? summaryData.black : summaryData.white;
  const missedCount = uSummary.blunders + uSummary.mistakes + uSummary.inaccuracies;

  function playerCol(name: string, data: PlayerSummary, color: 'white' | 'black'): VNode {
    const accText = data.accuracy !== null ? `${Math.round(data.accuracy)}%` : '—';
    const parts: string[] = [];
    if (data.blunders     > 0) parts.push(`${data.blunders} blunder${data.blunders !== 1 ? 's' : ''}`);
    if (data.mistakes     > 0) parts.push(`${data.mistakes} mistake${data.mistakes !== 1 ? 's' : ''}`);
    if (data.inaccuracies > 0) parts.push(`${data.inaccuracies} inaccurac${data.inaccuracies !== 1 ? 'ies' : 'y'}`);
    return h('div.post-game-panel__player', [
      h('div.post-game-panel__player-name', [
        h('span.summary__color-icon', { class: { 'summary__color-icon--white': color === 'white', 'summary__color-icon--black': color === 'black' } }),
        name,
      ]),
      h('div.post-game-panel__player-acc', accText),
      h('div.post-game-panel__player-breakdown', parts.length > 0 ? parts.join(', ') : 'No mistakes'),
    ]);
  }

  const body: (VNode | null)[] = [
    h('div.post-game-panel__players', [
      playerCol(whiteName, summaryData.white, 'white'),
      playerCol(blackName, summaryData.black, 'black'),
    ]),
    openingText ? h('div.post-game-panel__opening', `Opening: ${openingText}`) : null,
    worst
      ? h('div.post-game-panel__worst', [
          'Worst: Move ',
          h('a.post-game-panel__worst-link', {
            attrs: { href: '#', ...controlExplainerAttrs({
              label: `Go to move ${Math.ceil(worst!.ply / 2)}`,
              description: 'Jump to the move with the largest win-chance loss.',
            }) },
            on: { click: (e: MouseEvent) => { e.preventDefault(); navigate(worst!.path); } },
          }, String(Math.ceil(worst!.ply / 2))),
          ` lost ${Math.round(worst!.loss * 100)}% win chance`,
        ])
      : null,
    missedCount > 0
      ? h('div.post-game-panel__missed', `Learn from your mistakes (${missedCount} moment${missedCount !== 1 ? 's' : ''})`)
      : null,
  ];

  return h('div.post-game-panel', [
    h('button.post-game-panel__header', {
      attrs: { type: 'button', ...controlExplainerAttrs({
        label: `${open ? 'Close' : 'Open'} Game Summary`,
        description: 'Show or hide the post-game accuracy and mistake summary.',
      }) },
      on: { click: () => { setPostGamePanelOpen(!open); redraw(); } },
    }, [
      h('span.post-game-panel__title', 'Game Summary'),
      h('span.post-game-panel__toggle', open ? '▲' : '▼'),
    ]),
    open ? h('div.post-game-panel__body', body) : null,
  ]);
}

// --- Eval bar ---
// Adapted from lichess-org/lila: ui/analyse/src/view/ (evaluation bar)

function evalPct(currentEval: { cp?: number; mate?: number }, fen?: string): number {
  if (currentEval.mate !== undefined) {
    if (currentEval.mate === 0) {
      // Terminal mate: the side to move is the checkmated one.
      // Black is to move and checkmated → white wins → 100.
      // White is to move and checkmated → black wins → 0.
      const stm = fen?.split(' ')[1];
      return stm === 'b' ? 100 : 0;
    }
    return currentEval.mate > 0 ? 100 : 0;
  }
  if (currentEval.cp !== undefined) {
    const pct = 50 + currentEval.cp / 20;
    return Math.max(0, Math.min(100, pct));
  }
  return 50;
}

// Tick marks are static — same 8 positions every render.
// Adapted from lichess-org/lila: ui/lib/src/ceval/view/main.ts renderGauge
const EVAL_BAR_TICKS: VNode[] = [...Array(8).keys()].map(i =>
  h(i === 3 ? 'div.eval-bar__tick.zero' : 'div.eval-bar__tick', {
    attrs: { style: `height: ${(i + 1) * 12.5}%` },
  }),
);

// Always rendered so the gauge grid column stays occupied; hidden when engine is off.
// Mirrors lichess-org/lila: ui/analyse/css/_layout.scss .eval-gauge { display: none }
// which is toggled by the gauge-on class on the parent.
export function renderEvalBar(
  engineEnabled: boolean,
  currentEval:   { cp?: number; mate?: number },
  fen?:          string,
): VNode {
  if (!engineEnabled) return h('div.eval-bar.eval-bar--off');

  const pct = evalPct(currentEval, fen);
  // Clamp the score label position so it stays visible near the edges.
  const scorePct = Math.max(8, Math.min(92, pct));
  const hasScore = currentEval.cp !== undefined || currentEval.mate !== undefined;
  const score    = hasScore ? formatScore(currentEval) : '';

  return h('div.eval-bar', [
    h('div.eval-bar__fill', { attrs: { style: `height: ${pct}%` } }),
    score ? h('div.eval-bar__score', { attrs: { style: `bottom: ${scorePct}%` } }, score) : null,
    ...EVAL_BAR_TICKS,
  ]);
}

// --- Evaluation graph ---
// Adapted from lichess-org/lila: ui/chart/src/acpl.ts (concept)
// Pure SVG, no charting library. X = move index, Y = white-perspective win chances.
// Theme finish (mountain/ember/glass) and detail toggles (guides, ring marker, tooltip) are read
// from graphSettings.ts at render time — see renderEvalGraph below.
// Data source: evalCache (same normalized white-perspective values used for move labels).

const GRAPH_W = 600;
const GRAPH_H = 80;
const GRAPH_HEIGHT_MIN = 100;
const GRAPH_HEIGHT_MAX = 300;
const graphHeightRaw = Number.parseInt(localStorage.getItem('patzer.evalGraphHeightPct') ?? '', 10);
let graphHeightPct = Number.isFinite(graphHeightRaw)
  ? Math.min(GRAPH_HEIGHT_MAX, Math.max(GRAPH_HEIGHT_MIN, graphHeightRaw))
  : GRAPH_HEIGHT_MIN;

export function setEvalGraphHeightPct(value: number): void {
  graphHeightPct = Math.min(GRAPH_HEIGHT_MAX, Math.max(GRAPH_HEIGHT_MIN, Math.round(value)));
  localStorage.setItem('patzer.evalGraphHeightPct', String(graphHeightPct));
}

export function resetAnalysisViewSettingsRuntimeForDataManagement(): void {
  graphHeightPct = GRAPH_HEIGHT_MIN;
  evalGraphScrubPointerId = null;
  evalGraphLastScrubPath = null;
  resetEvalGraphSettingsRuntimeForDataManagement();
}

let evalGraphScrubPointerId: number | null = null;
let evalGraphLastScrubPath: string | null = null;

interface BgPt { x: number; y: number; path: string; }

interface Pt {
  x:       number;
  y:       number;
  path:    string;
  label:   MoveLabel | null;
  hasMate: boolean;
  ply:     number;
  san:     string | undefined;
}



const LABEL_DOT_COLORS: Record<MoveLabel, string> = {
  blunder:     'hsl(0,69%,60%)',
  mistake:     'hsl(41,100%,45%)',
  inaccuracy:  'hsl(202,78%,62%)',
};
const MATE_DOT_COLOR = 'hsl(307,80%,70%)';

function dotColorFor(pt: Pt): string {
  if (pt.hasMate) return MATE_DOT_COLOR;
  return pt.label ? LABEL_DOT_COLORS[pt.label] : '#d85000';
}

/** Catmull-Rom → cubic-Bezier path string through `pts`, used by the ember theme for the trace
 *  and fill top edge. Straight-segment rendering elsewhere in the app is untouched. */
function catmullRomPath(pts: readonly { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0]!.x},${pts[0]!.y} L${pts[1]!.x},${pts[1]!.y}`;
  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function renderEvalGraph(
  mainline:    TreeNode[],
  currentPath: string,
  evalCache:   EvalCache,
  navigate:    (p: string) => void,
  redraw:      () => void,
  userColor:   'white' | 'black' | null,
  userOnly:    boolean,
  bg?:         boolean,
  reviewEngine?: ReviewEngineMetadata,
  _evalCacheRevision = 0,
): VNode {
  const n = mainline.length - 1; // non-root move count
  const renderedGraphHeight = Math.round((GRAPH_H * graphHeightPct) / 100);
  // svgH: the Y coordinate range used inside the SVG.
  // In non-bg mode we match the viewBox height to the rendered pixel height so that
  // scaleY = renderedGraphHeight / renderedGraphHeight = 1 — this keeps circle markers
  // circular regardless of graph height. In bg mode the SVG is CSS-sized (height:100%)
  // so we keep the fixed 80-unit coordinate space to preserve its fill geometry.
  const svgH = bg ? GRAPH_H : renderedGraphHeight;

  if (n < 2) {
    // Background mode: render nothing when there is no data — empty transparent div
    if (bg) return h('div.eval-graph.eval-graph--bg');
    return h('div.eval-graph', [
      h('div.eval-graph__empty', {
        attrs: { style: `height:${renderedGraphHeight}px` },
      }, n === 0 ? 'No moves to graph.' : 'Analyze game to see graph.'),
      h('div.eval-graph__resize-handle', {
        attrs: {
          role: 'slider',
          tabindex: '0',
          'aria-label': 'Eval graph height',
          'aria-orientation': 'vertical',
          'aria-valuemin': String(GRAPH_HEIGHT_MIN),
          'aria-valuemax': String(GRAPH_HEIGHT_MAX),
          'aria-valuenow': String(graphHeightPct),
          ...controlExplainerAttrs({
            label: 'Evaluation graph height',
            description: 'Drag vertically or use arrow, Home, and End keys to resize the evaluation graph.',
          }),
        },
        hook: {
          insert: (vnode) => bindEvalGraphResize(vnode.elm as HTMLElement, redraw),
          update: (_old, vnode) => bindEvalGraphResize(vnode.elm as HTMLElement, redraw),
        },
      }),
    ]);
  }

  const shouldShowReviewAnnotation = (nodePly: number): boolean => {
    if (!userOnly || userColor === null) return true;
    const isWhiteMove = nodePly % 2 === 1;
    return (userColor === 'white' && isWhiteMove) || (userColor === 'black' && !isWhiteMove);
  };

  const pts: (Pt | null)[] = [];
  let path = '';
  for (let i = 1; i <= n; i++) {
    const node = mainline[i]!;
    path += node.id;
    const parentPath   = path.slice(0, -2);
    const cached       = evalCache.get(path);
    const parentCached = evalCache.get(parentPath);
    const wc = cached?.mate === 0
      ? (node.fen.split(' ')[1] === 'b' ? 1 : -1)
      : (cached !== undefined ? evalWinChances(cached) : undefined);
    if (wc !== undefined) {
      const playedBest = node.uci !== undefined && node.uci === parentCached?.best;
      const label = !playedBest && shouldShowReviewAnnotation(node.ply)
        ? labelForReviewEval(cached, playedBest, true, reviewEngine)
        : null;
      pts.push({
        x: ((i - 1) / (n - 1)) * GRAPH_W,
        y: ((1 - wc) / 2) * svgH, // wc=+1 → top, wc=0 → middle, wc=−1 → bottom
        path,
        label,
        hasMate: cached?.mate !== undefined,
        ply: node.ply,
        san: node.san,
      });
    } else {
      pts.push(null);
    }
  }

  const valid = pts.filter((p): p is Pt => p !== null);

  if (valid.length < 2) {
    if (bg) return h('div.eval-graph.eval-graph--bg');
    return h('div.eval-graph', [
      h('div.eval-graph__empty', 'Analyze game to see graph.'),
    ]);
  }

  // --- Background (mobile) graph — unchanged hand-rolled SVG implementation. ---
  // Renders behind the mobile controls bar; no pointer interaction (see .eval-graph--bg CSS).
  if (bg) {
    const bgPts: BgPt[] = valid.map(p => ({ x: p.x, y: p.y, path: p.path }));
    const cy = GRAPH_H / 2;
    const svgNodes: VNode[] = [];

    // Center line (eval = 0) — pushed first so it renders behind the fill polygon and trace.
    svgNodes.push(h('line', { attrs: { x1: 0, y1: cy, x2: GRAPH_W, y2: cy, stroke: '#999', 'stroke-width': 1, opacity: '0.6' } }));
    svgNodes.push(h('polygon', { attrs: {
      points: [
        `${bgPts[0]!.x},${GRAPH_H}`,
        ...bgPts.map(p => `${p.x},${p.y}`),
        `${bgPts[bgPts.length - 1]!.x},${GRAPH_H}`,
      ].join(' '),
      fill: 'rgba(255,255,255,0.35)',
      stroke: 'none',
    } }));
    svgNodes.push(h('polyline', { attrs: {
      points: bgPts.map(p => `${p.x},${p.y}`).join(' '),
      fill: 'none',
      stroke: '#d85000',
      'stroke-width': 1.5,
      opacity: '0.5',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    } }));

    const curPt = bgPts.find(p => p.path === currentPath);
    if (curPt) {
      svgNodes.push(h('line', { attrs: {
        x1: curPt.x, y1: 0, x2: curPt.x, y2: GRAPH_H,
        stroke: 'rgba(0,0,0,0.72)', 'stroke-width': 4, opacity: '0.75',
      } }));
      svgNodes.push(h('line', { attrs: {
        x1: curPt.x, y1: 0, x2: curPt.x, y2: GRAPH_H,
        stroke: '#62d8ad', 'stroke-width': 2, opacity: '0.95',
      } }));
    }

    return h('div.eval-graph.eval-graph--bg', [
      h('svg', { attrs: {
        viewBox: `0 0 ${GRAPH_W} ${GRAPH_H}`,
        width: '100%',
        height: '100%',
        preserveAspectRatio: 'none',
      } }, svgNodes),
    ]);
  }


  const theme: EvalGraphTheme = getEvalGraphTheme();
  const guides = getEvalGraphGuides();
  const ringMarker = getEvalGraphRingMarker();
  const tooltipEnabled = getEvalGraphTooltip();
  const hoverColor = theme === 'glass' ? '#d85000' : '#aaa';

  const cy = svgH / 2;
  const svgNodes: VNode[] = [];
  const defs: VNode[] = [];

  const hideHover = (container: Element | null): void => {
    const hl = container?.querySelector('[data-hover]') as SVGLineElement | null;
    if (hl) hl.setAttribute('opacity', '0');
    const tip = container?.querySelector('.eval-graph__tooltip') as HTMLElement | null;
    if (tip) tip.style.opacity = '0';
  };
  const showHover = (container: Element | null, pt: Pt | null): void => {
    const hl = container?.querySelector('[data-hover]') as SVGLineElement | null;
    if (!hl || !pt) return;
    hl.setAttribute('x1', String(pt.x));
    hl.setAttribute('x2', String(pt.x));
    hl.setAttribute('opacity', '0.55');
    if (!tooltipEnabled) return;
    const tip = container?.querySelector('.eval-graph__tooltip') as HTMLElement | null;
    if (!tip) return;
    const turn = Math.ceil(pt.ply / 2);
    const dots = pt.ply % 2 === 1 ? '.' : '…';
    const moveText = `${turn}${dots} ${pt.san ?? ''}`;
    const cached = evalCache.get(pt.path);
    const scoreText = cached ? formatScore(cached) : '';
    tip.textContent = '';
    tip.append(document.createTextNode(`${moveText}  ${scoreText}`));
    if (pt.label) {
      const labelSpan = document.createElement('span');
      labelSpan.textContent = ` ${pt.label[0]!.toUpperCase()}${pt.label.slice(1)}`;
      labelSpan.style.color = LABEL_DOT_COLORS[pt.label];
      tip.appendChild(labelSpan);
    }
    tip.style.opacity = '1';
    const containerEl = container as HTMLElement | null;
    const containerWidth = containerEl?.clientWidth ?? GRAPH_W;
    const rawLeft = (pt.x / GRAPH_W) * containerWidth;
    const tipWidth = tip.offsetWidth || 80;
    const left = Math.max(4, Math.min(containerWidth - tipWidth - 4, rawLeft - tipWidth / 2));
    tip.style.left = `${left}px`;
  };
  const nearestPointForClientX = (svg: SVGSVGElement | null, clientX: number): Pt | null => {
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const graphX = Math.max(0, Math.min(GRAPH_W, ((clientX - rect.left) / rect.width) * GRAPH_W));
    let nearest = valid[0]!;
    let nearestDist = Math.abs(nearest.x - graphX);
    for (let i = 1; i < valid.length; i++) {
      const pt = valid[i]!;
      const dist = Math.abs(pt.x - graphX);
      if (dist < nearestDist) {
        nearest = pt;
        nearestDist = dist;
      }
    }
    return nearest;
  };
  const updateHoverAndMaybeScrub = (target: EventTarget | null, clientX: number, scrub: boolean): void => {
    const svg = target instanceof SVGElement
      ? (target.ownerSVGElement ?? (target as SVGSVGElement))
      : null;
    const pt = nearestPointForClientX(svg, clientX);
    showHover(svg?.parentElement ?? null, pt);
    if (scrub && pt && pt.path !== evalGraphLastScrubPath) {
      evalGraphLastScrubPath = pt.path;
      navigate(pt.path);
    }
  };

  // Bottom-anchored polygon points, shared by mountain/glass (straight segments).
  const polyPts = [
    `${valid[0]!.x},${svgH}`,
    ...valid.map(p => `${p.x},${p.y}`),
    `${valid[valid.length - 1]!.x},${svgH}`,
  ].join(' ');
  const linePts = valid.map(p => `${p.x},${p.y}`).join(' ');

  // --- Guides / centerline (drawn first when off, so it sits behind the fill) ---
  if (!guides) {
    svgNodes.push(h('line', { attrs: { x1: 0, y1: cy, x2: GRAPH_W, y2: cy, stroke: '#999', 'stroke-width': 1, opacity: '1' } }));
  }

  // --- Fill + trace, per theme ---
  if (theme === 'mountain') {
    defs.push(h('linearGradient', {
      attrs: { id: 'eval-graph-mountain-fill', x1: '0', y1: '0', x2: '0', y2: '1' },
    }, [
      h('stop', { attrs: { offset: '0%', 'stop-color': 'rgba(255,255,255,0.92)' } }),
      h('stop', { attrs: { offset: '100%', 'stop-color': 'rgba(255,255,255,0.66)' } }),
    ]));
    svgNodes.push(h('polygon', { attrs: { points: polyPts, fill: 'url(#eval-graph-mountain-fill)', stroke: 'none' } }));
    svgNodes.push(h('polyline', { attrs: {
      points: linePts, fill: 'none', stroke: '#d85000', 'stroke-width': 1.5,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    } }));
  } else if (theme === 'ember') {
    defs.push(h('linearGradient', {
      attrs: { id: 'eval-graph-ember-fill', x1: '0', y1: '0', x2: '0', y2: '1' },
    }, [
      h('stop', { attrs: { offset: '0%', 'stop-color': 'rgba(255,243,233,0.9)' } }),
      h('stop', { attrs: { offset: '100%', 'stop-color': 'rgba(255,243,233,0.6)' } }),
    ]));
    defs.push(h('filter', {
      attrs: { id: 'eval-graph-ember-glow', x: '-20%', y: '-20%', width: '140%', height: '140%' },
    }, [
      h('feGaussianBlur', { attrs: { stdDeviation: '3.2' } }),
    ]));
    const smoothTrace = catmullRomPath(valid);
    const smoothFill = `${smoothTrace} L${valid[valid.length - 1]!.x},${svgH} L${valid[0]!.x},${svgH} Z`;
    svgNodes.push(h('path', { attrs: { d: smoothFill, fill: 'url(#eval-graph-ember-fill)', stroke: 'none' } }));
    svgNodes.push(h('path', { attrs: {
      d: smoothTrace, fill: 'none', stroke: '#d85000', 'stroke-width': 2,
      opacity: '0.65', filter: 'url(#eval-graph-ember-glow)',
    } }));
    svgNodes.push(h('path', { attrs: {
      d: smoothTrace, fill: 'none', stroke: '#d85000', 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    } }));
  } else { // glass
    svgNodes.push(h('polygon', { attrs: { points: polyPts, fill: 'rgba(255,255,255,0.07)', stroke: 'none' } }));
    svgNodes.push(h('polyline', { attrs: {
      points: linePts, fill: 'none', stroke: '#e8e8e8', 'stroke-width': 1.75,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    } }));
  }

  // --- Guides drawn above the fill when enabled ---
  if (guides) {
    const guideTop = ((1 - 0.5) / 2) * svgH;    // wc = +0.5
    const guideBottom = ((1 - -0.5) / 2) * svgH; // wc = -0.5
    svgNodes.push(h('line', { attrs: { x1: 0, y1: guideTop, x2: GRAPH_W, y2: guideTop, stroke: 'rgba(255,255,255,0.06)', 'stroke-width': 1 } }));
    svgNodes.push(h('line', { attrs: { x1: 0, y1: guideBottom, x2: GRAPH_W, y2: guideBottom, stroke: 'rgba(255,255,255,0.06)', 'stroke-width': 1 } }));
    svgNodes.push(h('line', {
      attrs: {
        x1: 0, y1: cy, x2: GRAPH_W, y2: cy,
        stroke: 'rgba(130,130,130,0.55)', 'stroke-width': 1, 'stroke-dasharray': '3 4',
      },
    }));
  }

  // Vertical bar at current move (drawn before dots so dots render on top)
  const curPt = valid.find(p => p.path === currentPath);
  if (curPt) {
    if (ringMarker) {
      svgNodes.push(h('line', { attrs: {
        x1: curPt.x, y1: 0, x2: curPt.x, y2: svgH,
        stroke: '#4a9', 'stroke-width': 1.25, opacity: '0.8',
      } }));
    } else {
      svgNodes.push(h('line', { attrs: {
        x1: curPt.x, y1: 0, x2: curPt.x, y2: svgH,
        stroke: '#4a8', 'stroke-width': 1, opacity: '0.55',
      } }));
    }
  }

  // Hover indicator line
  svgNodes.push(h('line', {
    attrs: {
      'data-hover': '1',
      x1: 0, y1: 0, x2: 0, y2: svgH,
      stroke: hoverColor, 'stroke-width': 1.5, opacity: '0',
      'pointer-events': 'none',
    },
  }));

  // Label dots — only for classified moves (blunder/mistake/inaccuracy) or mate opportunities.
  // The current position renders its own marker below instead of a themed label dot.
  const dotR = theme === 'glass' ? 3.5 : 3;
  for (const pt of valid) {
    if (pt.path === currentPath) continue;
    if (!pt.hasMate && !pt.label) continue;
    svgNodes.push(h('circle', { attrs: {
      cx: pt.x, cy: pt.y,
      r: dotR,
      fill: dotColorFor(pt),
      stroke: '#111',
      'stroke-width': 2,
      'pointer-events': 'none',
    } }));
  }

  // Current-position marker — ring style (on) or original filled-dot style (off).
  if (curPt) {
    if (ringMarker) {
      svgNodes.push(h('circle', { attrs: {
        cx: curPt.x, cy: curPt.y, r: 4, fill: 'none', stroke: '#4a9', 'stroke-width': 2, 'pointer-events': 'none',
      } }));
      svgNodes.push(h('circle', { attrs: {
        cx: curPt.x, cy: curPt.y, r: 1.4, fill: '#fff', stroke: 'none', 'pointer-events': 'none',
      } }));
    } else {
      svgNodes.push(h('circle', { attrs: {
        cx: curPt.x, cy: curPt.y, r: 3.5, fill: '#4a8', stroke: '#fff', 'stroke-width': 1, 'pointer-events': 'none',
      } }));
    }
  }

  // Full-width interaction layer.
  svgNodes.push(h('rect', {
    attrs: { x: 0, y: 0, width: GRAPH_W, height: svgH, fill: 'transparent' },
    on: {
      pointerdown: (e: PointerEvent) => {
        evalGraphScrubPointerId = e.pointerId;
        evalGraphLastScrubPath = currentPath;
        (e.currentTarget as SVGGraphicsElement).setPointerCapture?.(e.pointerId);
        updateHoverAndMaybeScrub(e.currentTarget, e.clientX, true);
        e.preventDefault();
      },
      pointermove: (e: PointerEvent) => {
        updateHoverAndMaybeScrub(e.currentTarget, e.clientX, evalGraphScrubPointerId === e.pointerId);
      },
      pointerup: (e: PointerEvent) => {
        if (evalGraphScrubPointerId === e.pointerId) {
          evalGraphScrubPointerId = null;
          evalGraphLastScrubPath = null;
        }
        (e.currentTarget as SVGGraphicsElement).releasePointerCapture?.(e.pointerId);
      },
      pointercancel: (e: PointerEvent) => {
        if (evalGraphScrubPointerId === e.pointerId) {
          evalGraphScrubPointerId = null;
          evalGraphLastScrubPath = null;
        }
        hideHover((e.currentTarget as SVGGraphicsElement).ownerSVGElement?.parentElement ?? null);
      },
      pointerleave: (e: PointerEvent) => {
        if (evalGraphScrubPointerId !== e.pointerId) hideHover((e.currentTarget as SVGGraphicsElement).ownerSVGElement?.parentElement ?? null);
      },
    },
  }));

  const reviewEngineText = reviewEngine
    ? `${reviewEngine.engineName} · ${reviewEngine.strengthLabel} · depth ${reviewEngine.reviewDepth}`
    : null;

  return h('div.eval-graph', {
    on: {
      mouseleave: (e: MouseEvent) => hideHover(e.currentTarget as Element),
    },
  }, [
    h('button.eval-graph__appearance', {
      attrs: { type: 'button', ...controlExplainerAttrs({
        label: 'Evaluation graph appearance', description: 'Open evaluation graph settings in Advanced Appearance.',
      }) },
      on: { click: (event: Event) => requestAdvancedAppearance('graphs-lists', event.currentTarget as HTMLElement) },
    }, 'Appearance'),
    h('svg', { attrs: {
      // viewBox matches the rendered pixel height so scaleY = 1, keeping circle
      // markers circular at any graph height. scaleX still stretches to fill
      // container width, which is the intended horizontal-fill behavior.
      viewBox: `0 0 ${GRAPH_W} ${svgH}`,
      width: '100%',
      height: renderedGraphHeight,
      preserveAspectRatio: 'none',
    } }, [...(defs.length ? [h('defs', defs)] : []), ...svgNodes]),
    tooltipEnabled ? h('div.eval-graph__tooltip') : null,
    ...(reviewEngineText ? [h('div.eval-graph__review-engine', reviewEngineText)] : []),
    h('div.eval-graph__resize-handle', {
      attrs: {
        role: 'slider',
        tabindex: '0',
        'aria-label': 'Eval graph height',
        'aria-orientation': 'vertical',
        'aria-valuemin': String(GRAPH_HEIGHT_MIN),
        'aria-valuemax': String(GRAPH_HEIGHT_MAX),
        'aria-valuenow': String(graphHeightPct),
        ...controlExplainerAttrs({
          label: 'Evaluation graph height',
          description: 'Drag vertically or use arrow, Home, and End keys to resize the evaluation graph.',
        }),
      },
      hook: {
        insert: (vnode) => bindEvalGraphResize(vnode.elm as HTMLElement, redraw),
        update: (_old, vnode) => bindEvalGraphResize(vnode.elm as HTMLElement, redraw),
      },
    }),
  ]);
}

function bindEvalGraphResize(handle: HTMLElement, redraw: () => void): void {
  if (handle.dataset.bound === 'true') return;
  handle.dataset.bound = 'true';

  type ResizeEvent = MouseEvent | TouchEvent;
  const eventPos = (e: ResizeEvent): [number, number] | undefined => {
    if ('clientX' in e) return [e.clientX, e.clientY];
    if (e.targetTouches?.[0]) return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
    return undefined;
  };

  const startResize = (start: ResizeEvent) => {
    start.preventDefault();
    const startPos = eventPos(start);
    if (!startPos) return;
    const startHeight = graphHeightPct;
    const mousemoveEvent = 'targetTouches' in start ? 'touchmove' : 'mousemove';
    const mouseupEvent = 'targetTouches' in start ? 'touchend' : 'mouseup';

    const resize = (move: Event) => {
      const pos = eventPos(move as ResizeEvent);
      if (!pos) return;
      const delta = pos[1] - startPos[1];
      setEvalGraphHeightPct(startHeight + delta);
      redraw();
    };

    document.body.classList.add('resizing');
    document.addEventListener(mousemoveEvent, resize as EventListener, { passive: false });
    document.addEventListener(mouseupEvent, () => {
      document.removeEventListener(mousemoveEvent, resize as EventListener);
      document.body.classList.remove('resizing');
    }, { once: true });
  };

  handle.addEventListener('mousedown', startResize as EventListener, { passive: false });
  handle.addEventListener('touchstart', startResize as EventListener, { passive: false });
  handle.addEventListener('keydown', (event: KeyboardEvent) => {
    let nextHeight: number;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        nextHeight = graphHeightPct - 1;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        nextHeight = graphHeightPct + 1;
        break;
      case 'Home':
        nextHeight = GRAPH_HEIGHT_MIN;
        break;
      case 'End':
        nextHeight = GRAPH_HEIGHT_MAX;
        break;
      default:
        return;
    }
    event.preventDefault();
    setEvalGraphHeightPct(nextHeight);
    redraw();
  });
}
