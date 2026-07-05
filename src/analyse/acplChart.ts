// Adapted from lichess-org/lila: ui/chart/src/acpl.ts + ui/chart/src/index.ts
//
// Owns the interactive eval graph: chart.js line chart construction, the per-move dataset
// builder, live data updates, and current-position (ply-line) selection. The chart mirrors
// Lichess's computer-analysis graph — an orange win-chance line with white/black area fills,
// a hover tooltip showing the move + advantage, and per-point advice colors for blunders,
// mistakes, and inaccuracies.
//
// Deliberate omissions (no Patzer/Lichess data source exists for these):
//   - No blur-square markers — Patzer does not record per-move blur/focus-loss data.
//   - No division (opening/middlegame/endgame) lines — Patzer has no server-computed division.
//   - No i18n indirection — plain English strings, matching the rest of this app.
//
// Deliberate adaptation: Lichess derives light/dark theme colors from currentTheme(). Patzer's
// analysis board is always dark, so the theme constants below are the lila dark-theme values,
// hardcoded rather than branched on a theme toggle.
// Deliberate adaptation: Lichess reveals per-point advice colors via a "christmas tree" hover
// link from the advice-summary glyph legend (ui/chart/src/acpl.ts christmasTree). Patzer's
// analysis view has no such legend panel, so advice colors are instead surfaced through
// chart.js's own nearest-point hover (pointHoverBackgroundColor/pointBorderColor per point).

import {
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartConfiguration,
  type ChartDataset,
} from 'chart.js';
import { evalWinChances, type MoveLabel } from '../engine/winchances';
import { labelForReviewEval } from './deepenedEval';
import type { TreeNode } from '../tree/types';
import type { ReviewEngineMetadata } from '../idb/index';

Chart.register(LineController, LinearScale, PointElement, LineElement, Tooltip, Filler);

// Local structural type for evalCache entries — mirrors evalView.ts's private EvalEntry type.
// Duplicated rather than imported so this module stays decoupled from evalView.ts (matches the
// structural-type rationale already used in evalView.ts, ahead of a shared PositionEval type).
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

// --- Theme constants ---
// Adapted from lichess-org/lila: ui/chart/src/index.ts (dark-theme branch only — see file header).
export const chartYMax = 1.05;
export const chartYMin = -chartYMax;
const orangeAccent    = '#d85000';
const whiteFill       = 'rgba(255,255,255,0.3)';
const blackFill       = 'rgba(0,0,0,1)';
const fontColor       = 'hsl(0, 0%, 73%)';
const tooltipBgColor  = 'rgba(22, 21, 18, 0.7)';
const zeroLineColor   = '#676664';

// Advice hover colors — exact lichess-org/lila: ui/chart/src/acpl.ts glyphProperties values.
const ADVICE_COLORS: Record<MoveLabel, string> = {
  blunder:     '#db3031',
  mistake:     '#e69d00',
  inaccuracy:  '#4da3d5',
};

function fontFamily(size?: number, weight?: 'bold'): { family: string; size: number; weight?: 'bold' } {
  const base = {
    family: "'Noto Sans', 'Lucida Grande', 'Lucida Sans Unicode', Verdana, Arial, Helvetica, sans-serif",
    size: size ?? 12,
  };
  return weight ? { ...base, weight } : base;
}

type AxisScales = NonNullable<NonNullable<ChartConfiguration<'line'>['options']>['scales']>;

function axisOpts(xmin: number, xmax: number): AxisScales {
  return {
    x: { display: false, type: 'linear', min: xmin, max: xmax, offset: false },
    y: {
      min: chartYMin,
      max: chartYMax,
      border: { display: false },
      ticks: { display: false },
      grid: { color: ctx => (ctx.tick.value === 0 ? zeroLineColor : undefined) },
    },
  };
}

/** Returns the chart already bound to `el`, if any. Adapted from lichess-org/lila:
 *  ui/chart/src/index.ts maybeChart — used to guard against double-creation and to let
 *  callers (the snabbdom update/destroy hooks) find the live chart without holding their
 *  own reference to it. */
export function getAcplChart(el: HTMLCanvasElement): AcplChart | undefined {
  const ctx = el.getContext('2d');
  return ctx ? (Chart.getChart(ctx) as AcplChart | undefined) : undefined;
}

// --- Dataset construction ---

export interface AcplPoint { x: number; y: number; }

