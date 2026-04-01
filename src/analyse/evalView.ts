// Evaluation display: eval bar, eval graph, analysis summary.
// Adapted from lichess-org/lila: ui/analyse/src/view/ and ui/chart/src/acpl.ts

import { h, type VNode } from 'snabbdom';
import { classifyLoss, evalWinChances, type MoveLabel } from '../engine/winchances';
import type { TreeNode } from '../tree/types';

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
}
type EvalCache = ReadonlyMap<string, EvalEntry>;

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

/**
 * Aggregate per-move accuracy into a game accuracy figure.
 * Matches lichess-org/lila: modules/analyse/src/main/AccuracyPercent.scala gameAccuracy.
 * window = max(2, min(8, floor(n/10)));  weights = stdDev per sliding window, clamped [0.5, 12].
 * Result = (volatility-weighted mean + harmonic mean) / 2, clamped [0, 100].
 */
function aggregateAccuracy(accs: number[]): number | null {
  const n = accs.length;
  if (n < 2) return null;

  const window = Math.max(2, Math.min(8, Math.floor(n / 10)));

  // Sliding window std devs — moves.sliding(window) in Lichess produces n-window+1 entries.
  const weights: number[] = [];
  for (let s = 0; s + window <= n; s++) {
    const slice = accs.slice(s, s + window);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    weights.push(Math.max(0.5, Math.min(12, Math.sqrt(variance))));
  }

  // Lichess zip truncates to the shorter sequence (n - window + 1 pairs)
  const pairLen = weights.length;
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < pairLen; i++) {
    weightedSum += accs[i]! * weights[i]!;
    totalWeight += weights[i]!;
  }
  const weightedMean = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Harmonic mean uses all n moves (Lichess: moves.size / moves.map(1/a).sum)
  const harmonicMean = n / accs.reduce((acc, a) => acc + 1 / Math.max(a, 0.001), 0);

  return Math.max(0, Math.min(100, (weightedMean + harmonicMean) / 2));
}