export interface AcplDataset {
  points:      AcplPoint[];
  paths:       string[];
  moveLabels:  string[];
  pointColors: string[];
}

function shouldShowReviewAnnotation(
  userColor: 'white' | 'black' | null,
  nodePly:   number,
  userOnly:  boolean,
): boolean {
  if (!userOnly || userColor === null) return true;
  const isWhiteMove = nodePly % 2 === 1;
  return (userColor === 'white' && isWhiteMove) || (userColor === 'black' && !isWhiteMove);
}

// Move-annotation label — mirrors moveList.ts renderMoveSpan's glyph-vs-review-annotation
// priority (PGN glyphs win, else fall back to labelForReviewEval) restricted to the three
// labels the graph annotates, so the chart and move list always agree on which moves are
// flagged. Adapted from lichess-org/lila: ui/chart/src/acpl.ts glyphProperties.
function pointLabel(
  node:         TreeNode,
  cached:       EvalEntry | undefined,
  parentCached: EvalEntry | undefined,
  userColor:    'white' | 'black' | null,
  userOnly:     boolean,
  reviewEngine: ReviewEngineMetadata | undefined,
): MoveLabel | null {
  const pgnGlyph = (node.glyphs ?? []).find(g => g.id === 4 || g.id === 2 || g.id === 6);
  if (pgnGlyph) return pgnGlyph.id === 4 ? 'blunder' : pgnGlyph.id === 2 ? 'mistake' : 'inaccuracy';
  const playedBest = node.uci !== undefined && node.uci === parentCached?.best;
  return labelForReviewEval(cached, playedBest, shouldShowReviewAnnotation(userColor, node.ply, userOnly), reviewEngine);
}

// Win chance for one mainline point, white's perspective.
// Adapted from lichess-org/lila: ui/chart/src/acpl.ts makeDataset — the acpl chart treats ANY
// forced mate (or a checkmating SAN) as an instant ±1 edge value, unlike the smoother
// mate-distance curve `evalWinChances` uses elsewhere (eval bar, move-list labels).
function pointWinChance(node: TreeNode, cached: EvalEntry | undefined): number | undefined {
  if (cached?.mate !== undefined) {
    if (cached.mate > 0) return 1;
    if (cached.mate < 0) return -1;
    // mate === 0: terminal checkmate position — side to move is the checkmated side.
    return node.fen.split(' ')[1] === 'b' ? 1 : -1;
  }
  if (node.san?.includes('#')) {
    const isWhiteMove = node.ply % 2 === 1;
    return isWhiteMove ? 1 : -1;
  }
  if (cached?.cp !== undefined) return evalWinChances(cached);
  return undefined;
}

/** Builds the plotted-points dataset for the interactive eval graph from the mainline + evalCache. */
export function buildAcplDataset(
  mainline:     TreeNode[],
  evalCache:    EvalCache,
  userColor:    'white' | 'black' | null,
  userOnly:     boolean,
  reviewEngine: ReviewEngineMetadata | undefined,
): AcplDataset {
  const points: AcplPoint[] = [];
  const paths: string[] = [];
  const moveLabels: string[] = [];
  const pointColors: string[] = [];
  let path = '';
  for (let i = 1; i < mainline.length; i++) {
    const node = mainline[i]!;
    path += node.id;
    const parentPath   = path.slice(0, -2);
    const cached       = evalCache.get(path);
    const parentCached = evalCache.get(parentPath);
    const wc = pointWinChance(node, cached);
    if (wc === undefined) continue;

    const label = pointLabel(node, cached, parentCached, userColor, userOnly, reviewEngine);
    const turn = Math.ceil(node.ply / 2);
    const dots = node.ply % 2 === 1 ? '.' : '…'; // matches moveList.ts's index format
    const annotation = label ? ` [${label[0]!.toUpperCase()}${label.slice(1)}]` : '';

    points.push({ x: node.ply, y: wc });
    paths.push(path);
    moveLabels.push(`${turn}${dots} ${node.san ?? ''}${annotation}`);
    pointColors.push(label ? ADVICE_COLORS[label] : orangeAccent);
  }
  return { points, paths, moveLabels, pointColors };
}

function acplDatasetSignature(d: AcplDataset): string {
  return `${d.points.length}|${d.points.map(p => p.y.toFixed(4)).join(',')}|${d.pointColors.join(',')}`;
}

// Tooltip advantage text — same rounding rule as lichess-org/lila: ui/chart/src/acpl.ts
// tooltip label callback (Math.round(cp/10)/10, capped ±99).
function formatAdvantage(ev: EvalEntry | undefined): string {
  if (!ev) return '';
  if (ev.mate !== undefined) return `Advantage: #${ev.mate}`;
  if (ev.cp !== undefined) {
    const e = Math.max(Math.min(Math.round(ev.cp / 10) / 10, 99), -99);
    return `Advantage: ${e > 0 ? '+' : ''}${e.toFixed(1)}`;
  }
  return '';
}

// Vertical line marking the current position. Adapted from lichess-org/lila:
// ui/chart/src/index.ts plyLine/selectPly. Hidden (empty dataset) when the current path isn't
// on the mainline (e.g. a side variation) — matches the previous SVG graph's behavior.
function plyLineDataset(paths: string[], points: AcplPoint[], currentPath: string): ChartDataset<'line'> {
  const idx = paths.indexOf(currentPath);
  const data = idx === -1 ? [] : [{ x: points[idx]!.x, y: chartYMin }, { x: points[idx]!.x, y: chartYMax }];
  return {
    type: 'line',
    label: 'ply',
    data,
    borderColor: orangeAccent,
    pointRadius: 0,
    pointHoverRadius: 0,
    borderWidth: 1,
    animation: false,
    order: 0,
  };
}

// --- Chart lifecycle ---

export interface AcplChartOptions {
  userColor:    'white' | 'black' | null;
  userOnly:     boolean;
  reviewEngine: ReviewEngineMetadata | undefined;
  onNavigate:   (path: string) => void;
}

// The chart instance itself carries its own bookkeeping (root/length for identity checks, the
// live dataset box, and the last-plotted path) — mirrors lichess-org/lila: ui/chart/src/acpl.ts
// AcplChart, which attaches `selectPly`/`updateData` directly onto the Chart instance rather
// than tracking a separate handle. This lets callers rediscover live chart state purely via
// `getAcplChart(canvas)`, with no module-level mutable handle to keep in sync.
export interface AcplChart extends Chart<'line'> {
  acplRoot:        TreeNode; // mainline[0] identity at (re)creation time — detects game switches
  acplLength:      number;   // mainline.length at (re)creation time — detects structural edits
  acplBox:         { dataset: AcplDataset }; // mutable so tooltip/onClick callbacks stay live
  acplCurrentPath: string;
}

function buildConfig(
  mainline:    TreeNode[],
  box:         { dataset: AcplDataset },
  evalCache:   EvalCache,
  currentPath: string,
  options:     AcplChartOptions,
): ChartConfiguration<'line'> {
  const firstPly = mainline[0]!.ply;
  const acplDataset: ChartDataset<'line'> = {
    label: 'Advantage',
    data: box.dataset.points,
    borderWidth: 1,
    fill: { target: 'origin', below: blackFill, above: whiteFill },
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHitRadius: 100,
    borderColor: orangeAccent,
    pointBackgroundColor: box.dataset.pointColors,
    pointHoverBackgroundColor: box.dataset.pointColors,
    pointBorderColor: box.dataset.pointColors,
    order: 5,
  };
  return {
    type: 'line',
    data: {
      labels: box.dataset.moveLabels.map((_, i) => i),
      datasets: [acplDataset, plyLineDataset(box.dataset.paths, box.dataset.points, currentPath)],
    },
    options: {
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales: axisOpts(firstPly + 1, mainline.length + firstPly),
      animation: false,
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        tooltip: {
          borderColor: fontColor,
          borderWidth: 1,
          backgroundColor: tooltipBgColor,
          bodyColor: fontColor,
          titleColor: fontColor,
          titleFont: fontFamily(14, 'bold'),
          bodyFont: fontFamily(13),
          caretPadding: 10,
          displayColors: false,
          filter: item => item.datasetIndex === 0,
          callbacks: {
            label: item => formatAdvantage(evalCache.get(box.dataset.paths[item.dataIndex] ?? '')),
            title: items => (items[0] ? (box.dataset.moveLabels[items[0].dataIndex] ?? '') : ''),
          },
        },
      },
      onClick(_event, elements) {
        const el = elements.find(e => e.datasetIndex === 0);
        const path = el ? box.dataset.paths[el.index] : undefined;
        if (path !== undefined) options.onNavigate(path);
      },
    },
  };
}