export function computeAnalysisSummary(
  mainline:  TreeNode[],
  evalCache: EvalCache,
): AnalysisSummary | null {
  if (evalCache.size === 0) return null;

  const whiteAccs: number[] = [];
  const blackAccs: number[] = [];
  let wBlunders = 0, wMistakes = 0, wInaccuracies = 0;
  let bBlunders = 0, bMistakes = 0, bInaccuracies = 0;

  let path = '';
  for (let i = 1; i < mainline.length; i++) {
    const node = mainline[i]!;
    path += node.id;
    const parentPath = path.slice(0, -2);

    const nodeEval   = evalCache.get(path);
    const parentEval = evalCache.get(parentPath);
    if (!nodeEval || !parentEval) continue;

    const nodeWc   = evalWinChances(nodeEval);
    const parentWc = evalWinChances(parentEval);
    if (nodeWc === undefined || parentWc === undefined) continue;

    // Convert win-chance [-1,1] → win-percent [0,100] (white perspective)
    const nodeWp   = (nodeWc   + 1) / 2 * 100;
    const parentWp = (parentWc + 1) / 2 * 100;

    const isWhiteMove = node.ply % 2 === 1;

    // diff = mover's advantage before move - mover's advantage after move
    // White: loses advantage when nodeWp < parentWp → diff = parentWp - nodeWp
    // Black: loses advantage when nodeWp > parentWp → diff = nodeWp - parentWp
    // Matches lichess-org/lila: AccuracyPercent.scala color.fold((prev,next),(next,prev))
    const diff = isWhiteMove ? (parentWp - nodeWp) : (nodeWp - parentWp);
    const acc  = moveAccuracyFromDiff(diff);

    if (isWhiteMove) {
      whiteAccs.push(acc);
    } else {
      blackAccs.push(acc);
    }

    // Count move labels using the same best-move-played short-circuit as renderMoveList.
    // Prefer stored review annotation (hydrated from IDB) over classifyLoss(loss) recomputation.
    // Falls back to classifyLoss(loss) for live analysis and older records without label.
    const playedBest = node.uci !== undefined && node.uci === parentEval.best;
    const label = !playedBest
      ? (nodeEval.label ?? (nodeEval.loss !== undefined ? classifyLoss(nodeEval.loss) : null))
      : null;
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

  if (whiteAccs.length === 0 && blackAccs.length === 0) return null;

  return {
    white: { accuracy: aggregateAccuracy(whiteAccs), blunders: wBlunders, mistakes: wMistakes, inaccuracies: wInaccuracies },
    black: { accuracy: aggregateAccuracy(blackAccs), blunders: bBlunders, mistakes: bMistakes, inaccuracies: bInaccuracies },
  };
}

export function renderAnalysisSummary(
  analysisComplete: boolean,
  evalCache:        EvalCache,
  mainline:         TreeNode[],
  whiteName:        string,
  blackName:        string,
): VNode {
  // Only show once there's enough eval data to be meaningful
  if (!analysisComplete && evalCache.size < 4) return h('div');

  const summary = computeAnalysisSummary(mainline, evalCache);
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

  return h('div.analysis-summary', [
    playerCol(whiteName, summary.white, 'white'),
    playerCol(blackName, summary.black, 'black'),
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
  _analysisComplete: boolean,
  _evalCache:        EvalCache,
  _mainline:         TreeNode[],
  _whiteName:        string,
  _blackName:        string,
  _userColor:        'white' | 'black' | null | undefined,
  _navigate:         (path: string) => void,
  _redraw:           () => void,
): VNode {
  // Temporarily hidden — panel will be redesigned with more useful content.
  return h('div');
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
// Data source: evalCache (same normalized white-perspective values used for labels).

const GRAPH_W = 600;
const GRAPH_H = 80;
const GRAPH_HEIGHT_MIN = 100;
const GRAPH_HEIGHT_MAX = 300;
let evalGraphScrubPointerId: number | null = null;
let evalGraphLastScrubPath: string | null = null;
const graphHeightRaw = Number.parseInt(localStorage.getItem('patzer.evalGraphHeightPct') ?? '', 10);
let graphHeightPct = Number.isFinite(graphHeightRaw)
  ? Math.min(GRAPH_HEIGHT_MAX, Math.max(GRAPH_HEIGHT_MIN, graphHeightRaw))
  : GRAPH_HEIGHT_MIN;

export function setEvalGraphHeightPct(value: number): void {
  graphHeightPct = Math.min(GRAPH_HEIGHT_MAX, Math.max(GRAPH_HEIGHT_MIN, Math.round(value)));
  localStorage.setItem('patzer.evalGraphHeightPct', String(graphHeightPct));
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
          title: 'Drag to resize eval graph',
          role: 'slider',
          'aria-label': 'Eval graph height',
          'aria-valuemin': String(GRAPH_HEIGHT_MIN),
          'aria-valuemax': String(GRAPH_HEIGHT_MAX),
          'aria-valuenow': String(graphHeightPct),
        },
        hook: {
          insert: (vnode) => bindEvalGraphResize(vnode.elm as HTMLElement, redraw),
          update: (_old, vnode) => bindEvalGraphResize(vnode.elm as HTMLElement, redraw),
        },
      }),
    ]);
  }

  interface Pt { x: number; y: number; path: string; label: MoveLabel | null; hasMate: boolean; }

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
      // Prefer stored review annotation (hydrated from IDB) over classifyLoss(loss) recomputation.
      // cached is defined here (wc !== undefined requires it). Falls back gracefully for live analysis.
      const label = !playedBest && shouldShowReviewAnnotation(node.ply)
        ? (cached!.label ?? (cached!.loss !== undefined ? classifyLoss(cached!.loss) : null))
        : null;
      pts.push({
        x: ((i - 1) / (n - 1)) * GRAPH_W,
        y: ((1 - wc) / 2) * svgH, // wc=+1 → top, wc=0 → middle, wc=−1 → bottom
        path,
        label,
        hasMate: cached?.mate !== undefined,
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

  const cy = svgH / 2;
  const svgNodes: VNode[] = [];
  const hideHover = (svg: SVGSVGElement | null): void => {
    const hl = svg?.querySelector('[data-hover]') as SVGLineElement | null;
    if (hl) hl.setAttribute('opacity', '0');
  };
  const showHover = (svg: SVGSVGElement | null, pt: Pt | null): void => {
    const hl = svg?.querySelector('[data-hover]') as SVGLineElement | null;
    if (!hl || !pt) return;
    hl.setAttribute('x1', String(pt.x));
    hl.setAttribute('x2', String(pt.x));
    hl.setAttribute('opacity', '0.55');
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
    showHover(svg, pt);
    if (scrub && pt && pt.path !== evalGraphLastScrubPath) {
      evalGraphLastScrubPath = pt.path;
      navigate(pt.path);
    }
  };

  // Follow-up parity refinement: render White territory as a fill rising from the
  // bottom of the chart to the eval line, matching the intended Lichess-style read.
  // This keeps the interaction model intact while removing the center-origin look.
  const polyPts = [
    `${valid[0]!.x},${svgH}`,
    ...valid.map(p => `${p.x},${p.y}`),
    `${valid[valid.length - 1]!.x},${svgH}`,
  ].join(' ');

  // Center line (eval = 0) — pushed first so it renders behind the fill polygon and trace.
  svgNodes.push(h('line', { attrs: { x1: 0, y1: cy, x2: GRAPH_W, y2: cy, stroke: '#999', 'stroke-width': 1, opacity: bg ? '0.6' : '1' } }));

  svgNodes.push(h('polygon', {
    attrs: {
      points: polyPts,
      fill: bg ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)',
      stroke: 'none',
    },
  }));

  // Eval trace
  svgNodes.push(h('polyline', { attrs: {
    points: valid.map(p => `${p.x},${p.y}`).join(' '),
    fill: 'none',
    stroke: '#d85000',
    'stroke-width': bg ? 1.5 : 1,
    opacity: bg ? '0.5' : '1',
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  } }));

  // Vertical bar at current move (drawn before dots so dots render on top)
  const curPt = valid.find(p => p.path === currentPath);
  if (curPt) {
    svgNodes.push(h('line', { attrs: {
      x1: curPt.x, y1: 0, x2: curPt.x, y2: svgH,
      stroke: '#4a8', 'stroke-width': 1, opacity: '0.55',
    } }));
  }

  // Hover indicator line and dots — skipped in background mode (no interaction).
  if (!bg) svgNodes.push(h('line', {
    attrs: {
      'data-hover': '1',
      x1: 0, y1: 0, x2: 0, y2: svgH,
      stroke: '#aaa', 'stroke-width': 1.5, opacity: '0',
      'pointer-events': 'none',
    },
  }));

  // Dots — skipped in background mode.
  // Only render a dot for the current position, mate opportunities, or classified moves
  // (blunder / mistake / inaccuracy). Plain moves get no dot.
  if (!bg) for (const pt of valid) {
    const isCurrent = pt.path === currentPath;
    if (!isCurrent && !pt.hasMate && !pt.label) continue;
    const dotColor = isCurrent         ? '#4a8'
      : pt.hasMate                     ? 'hsl(307,80%,70%)'
      : pt.label === 'blunder'         ? 'hsl(0,69%,60%)'
      : pt.label === 'mistake'         ? 'hsl(41,100%,45%)'
      :                                  'hsl(202,78%,62%)'; // inaccuracy
    const dotR = isCurrent ? 3.5 : 2.5;
    svgNodes.push(h('circle', { attrs: {
      cx: pt.x, cy: pt.y,
      r: dotR,
      fill: dotColor,
      stroke: isCurrent ? '#fff' : 'none',
      'stroke-width': 1,
      'pointer-events': 'none',
    } }));
  }

  // Full-width interaction layer — skipped in background mode (pointer-events: none on container).
  if (!bg) svgNodes.push(h('rect', {
    attrs: {
      x: 0,
      y: 0,
      width: GRAPH_W,
      height: svgH,
      fill: 'transparent',
    },
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
        hideHover((e.currentTarget as SVGGraphicsElement).ownerSVGElement);
      },
      pointerleave: (e: PointerEvent) => {
        if (evalGraphScrubPointerId !== e.pointerId) hideHover((e.currentTarget as SVGGraphicsElement).ownerSVGElement);
      },
    },
  }));

  // Background mode: no interaction handlers, SVG fills 100% of the container.
  if (bg) {
    return h('div.eval-graph.eval-graph--bg', [
      h('svg', { attrs: {
        viewBox: `0 0 ${GRAPH_W} ${GRAPH_H}`,
        width: '100%',
        height: '100%',
        preserveAspectRatio: 'none',
      } }, svgNodes),
    ]);
  }

  return h('div.eval-graph', {
    on: {
      mouseleave: (e: MouseEvent) => hideHover((e.currentTarget as Element).querySelector('svg')),
    },
  }, [
    h('svg', { attrs: {
      // viewBox matches the rendered pixel height so scaleY = 1, keeping circle
      // markers circular at any graph height. scaleX still stretches to fill
      // container width, which is the intended horizontal-fill behavior.
      viewBox: `0 0 ${GRAPH_W} ${svgH}`,
      width: '100%',
      height: renderedGraphHeight,
      preserveAspectRatio: 'none',
    } }, svgNodes),
    h('div.eval-graph__resize-handle', {
      attrs: {
        title: 'Drag to resize eval graph',
        role: 'slider',
        'aria-label': 'Eval graph height',
        'aria-valuemin': String(GRAPH_HEIGHT_MIN),
        'aria-valuemax': String(GRAPH_HEIGHT_MAX),
        'aria-valuenow': String(graphHeightPct),
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
}