// Continuous drag-to-scrub across the chart, using chart.js's own nearest-x hit testing —
// mirrors the previous SVG graph's pointer-capture scrub behavior, adapted to chart.js.
function bindDragScrub(chart: Chart<'line'>, box: { dataset: AcplDataset }, onNavigate: (path: string) => void): void {
  const canvas = chart.canvas;
  let scrubPointerId: number | null = null;
  let lastScrubPath: string | null = null;

  const navigateToNearest = (e: PointerEvent): void => {
    const elements = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false, axis: 'x' }, true);
    const el = elements.find(e2 => e2.datasetIndex === 0);
    if (!el) return;
    const path = box.dataset.paths[el.index];
    if (path !== undefined && path !== lastScrubPath) {
      lastScrubPath = path;
      onNavigate(path);
    }
  };

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    scrubPointerId = e.pointerId;
    lastScrubPath = null;
    canvas.setPointerCapture?.(e.pointerId);
    navigateToNearest(e);
  });
  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (scrubPointerId === e.pointerId) navigateToNearest(e);
  });
  const endScrub = (e: PointerEvent) => {
    if (scrubPointerId === e.pointerId) {
      scrubPointerId = null;
      lastScrubPath = null;
      canvas.releasePointerCapture?.(e.pointerId);
    }
  };
  canvas.addEventListener('pointerup', endScrub);
  canvas.addEventListener('pointercancel', endScrub);
}

/** Creates a fresh chart on `canvas`. Destroys any chart already bound to it first (defensive —
 *  mirrors lichess-org/lila: ui/chart/src/index.ts maybeChart guard against double-creation). */
export function createAcplChart(
  canvas:      HTMLCanvasElement,
  mainline:    TreeNode[],
  evalCache:   EvalCache,
  currentPath: string,
  options:     AcplChartOptions,
): AcplChart {
  getAcplChart(canvas)?.destroy();

  const box = { dataset: buildAcplDataset(mainline, evalCache, options.userColor, options.userOnly, options.reviewEngine) };
  const config = buildConfig(mainline, box, evalCache, currentPath, options);
  const chart = new Chart(canvas, config) as AcplChart;
  chart.acplRoot = mainline[0]!;
  chart.acplLength = mainline.length;
  chart.acplBox = box;
  chart.acplCurrentPath = currentPath;
  bindDragScrub(chart, box, options.onNavigate);

  return chart;
}

/**
 * Updates an existing chart for the latest mainline/evalCache/currentPath.
 * - Mainline identity (root node reference) or length changed → full rebuild (new x-axis
 *   domain, matching lichess-org/lila's per-load axisOpts binding). Returns a NEW chart
 *   instance bound to the same canvas.
 * - Only evalCache-derived values changed → cheap in-place data patch + `update('none')`.
 * - Only currentPath changed → ply-line dataset only, `update('none')`, no animation ever.
 */
export function updateAcplChart(
  chart:       AcplChart,
  mainline:    TreeNode[],
  evalCache:   EvalCache,
  currentPath: string,
  options:     AcplChartOptions,
): AcplChart {
  const identityChanged = chart.acplRoot !== mainline[0] || chart.acplLength !== mainline.length;
  if (identityChanged) {
    const canvas = chart.canvas;
    chart.destroy();
    return createAcplChart(canvas, mainline, evalCache, currentPath, options);
  }

  const newDataset = buildAcplDataset(mainline, evalCache, options.userColor, options.userOnly, options.reviewEngine);
  const dataChanged = acplDatasetSignature(newDataset) !== acplDatasetSignature(chart.acplBox.dataset);
  const pathChanged = currentPath !== chart.acplCurrentPath;
  if (!dataChanged && !pathChanged) return chart;

  if (dataChanged) {
    chart.acplBox.dataset = newDataset;
    const acpl = chart.data.datasets[0]!;
    acpl.data = newDataset.points;
    acpl.pointBackgroundColor = newDataset.pointColors;
    acpl.pointHoverBackgroundColor = newDataset.pointColors;
    acpl.pointBorderColor = newDataset.pointColors;
  }
  chart.data.datasets[1] = plyLineDataset(chart.acplBox.dataset.paths, chart.acplBox.dataset.points, currentPath);
  chart.update('none');
  chart.acplCurrentPath = currentPath;
  return chart;
}
