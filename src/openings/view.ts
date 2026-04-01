/**
 * Openings subsystem view — renders the openings page shell.
 *
 * Adapted from Lichess ctrl/view separation pattern.
 * Import workflow follows OpeningTree-style: source -> details -> actions.
 */
import { h, type VNode } from 'snabbdom';
import { renderToggleRow } from '../ui';
import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { parseFen } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { Chess } from 'chessops/chess';
import { bindBoardResizeHandle } from '../board/index';
import { renderMoveList } from '../analyse/moveList';
import type { TreeNode } from '../tree/types';
import {
  collections, collectionsLoaded, loadSavedCollections,
  openingsPage, activeCollection, sessionNode, sessionPath, openingTree, sampleGames,
  boardOrientation, flipBoard, colorFilter, setColorFilter, speedFilter, setSpeedFilter,
  openCollection, closeSession, navigateToMove, navigateBack, navigateToRoot, navigateToPath, navigateToEnd,
  removeCollection, renameCollection,
  treeBuilding, treeBuildProgress, treeBuildTotal,
  importStep, importSource, importUsername, importColor, importError,
  importProgress, lastCreatedCollection, cancelImport,
  importSpeeds, setImportSpeeds, importDateRange, setImportDateRange,
  importCustomFrom, setImportCustomFrom, importCustomTo, setImportCustomTo,
  importRated, setImportRated, importMaxGames, setImportMaxGames,
  setImportStep, setImportSource, setImportUsername, setImportColor,
  resetImport, activeTool, setActiveTool, getCollectionSummary, getPrepReportViewModel,
  getStyleViewModel,
  practiceSession, startPractice, stopPractice,
  recordPracticeMove, setPracticeOpponentSource,
  deviationResults, deviationLoading, deviationProgress, deviationTotal,
  startDeviationScan, recencyMode, setRecencyMode,
} from './ctrl';
import { planOpponentTurn } from './practice';
import type { OpeningsTool } from './types';
import { SPEED_OPTIONS, DATE_RANGE_OPTIONS, type ImportSpeed, type ImportDateRange } from '../import/filters';
import type { ResearchCollection, ResearchGame, ResearchSource } from './types';
import type { OpeningTreeNode } from './tree';
import { executeResearchImport } from './import';
import type { OpeningMoveStats, ExplorerDb, TablebaseData, TablebaseMoveStats, TablebaseCategory } from './explorer';
import { explorerCtrl, MAX_EXPLORER_DEPTH } from './explorerCtrl';
import { ALL_SPEEDS, ALL_RATINGS, ALL_MODES } from './explorerConfig';
import { renderCeval, renderPvBox, renderEngineSettings, setCevalFenOverride } from '../ceval/view';
import { renderMoveNavBar } from '../analyse/analysisControls';
import {
  engineEnabled, evalCurrentPosition,
  showEngineArrows, setShowEngineArrows,
  showArrowLabels, setShowArrowLabels,
  syncArrow,
} from '../engine/ctrl';
import { playMoveWithDelay, cancelPlayMove } from '../engine/playMove';
import { STRENGTH_LEVELS } from '../engine/types';
import { renderStrengthSelector } from '../engine/strengthView';
import { setPlayStrengthLevel, getPlayStrengthLevel } from '../engine/ctrl';
import {
  computeRepertoireProfile, computePrepReport, computePrepReportLines,
  computeLikelyLineModule, computeWeaknessModule, computePrepNotes,
  computeTerminationProfile, computeGameLengthProfile,
  computeOpeningRecommendations,
  type PrepLine, type LikelyLineEntry, type StyleViewModel,
} from './analytics';
import { detectTrapPatterns } from './traps';
import { saveVariation } from './db';
import type { SavedVariation } from './types';

let _openingsCg: CgApi | undefined;
let _lastBoardFen: string = '';

// --- Openings action-menu state ---
// Mirrors the analysis action-menu pattern in src/analyse/analysisControls.ts
let _openingsMenuOpen = false;

// Icon codepoints reused from analysisControls.ts conventions.
// Adapted from lichess-org/lila: ui/lib/src/licon.ts
const ICON_HAMBURGER  = '\ue039'; // licon.Hamburger
const ICON_FLIP       = '\ue020'; // licon.ChasingArrows — flip board

/** Render the openings page (library or session). */
export function renderOpeningsPage(redraw: () => void): VNode {
  const page = openingsPage();
  if (page === 'session') return renderSessionPage(redraw);
  return renderLibraryPage(redraw);
}

// ========== Library page ==========

function renderLibraryPage(redraw: () => void): VNode {
  if (!collectionsLoaded()) {
    void loadSavedCollections(redraw);
    return h('div.openings', [
      h('div.openings__header', [
        h('h1.openings__title', 'Opponent Research'),
      ]),
      h('div.openings__body', [
        h('div.openings__loading', 'Loading collections\u2026'),
      ]),
    ]);
  }

  const saved = collections();
  const step = importStep();

  return h('div.openings', [
    h('div.openings__header', [
      h('h1.openings__title', 'Opponent Research'),
      step === 'idle'
        ? h('button.openings__new-btn', {
            on: { click: () => { setImportStep('details'); redraw(); } },
          }, 'New Research')
        : null,
    ]),
    step !== 'idle'
      ? renderImportWorkflow(redraw)
      : h('div.openings__body', saved.length === 0
          ? [renderEmptyState(redraw)]
          : [renderCollectionList(saved, redraw)],
        ),
  ]);
}

function renderEmptyState(redraw: () => void): VNode {
  return h('div.openings__empty', [
    h('div.openings__empty-icon', '\u265E'),
    h('h2.openings__empty-title', 'Opponent Research'),
    h('p', 'Research your opponents\u2019 openings by importing their games.'),
    h('p.openings__hint', 'Games are stored separately from your analysis library.'),
    h('button.openings__start-btn', {
      on: { click: () => { setImportStep('details'); redraw(); } },
    }, 'Start New Research'),
  ]);
}

// ---- Collection card stats ----

interface SpeedStat {
  count: number;
  peakRating?: number;
  currentRating?: number;
  avgOppRating?: number;
}

interface CardStats {
  wins: number;
  draws: number;
  losses: number;
  bySpeed: Map<string, SpeedStat>;
}

function computeCardStats(c: ResearchCollection): CardStats {
  const target = c.target?.toLowerCase() ?? '';
  const result: CardStats = { wins: 0, draws: 0, losses: 0, bySpeed: new Map() };
  const oppAccum = new Map<string, { sum: number; n: number }>();

  // Ascending date sort — last entry per speed = most recent (used for currentRating)
  const sorted = [...c.games].sort((a, b) => (a.date ?? '') < (b.date ?? '') ? -1 : 1);

  for (const g of sorted) {
    const isWhite = g.white?.toLowerCase() === target;
    const isBlack = g.black?.toLowerCase() === target;

    if (isWhite || isBlack) {
      if      (g.result === '1-0')      { isWhite ? result.wins++  : result.losses++; }
      else if (g.result === '0-1')      { isBlack ? result.wins++  : result.losses++; }
      else if (g.result === '1/2-1/2')  { result.draws++; }
    }

    const tc = g.timeClass;
    if (!tc) continue;
    if (!result.bySpeed.has(tc)) result.bySpeed.set(tc, { count: 0 });
    const sp = result.bySpeed.get(tc)!;
    sp.count++;

    if (isWhite || isBlack) {
      const myRating  = isWhite ? g.whiteRating : g.blackRating;
      const oppRating = isWhite ? g.blackRating : g.whiteRating;
      if (myRating !== undefined) {
        if (sp.peakRating === undefined || myRating > sp.peakRating) sp.peakRating = myRating;
        sp.currentRating = myRating;
      }
      if (oppRating !== undefined) {
        const acc = oppAccum.get(tc) ?? { sum: 0, n: 0 };
        acc.sum += oppRating; acc.n++;
        oppAccum.set(tc, acc);
      }
    }
  }

  for (const [tc, sp] of result.bySpeed) {
    const acc = oppAccum.get(tc);
    if (acc && acc.n > 0) sp.avgOppRating = Math.round(acc.sum / acc.n);
  }

  return result;
}

// --- Rating sparkline ---

interface RatingPoint { date: string; rating: number; }

function extractRatingSeries(c: ResearchCollection): RatingPoint[] {
  const target = c.target?.toLowerCase() ?? '';
  const points: RatingPoint[] = [];
  for (const g of c.games) {
    if (!g.date) continue;
    const isWhite = g.white?.toLowerCase() === target;
    const isBlack = g.black?.toLowerCase() === target;
    const rating = isWhite ? g.whiteRating : isBlack ? g.blackRating : undefined;
    if (rating !== undefined) points.push({ date: g.date, rating });
  }
  points.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return points;
}

function renderSparkline(points: RatingPoint[]): VNode | null {
  if (points.length < 5) return null;

  const W = 120, H = 28, PAD_X = 2, PAD_Y = 4;
  const ratings = points.map(p => p.rating);
  const minR = Math.min(...ratings);
  const maxR = Math.max(...ratings);
  const range = maxR - minR || 1;

  const xScale = (W - 2 * PAD_X) / (points.length - 1);
  const yScale = (H - 2 * PAD_Y) / range;
  const px = (i: number) => (PAD_X + i * xScale).toFixed(1);
  const py = (r: number) => (H - PAD_Y - (r - minR) * yScale).toFixed(1);

  const polyPoints = points.map((p, i) => `${px(i)},${py(p.rating)}`).join(' ');

  // Peak index
  let peakIdx = 0;
  for (let i = 1; i < ratings.length; i++) {
    if (ratings[i]! > ratings[peakIdx]!) peakIdx = i;
  }

  // Trend: compare first 20% avg vs last 20% avg
  const chunk = Math.max(1, Math.floor(points.length * 0.2));
  const firstAvg = ratings.slice(0, chunk).reduce((s, v) => s + v, 0) / chunk;
  const lastAvg = ratings.slice(-chunk).reduce((s, v) => s + v, 0) / chunk;
  const delta = lastAvg - firstAvg;
  const trend = delta > 15 ? '\u2191' : delta < -15 ? '\u2193' : '\u2192'; // ↑ ↓ →
  const trendClass = delta > 15 ? 'trend-up' : delta < -15 ? 'trend-down' : 'trend-flat';

  const current = ratings[ratings.length - 1];

  return h('div.openings__sparkline-row', [
    h('svg', {
      attrs: { viewBox: `0 0 ${W} ${H}`, width: W, height: H },
      class: { 'openings__sparkline-svg': true },
    }, [
      h('polyline', {
        attrs: {
          points: polyPoints,
          fill: 'none',
          stroke: 'var(--cg-accent, #629924)',
          'stroke-width': '1.5',
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        },
      }),
      // Peak marker
      h('circle', {
        attrs: {
          cx: px(peakIdx),
          cy: py(ratings[peakIdx]!),
          r: '2',
          fill: 'var(--cg-accent, #629924)',
        },
      }),
    ]),
    h('span.openings__sparkline-current', [
      `${current}`,
      h('span', { class: { [trendClass]: true, 'openings__sparkline-trend': true } }, ` ${trend}`),
    ]),
  ]);
}

function renderCollectionCard(c: ResearchCollection, redraw: () => void): VNode {
  const stats       = computeCardStats(c);
  const total       = stats.wins + stats.draws + stats.losses;
  const wPct        = total > 0 ? (stats.wins   / total) * 100 : 0;
  const dPct        = total > 0 ? (stats.draws  / total) * 100 : 0;
  const lPct        = total > 0 ? (stats.losses / total) * 100 : 0;
  const periodLabel = dateRangeDescription(c.settings).replace(/^ in /, '') || 'all time';
  const speedOrder  = ['bullet', 'blitz', 'rapid', 'classical'];
  const activeSpeeds = speedOrder.filter(s => stats.bySpeed.has(s));

  return h('div.openings__collection-row', {
    key: c.id,
    on: { click: () => openCollection(c, redraw) },
  }, [
    h('div.openings__card-top', [
      h('span.openings__collection-name', c.name),
      h('div.openings__collection-actions', [
        h('button.openings__col-rename', {
          attrs: { title: 'Rename' },
          on: { click: (e: Event) => {
            e.stopPropagation();
            const name = prompt('Rename collection:', c.name);
            if (name && name.trim()) void renameCollection(c.id, name.trim(), redraw);
          } },
        }, '\u270E'),
        h('button.openings__col-delete', {
          attrs: { title: 'Delete' },
          on: { click: (e: Event) => {
            e.stopPropagation();
            if (confirm(`Delete "${c.name}"? This cannot be undone.`)) {
              void removeCollection(c.id, redraw);
            }
          } },
        }, '\u2715'),
      ]),
    ]),
    h('div.openings__collection-meta', [
      h('span', [c.source, `${c.games.length} game${c.games.length !== 1 ? 's' : ''}`, periodLabel].join(' \u00B7 ')),
      c.games.length < 20 ? h('span.openings__small-sample-badge', { attrs: { title: 'Small sample — statistics may not be reliable' } }, '\u26A0 small sample') : null,
    ]),

    // W / D / L bar
    total > 0 ? h('div.openings__card-wdl', [
      h('div.openings__card-wdl-bar', [
        h('span.wdl-w', { attrs: { style: `width:${wPct.toFixed(1)}%` } },
          wPct > 14 ? `${Math.round(wPct)}%` : ''),
        h('span.wdl-d', { attrs: { style: `width:${dPct.toFixed(1)}%` } },
          dPct > 14 ? `${Math.round(dPct)}%` : ''),
        h('span.wdl-l', { attrs: { style: `width:${lPct.toFixed(1)}%` } },
          lPct > 14 ? `${Math.round(lPct)}%` : ''),
      ]),
      h('div.openings__card-wdl-labels', [
        h('span.wdl-w', `${stats.wins}\u2009W`),
        h('span.wdl-d', `${stats.draws}\u2009D`),
        h('span.wdl-l', `${stats.losses}\u2009L`),
      ]),
    ]) : null,

    // Per-speed columns
    activeSpeeds.length > 0 ? h('div.openings__card-speeds', {
      attrs: { style: `grid-template-columns:repeat(${activeSpeeds.length},1fr)` },
    }, activeSpeeds.map(speed => {
      const sp  = stats.bySpeed.get(speed)!;
      const opt = SPEED_OPTIONS.find(o => o.value === speed);
      return h('div.openings__card-speed-col', [
        h('div.openings__card-speed-hdr', [
          opt ? h('span.openings__card-speed-icon', { attrs: { 'data-icon': opt.icon } }) : null,
          h('span.openings__card-speed-name', opt?.label ?? speed),
          h('span.openings__card-speed-count', `${sp.count}`),
        ]),
        sp.peakRating    !== undefined
          ? h('div.openings__card-stat', [h('span', 'Peak'),    h('span', `${sp.peakRating}`)]) : null,
        sp.currentRating !== undefined
          ? h('div.openings__card-stat', [h('span', 'Now'),     h('span', `${sp.currentRating}`)]) : null,
        sp.avgOppRating  !== undefined
          ? h('div.openings__card-stat.muted', [h('span', 'Avg opp'), h('span', `${sp.avgOppRating}`)]) : null,
      ]);
    })) : null,

    // Rating sparkline
    renderSparkline(extractRatingSeries(c)),
  ]);
}

function renderCollectionList(items: readonly ResearchCollection[], redraw: () => void): VNode {
  return h('div.openings__collections', items.map(c => renderCollectionCard(c, redraw)));
}

// ========== Import workflow ==========

function renderImportWorkflow(redraw: () => void): VNode {
  const step = importStep();
  return h('div.openings__import', [
    h('div.openings__import-header', [
      h('span', 'New Opponent Research'),
      h('button.header__panel-btn.--ghost', {
        on: { click: () => { resetImport(); redraw(); } },
      }, 'Cancel'),
    ]),
    step === 'details' ? renderDetailsStep(redraw) : null,
    step === 'importing' ? renderImportingStep(redraw) : null,
    step === 'done' ? renderDoneStep(redraw) : null,
  ]);
}

function renderDetailsStep(redraw: () => void): VNode {
  const src = importSource();
  const color = importColor();
  const err = importError();
  const speeds = importSpeeds();
  const dateRange = importDateRange();

  const sections: (VNode | null)[] = [];

  // --- Source ---
  const sources: { value: ResearchSource; label: string }[] = [
    { value: 'lichess', label: 'Lichess' },
    { value: 'chesscom', label: 'Chess.com' },
    { value: 'pgn', label: 'PGN Upload' },
  ];
  sections.push(h('div.header__panel-section', [
    h('div.header__panel-label', 'Source'),
    h('div.header__panel-row', sources.map(s =>
      h('button.header__pill', {
        class: { active: src === s.value },
        on: { click: () => { setImportSource(s.value); redraw(); } },
      }, s.label),
    )),
  ]));
  sections.push(h('div.header__panel-divider'));

  // --- Username / PGN input ---
  sections.push(
    src !== 'pgn' ? h('div.header__panel-section', [
      h('div.header__panel-label', 'Username'),
      h('input.header__text-input', {
        attrs: {
          type: 'text',
          placeholder: `${src === 'lichess' ? 'Lichess' : 'Chess.com'} username`,
          autocomplete: 'off',
          'data-lpignore': 'true',
          'data-1p-ignore': 'true',
          'data-bwignore': 'true',
          'data-form-type': 'other',
        },
        props: { value: importUsername() },
        on: { input: (e: Event) => { setImportUsername((e.target as HTMLInputElement).value); redraw(); } },
      }),
    ]) : h('div.header__panel-section', [
      h('div.header__panel-label', 'Paste PGN'),
      h('textarea.header__pgn-input', {
        attrs: { placeholder: 'Paste PGN text here\u2026', rows: '6' },
        on: { input: (e: Event) => { setImportUsername((e.target as HTMLTextAreaElement).value); redraw(); } },
      }),
    ]),
  );

  // --- Perspective ---
  sections.push(h('div.header__panel-divider'));
  sections.push(h('div.header__panel-section', [
    h('div.header__panel-label', 'Perspective'),
    h('div.header__panel-row', (['white', 'black', 'both'] as const).map(c =>
      h('button.header__pill', {
        class: { active: color === c },
        on: { click: () => { setImportColor(c); redraw(); } },
      }, c.charAt(0).toUpperCase() + c.slice(1)),
    )),
  ]));

  if (src !== 'pgn') {
    // --- Time control ---
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('div.header__panel-label', 'Time control'),
      h('div.header__panel-row', [
        h('button.header__pill', {
          class: { active: speeds.size === 0 },
          on: { click: () => { setImportSpeeds(new Set()); redraw(); } },
        }, 'All'),
        ...SPEED_OPTIONS.map(({ value, label, icon }) =>
          h('button.header__pill', {
            class: { active: speeds.has(value) },
            attrs: { 'data-icon': icon },
            on: { click: () => {
              const s = new Set(speeds);
              s.has(value) ? s.delete(value) : s.add(value);
              setImportSpeeds(s);
              redraw();
            } },
          }, label),
        ),
      ]),
    ]));

    // --- Period ---
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('div.header__panel-label', 'Period'),
      h('div.header__panel-row', [
        ...DATE_RANGE_OPTIONS.map(({ value, label }) =>
          h('button.header__pill', {
            class: { active: dateRange === value },
            on: { click: () => { setImportDateRange(value as ImportDateRange); redraw(); } },
          }, label),
        ),
      ]),
      dateRange === 'custom' ? h('div.header__panel-row.--mt', [
        h('span', 'From'),
        h('input.header__date-input', {
          attrs: { type: 'date' },
          props: { value: importCustomFrom() },
          on: { change: (e: Event) => { setImportCustomFrom((e.target as HTMLInputElement).value); redraw(); } },
        }),
        h('span', 'To'),
        h('input.header__date-input', {
          attrs: { type: 'date' },
          props: { value: importCustomTo() },
          on: { change: (e: Event) => { setImportCustomTo((e.target as HTMLInputElement).value); redraw(); } },
        }),
      ]) : null,
    ]));

    // --- Rated only ---
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('label.header__panel-check', [
        h('input', {
          attrs: { type: 'checkbox' },
          props: { checked: importRated() },
          on: { change: (e: Event) => { setImportRated((e.target as HTMLInputElement).checked); redraw(); } },
        }),
        ' Rated only',
      ]),
    ]));

    // --- Max games ---
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('div.header__panel-label', 'Max games'),
      h('input.header__text-input.header__text-input--short', {
        attrs: { type: 'number', min: '1', max: '200' },
        props: { value: importMaxGames() },
        on: { change: (e: Event) => { setImportMaxGames(parseInt((e.target as HTMLInputElement).value, 10) || 50); redraw(); } },
      }),
    ]));
  }

  // --- Error + actions ---
  sections.push(h('div.header__panel-divider'));
  sections.push(h('div.header__panel-section', [
    err ? h('div.header__panel-error', err) : null,
    h('button.openings__import-btn', {
      attrs: { disabled: src !== 'pgn' && importUsername().trim() === '' },
      on: { click: () => { void executeResearchImport(redraw); } },
    }, 'Import Games'),
  ]));

  return h('div.openings__step', sections);
}

function renderImportingStep(redraw: () => void): VNode {
  const progress = importProgress();

  return h('div.openings__step', [
    h('h3', 'Importing Games'),
    // Transfer animation
    h('div.openings__transfer', [
      h('div.openings__transfer-track', [
        h('div.openings__transfer-pulse'),
        h('div.openings__transfer-pulse.openings__transfer-pulse--delayed'),
      ]),
      h('div.openings__transfer-count',
        progress > 0
          ? `${progress.toLocaleString()} game${progress !== 1 ? 's' : ''} found`
          : 'Connecting\u2026',
      ),
    ]),
    h('button.openings__cancel-import-btn', {
      on: { click: () => { cancelImport(); redraw(); } },
    }, 'Cancel'),
  ]);
}

function renderDoneStep(redraw: () => void): VNode {
  const collection = lastCreatedCollection();
  return h('div.openings__step', [
    h('h3', 'Import Complete'),
    collection ? h('p.openings__done-summary', [
      `Created collection "${collection.name}" with ${collection.games.length} game${collection.games.length !== 1 ? 's' : ''}.`,
    ]) : null,
    h('button.openings__done-btn', {
      on: { click: () => { resetImport(); redraw(); } },
    }, 'Back to Library'),
  ]);
}

// ========== Session page (board shell) ==========

/**
 * Openings-local action menu overlay.
 * Renders inside .openings__session-panel with position: absolute; inset: 0.
 * Returns null when the menu is closed so the panel renders normally.
 * Adapted from lichess-org/lila: ui/analyse/src/view/actionMenu.ts structure
 */
function renderOpeningsActionMenu(redraw: () => void): VNode | null {
  if (!_openingsMenuOpen) return null;
  const close = () => { _openingsMenuOpen = false; redraw(); };

  return h('div.action-menu', [
    h('button.action-menu__close-btn', {
      attrs: { title: 'Close menu' },
      on:    { click: close },
    }, '×'),

    h('h2', 'Tools'),
    h('div.action-menu__tools', [
      // Flip board — mirrors lichess-org/lila: actionMenu.ts ctrl.flip() action
      h('button', {
        attrs: { 'data-icon': ICON_FLIP, title: 'Flip board' },
        on: { click: () => {
          flipBoard();
          if (_openingsCg) _openingsCg.set({ orientation: boardOrientation() });
          close();
        } },
      }, 'Flip board'),
    ]),

    h('h2', 'Display'),
    h('div.action-menu__display', [
      renderToggleRow('op-engine-arrows', 'Engine arrows', showEngineArrows, (v) => { setShowEngineArrows(v); syncArrow(); redraw(); }),
      renderToggleRow('op-arrow-labels', 'Arrow labels', showArrowLabels, (v) => { setShowArrowLabels(v); syncArrow(); redraw(); }),
    ]),
  ]);
}

// Tool rail icon codepoints — Adapted from lichess-org/lila: ui/lib/src/licon.ts
const ICON_BRANCH    = '\ue003'; // licon.Branch     → Opening Tree (branching variations)
const ICON_BOOK      = '\ue03b'; // licon.Book       → Repertoire
const ICON_BAR_GRAPH = '\ue03c'; // licon.BarGraph   → Prep Report
const ICON_EYE       = '\ue054'; // licon.Eye        → Style
const ICON_SWORDS    = '\ue033'; // licon.Swords     → Practice Against Them

interface ToolDef { id: OpeningsTool; label: string; icon: string }

const TOOL_DEFS: ToolDef[] = [
  { id: 'opening-tree', label: 'Opening Tree', icon: ICON_BRANCH },
  { id: 'repertoire',   label: 'Repertoire',   icon: ICON_BOOK },
  { id: 'prep-report',  label: 'Prep Report',  icon: ICON_BAR_GRAPH },
  { id: 'style',        label: 'Style',        icon: ICON_EYE },
  { id: 'practice',     label: 'Practice',     icon: ICON_SWORDS },
];

/**
 * Persistent left tool rail for the openings session.
 * Switching tools updates activeTool() without leaving the current collection context.
 */
function renderToolRail(redraw: () => void): VNode {
  const current = activeTool();
  return h('nav.openings__tool-rail', TOOL_DEFS.map(def =>
    h('button.openings__tool-rail-btn', {
      class: { 'openings__tool-rail-btn--active': current === def.id },
      attrs: { title: def.label },
      on: { click: () => { setActiveTool(def.id); redraw(); } },
    }, [
      h('span.openings__tool-rail-icon', { attrs: { 'data-icon': def.icon } }),
      h('span.openings__tool-rail-label', def.label),
    ]),
  ));
}

const TOOL_NAMES: Record<OpeningsTool, string> = {
  'opening-tree': 'Opening Tree',
  'repertoire':   'Repertoire',
  'prep-report':  'Prep Report',
  'style':        'Style',
  'practice':     'Practice Against Them',
};

/**
 * Placeholder for tools not yet implemented.
 * Spans the full content area (board + panel columns) via grid-column in CSS.
 */
function renderToolPlaceholder(tool: OpeningsTool): VNode {
  return h('div.openings__tool-content.openings__tool-content--placeholder', [
    h('div.openings__tool-placeholder-inner', [
      h('h3', TOOL_NAMES[tool]),
      h('p', 'This tool is coming soon.'),
    ]),
  ]);
}

/**
 * High-signal Repertoire overview strip.
 * Shows opponent W/D/L, repertoire breadth, and recency from the analytics cache.
 * Returns null if analytics are not yet available (tree still building).
 */
function renderRepertoireOverview(collection: ResearchCollection): VNode | null {
  const summary = getCollectionSummary();
  if (!summary) return null;

  const tree    = openingTree();
  const profile = computeRepertoireProfile(collection.games, tree, collection.target ?? '');
  const report  = computePrepReport(collection.games, collection.target ?? '', summary);

  const wdl   = report.overall;
  const total = wdl.total || 1;
  const wPct  = (wdl.wins   / total * 100).toFixed(0);
  const dPct  = (wdl.draws  / total * 100).toFixed(0);
  const lPct  = (wdl.losses / total * 100).toFixed(0);

  // Breadth label based on normalized entropy
  let breadthLabel: string;
  if (profile.distinctFirstMoves <= 1)       breadthLabel = 'Single line';
  else if (profile.normalizedEntropy < 0.35) breadthLabel = 'Narrow';
  else if (profile.normalizedEntropy < 0.65) breadthLabel = 'Moderate';
  else                                        breadthLabel = 'Broad';

  const recentGames = summary.recency.last90;

  return h('div.openings__repertoire-overview', [
    // W/D/L bar
    h('div.openings__overview-wdl', [
      h('div.openings__overview-wdl-bar', [
        h('span.wdl-w', { attrs: { style: `width:${wPct}%` } }, wdl.wins > 0 ? `${wPct}%` : ''),
        h('span.wdl-d', { attrs: { style: `width:${dPct}%` } }, wdl.draws > 0 ? `${dPct}%` : ''),
        h('span.wdl-l', { attrs: { style: `width:${lPct}%` } }, wdl.losses > 0 ? `${lPct}%` : ''),
      ]),
      h('div.openings__overview-wdl-counts', [
        h('span.wdl-w', `${wdl.wins}W`),
        h('span.wdl-d', `${wdl.draws}D`),
        h('span.wdl-l', `${wdl.losses}L`),
      ]),
    ]),
    // Quick stats row
    h('div.openings__overview-stats', [
      h('div.openings__overview-stat', [
        h('span.openings__overview-stat-label', 'Repertoire'),
        h('span.openings__overview-stat-value', breadthLabel),
      ]),
      h('div.openings__overview-stat', [
        h('span.openings__overview-stat-label', 'Openings'),
        h('span.openings__overview-stat-value', `${profile.distinctEcos}`),
      ]),
      h('div.openings__overview-stat', [
        h('span.openings__overview-stat-label', 'Last 90d'),
        h('span.openings__overview-stat-value', `${recentGames}`),
      ]),
    ]),
    profile.isSampleSmall
      ? h('div.openings__overview-caveat', `Small sample (${summary.totalGames} games) — stats are estimates`)
      : null,
  ]);
}

const SPEED_LABELS: Record<string, string> = {
  bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical',
};

/**
 * Repertoire summary modules: perspective split and time-control breakdown.
 * Speed cards are clickable to filter the session to that time control.
 * All data from cached CollectionSummary — no additional computation.
 */
function renderRepertoireSummaryModules(redraw: () => void): VNode | null {
  const summary = getCollectionSummary();
  if (!summary) return null;

  const activeSpeeds = speedFilter();

  function miniWdlBar(wdl: { wins: number; draws: number; losses: number; total: number }): VNode {
    const t = wdl.total || 1;
    const wP = (wdl.wins   / t * 100).toFixed(0);
    const dP = (wdl.draws  / t * 100).toFixed(0);
    const lP = (wdl.losses / t * 100).toFixed(0);
    return h('div.openings__mini-wdl', [
      h('span.wdl-w', { attrs: { style: `width:${wP}%` } }),
      h('span.wdl-d', { attrs: { style: `width:${dP}%` } }),
      h('span.wdl-l', { attrs: { style: `width:${lP}%` } }),
    ]);
  }

  // Perspective split
  const perspSection = h('div.openings__sum-section', [
    h('div.openings__sum-title', 'By Color'),
    h('div.openings__sum-perspective', [
      h('div.openings__sum-color', [
        h('span.openings__sum-color-dot.white-dot', '○'),
        h('span', `White: ${summary.asWhite.total}`),
        summary.asWhite.total > 0 ? miniWdlBar(summary.asWhite) : null,
      ]),
      h('div.openings__sum-color', [
        h('span.openings__sum-color-dot.black-dot', '●'),
        h('span', `Black: ${summary.asBlack.total}`),
        summary.asBlack.total > 0 ? miniWdlBar(summary.asBlack) : null,
      ]),
    ]),
  ]);

  // Time control cards
  const topSpeeds = summary.bySpeed.slice(0, 4);
  const speedSection = topSpeeds.length > 0 ? h('div.openings__sum-section', [
    h('div.openings__sum-title', 'By Time Control'),
    h('div.openings__sum-speeds', topSpeeds.map(sp => {
      const isActive = activeSpeeds.has(sp.timeClass);
      return h('button.openings__sum-speed-card', {
        class: { 'openings__sum-speed-card--active': isActive },
        attrs: { title: isActive ? 'Remove filter' : `Filter to ${sp.timeClass}` },
        on: { click: () => {
          const next = new Set(activeSpeeds as Set<string>);
          if (isActive) next.delete(sp.timeClass);
          else          next.add(sp.timeClass);
          setSpeedFilter(next as Set<string>, redraw);
          redraw();
        } },
      }, [
        h('span.openings__sum-speed-name', SPEED_LABELS[sp.timeClass] ?? sp.timeClass),
        h('span.openings__sum-speed-count', `${sp.wdl.total}`),
        miniWdlBar(sp.wdl),
      ]);
    })),
  ]) : null;

  // Recency row
  const recencySection = h('div.openings__sum-section', [
    h('div.openings__sum-title', 'Recency'),
    h('div.openings__sum-recency', [
      h('span', `30d: ${summary.recency.last30}`),
      h('span', `90d: ${summary.recency.last90}`),
      h('span', `1yr: ${summary.recency.last365}`),
    ]),
  ]);

  return h('div.openings__repertoire-summary', [
    perspSection,
    speedSection,
    recencySection,
  ]);
}

/**
 * Interactive line-insight cards for the Repertoire panel.
 * Cards are derived from PrepReportLines (Phase 3 analytics) and are clickable
 * to navigate the board/tree to the target branch position.
 */
function renderLineInsightCards(redraw: () => void): VNode | null {
  const tree = openingTree();
  if (!tree) return null;

  const perspective = colorFilter();
  const lines = computePrepReportLines(tree, perspective, 8);

  const hasAny = lines.likelyLines.length > 0;
  if (!hasAny) return null;

  function renderLineCard(line: PrepLine, onClick: () => void): VNode {
    const moveSan = line.sans.slice(0, 4).join(' ') + (line.sans.length > 4 ? '…' : '');
    const winPct  = (line.opponentWinPct * 100).toFixed(0);
    return h('button.openings__insight-card', { on: { click: onClick } }, [
      h('span.openings__insight-moves', moveSan),
      h('span.openings__insight-meta', [
        h('span.openings__insight-freq', `${line.frequency}g`),
        line.isReliable
          ? h('span.openings__insight-pct', `${winPct}%W`)
          : null,
      ]),
    ]);
  }

  function navTo(line: PrepLine): void {
    navigateToPath(line.moves);
    syncOpeningsBoard(redraw);
    redraw();
  }

  const sections: VNode[] = [];

  if (lines.likelyLines.length > 0) {
    sections.push(h('div.openings__insight-group', [
      h('div.openings__insight-group-label', 'Most Played'),
      ...lines.likelyLines.slice(0, 2).map(l => renderLineCard(l, () => navTo(l))),
    ]));
  }

  if (lines.strongLines.length > 0) {
    sections.push(h('div.openings__insight-group', [
      h('div.openings__insight-group-label', 'Strong Lines'),
      ...lines.strongLines.slice(0, 2).map(l => renderLineCard(l, () => navTo(l))),
    ]));
  }

  if (lines.weakLines.length > 0) {
    sections.push(h('div.openings__insight-group', [
      h('div.openings__insight-group-label', 'Weak Scoring'),
      ...lines.weakLines.slice(0, 2).map(l => renderLineCard(l, () => navTo(l))),
    ]));
  }

  if (lines.freshLines.length > 0) {
    sections.push(h('div.openings__insight-group', [
      h('div.openings__insight-group-label', 'Recent Additions'),
      ...lines.freshLines.slice(0, 2).map(l => renderLineCard(l, () => navTo(l))),
    ]));
  }

  if (sections.length === 0) return null;

  return h('div.openings__line-insights', [
    h('div.openings__insights-header', 'Line Insights'),
    ...sections,
  ]);
}

/**
 * Prep Report tool — full-page opponent dossier.
 * Spans both board and panel columns (grid-column: 2 / -1) via openings__tool-content.
 * Answers: what to prepare, what to avoid, what to expect.
 */
function renderPrepReportTool(redraw: () => void): VNode {
  const collection = activeCollection();
  const vm = getPrepReportViewModel();

  // Loading state — tree still building
  if (!vm || !collection) {
    return h('div.openings__tool-content', [
      h('div.openings__prep-report', [
        h('div.openings__pr-header', [
          h('span.openings__pr-label', 'Prep Report'),
          collection ? h('span.openings__pr-context', collection.target) : null,
        ]),
        treeBuilding()
          ? h('div.openings__pr-loading', 'Building tree\u2026')
          : h('div.openings__pr-loading', 'Open a collection to see the Prep Report.'),
      ]),
    ]);
  }

  const { summary, report, lines } = vm;
  const total = summary.overall.total || 1;
  const isSparse = summary.overall.total < 20;
  const wPct = (summary.overall.wins   / total * 100).toFixed(0);
  const dPct = (summary.overall.draws  / total * 100).toFixed(0);
  const lPct = (summary.overall.losses / total * 100).toFixed(0);

  // Likely lines (recency-weighted)
  const colorPerspective = colorFilter() === 'both' ? 'white' : colorFilter();
  const likelyModule = computeLikelyLineModule(openingTree(), colorPerspective, 8, 8, recencyMode());

  // Weakness module
  const tree = openingTree();
  const profile = computeRepertoireProfile(collection.games, tree, collection.target ?? '');
  const weaknessModule = computeWeaknessModule(lines, summary.overall.total);

  // Prep notes
  const notes = computePrepNotes(summary, profile, lines);

  function navToLine(line: PrepLine): void {
    navigateToPath(line.moves);
    setActiveTool('opening-tree');
    redraw();
  }

  // Likely-line row: shows recency boost badge when line was played within 90 days.
  function renderLikelyLineRow(line: LikelyLineEntry, onClick: () => void): VNode {
    const moveSan = line.sans.slice(0, 5).join(' ') + (line.sans.length > 5 ? '\u2026' : '');
    const boostRecent  = line.recencyBoost >= 2.0;  // ≤30d
    const boostFresh   = line.recencyBoost >= 1.5 && line.recencyBoost < 2.0;  // ≤90d
    return h('button.openings__pr-line-row', {
      attrs: { title: 'Open in Repertoire' },
      on: { click: onClick },
    }, [
      h('span.openings__pr-line-moves', moveSan),
      h('span.openings__pr-line-meta', [
        h('span.openings__pr-line-freq', `${line.frequency}g`),
        boostRecent
          ? h('span.openings__pr-boost-badge.openings__pr-boost--hot', '↑ now')
          : boostFresh
            ? h('span.openings__pr-boost-badge.openings__pr-boost--fresh', '↑ recent')
            : null,
        !line.isReliable ? h('span.openings__pr-line-caveat', 'small') : null,
      ]),
      h('span.openings__pr-line-nav', '\u2192'),
    ]);
  }

  // Target-line row: shows opponent's poor win % as the "why to aim here" signal.
  function renderTargetLineRow(line: PrepLine, onClick: () => void): VNode {
    const moveSan    = line.sans.slice(0, 5).join(' ') + (line.sans.length > 5 ? '\u2026' : '');
    const oppWinPct  = (line.opponentWinPct * 100).toFixed(0);
    return h('button.openings__pr-target-row', {
      attrs: { title: 'Open in Repertoire' },
      on: { click: onClick },
    }, [
      h('span.openings__pr-line-moves', moveSan),
      h('span.openings__pr-line-meta', [
        h('span.openings__pr-line-freq', `${line.frequency}g`),
        h('span.openings__pr-target-score', `opp ${oppWinPct}%W`),
        line.isRecent ? h('span.openings__pr-line-recent', 'recent') : null,
      ]),
      h('span.openings__pr-line-nav', '\u2192'),
    ]);
  }

  return h('div.openings__tool-content', [
    h('div.openings__prep-report', [

      // Header with recency toggle
      h('div.openings__pr-header', [
        h('span.openings__pr-label', 'Prep Report'),
        h('span.openings__pr-context', `${collection.target} · ${summary.totalGames} games`),
        h('div.openings__pr-recency-toggle', [
          h('button', {
            class: { 'openings__pr-recency-btn': true, active: recencyMode() === 'recent' },
            on: { click: () => { setRecencyMode('recent'); redraw(); } },
          }, 'Recent first'),
          h('button', {
            class: { 'openings__pr-recency-btn': true, active: recencyMode() === 'all-time' },
            on: { click: () => { setRecencyMode('all-time'); redraw(); } },
          }, 'All time'),
        ]),
      ]),

      // Auto-fallback notice when recent data is too sparse
      recencyMode() === 'recent' && summary.recency.last90 < 10
        ? h('div.openings__pr-sparse-banner', '\u26A0 Fewer than 10 games in the last 90 days — showing all-time data.')
        : null,

      // Small-sample warning banner
      isSparse ? h('div.openings__pr-sparse-banner', '\u26A0 Small sample size — statistics may not be reliable with fewer than 20 games.') : null,

      // Prep notes strip
      notes.length > 0 ? h('div.openings__pr-notes', notes.map(note =>
        h('div.openings__pr-note', {
          class: { 'openings__pr-note--low': note.confidence === 'low' },
        }, [
          h('span.openings__pr-note-title', note.title),
          h('span.openings__pr-note-body',  note.body),
        ])
      )) : null,

      // Overview: W/D/L bar + quick stats
      h('div.openings__pr-overview', [
        h('div.openings__pr-wdl', [
          h('div.openings__pr-wdl-bar', [
            h('span.wdl-w', { attrs: { style: `width:${wPct}%` } }, summary.overall.wins > 0   ? `${wPct}%` : ''),
            h('span.wdl-d', { attrs: { style: `width:${dPct}%` } }, summary.overall.draws > 0  ? `${dPct}%` : ''),
            h('span.wdl-l', { attrs: { style: `width:${lPct}%` } }, summary.overall.losses > 0 ? `${lPct}%` : ''),
          ]),
          h('div.openings__pr-wdl-counts', [
            h('span.wdl-w', `${summary.overall.wins}W`),
            h('span.wdl-d', `${summary.overall.draws}D`),
            h('span.wdl-l', `${summary.overall.losses}L`),
          ]),
        ]),
        // Top ECOs
        report.topEcos.length > 0 ? h('div.openings__pr-ecos', [
          h('div.openings__pr-section-title', 'Top Openings'),
          ...report.topEcos.slice(0, 5).map(eco =>
            h('div.openings__pr-eco-row', [
              h('span.openings__pr-eco-code', eco.eco),
              h('span.openings__pr-eco-name', eco.opening),
              h('span.openings__pr-eco-count', `${eco.count}g`),
            ])
          ),
        ]) : null,
      ]),

      // Two-column section grid: likely lines + target lines
      h('div.openings__pr-columns', [

        // Likely lines column — what the opponent is most likely to play
        h('div.openings__pr-col', [
          h('div.openings__pr-section-title', [
            'Likely Lines',
            h('span.openings__pr-section-hint', ' — expect these'),
          ]),
          likelyModule.lines.length > 0
            ? h('div.openings__pr-lines', likelyModule.lines.slice(0, 6).map(l =>
                renderLikelyLineRow(l, () => navToLine(l))
              ))
            : h('div.openings__pr-empty', 'Not enough data.'),
          !likelyModule.hasSufficientData
            ? h('div.openings__pr-caveat', 'Small sample — estimates are rough.')
            : null,
        ]),

        // Target lines column — lines to steer toward where opponent underperforms
        h('div.openings__pr-col', [
          h('div.openings__pr-section-title', [
            'Target Lines',
            h('span.openings__pr-section-hint', ' — steer here'),
          ]),
          lines.weakLines.length > 0
            ? h('div.openings__pr-lines', lines.weakLines.slice(0, 6).map(l =>
                renderTargetLineRow(l, () => navToLine(l))
              ))
            : h('div.openings__pr-empty', 'No reliable target lines found.'),
          lines.weakLines.length > 0
            ? h('div.openings__pr-caveat', 'Lines where opponent wins under 30%. Click to open in Repertoire.')
            : weaknessModule.entries.length > 0
              ? h('div.openings__pr-caveat', `${weaknessModule.entries.length} prep signal${weaknessModule.entries.length > 1 ? 's' : ''} detected below.`)
              : null,
        ]),
      ]),

      // Risk signals strip — drift and fresh-risk lines that don't meet target threshold
      weaknessModule.entries.filter(e => e.category !== 'low-score').length > 0
        ? h('div.openings__pr-risk-strip', [
            h('div.openings__pr-section-title', 'Prep Signals'),
            h('div.openings__pr-weaknesses', weaknessModule.entries
              .filter(e => e.category !== 'low-score')
              .map(e =>
                h('button.openings__pr-weakness-row', {
                  class: { [`openings__pr-weakness--${e.category}`]: true },
                  on: { click: () => navToLine(e.line) },
                }, [
                  h('span.openings__pr-weakness-label', e.label),
                  h('span.openings__pr-weakness-moves',
                    e.line.sans.slice(0, 4).join(' ') + (e.line.sans.length > 4 ? '\u2026' : '')),
                  h('span.openings__pr-weakness-freq', `${e.line.frequency}g`),
                  h('span.openings__pr-line-nav', '\u2192'),
                ])
              )
            ),
            weaknessModule.caveats.length > 0
              ? h('div.openings__pr-caveat', weaknessModule.caveats[0]!)
              : null,
          ])
        : null,

    ]),

    // --- Termination profile + game length ---
    renderTerminationAndLength(collection),

    // --- Opening recommendations ---
    renderRecommendations(weaknessModule, lines, summary.overall.total, navToLine),

    // --- Vulnerable positions (traps they fall for) ---
    renderVulnerablePositions(collection, redraw),
  ]);
}

// --- Termination + Game Length section ---

function renderTerminationAndLength(collection: ResearchCollection | null): VNode | null {
  if (!collection) return null;
  const target = collection.target ?? '';
  const term = computeTerminationProfile(collection.games, target);
  const len = computeGameLengthProfile(collection.games, target);

  if (term.total < 10 && len.totalCounted < 10) return null;

  const pct = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) : 0;
  const flagPct = pct(term.timeout, term.total);
  const isHighFlag = flagPct > 15;

  return h('div.openings__pr-term-section', [
    // Termination profile
    term.total >= 10 ? h('div.openings__pr-term-grid', [
      h('div.openings__pr-section-title', `How Games End (n=${term.total})`),
      h('div.openings__pr-term-stats', [
        h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Resign'),
          h('span.openings__pr-term-value', `${pct(term.resignation, term.total)}%`),
        ]),
        h('div.openings__pr-term-stat', {
          class: { 'openings__pr-term-stat--highlight': isHighFlag },
        }, [
          h('span.openings__pr-term-label', 'Timeout'),
          h('span.openings__pr-term-value', `${flagPct}%`),
          isHighFlag ? h('span.openings__pr-term-flag', '\u231B pressure!') : null,
        ]),
        h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Checkmate'),
          h('span.openings__pr-term-value', `${pct(term.checkmate, term.total)}%`),
        ]),
        h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Draw'),
          h('span.openings__pr-term-value', `${pct(term.drawAgreement + term.stalemate, term.total)}%`),
        ]),
      ]),
    ]) : null,

    // Game length
    len.totalCounted >= 10 ? h('div.openings__pr-length-grid', [
      h('div.openings__pr-section-title', `Game Length (n=${len.totalCounted})`),
      h('div.openings__pr-term-stats', [
        h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Avg'),
          h('span.openings__pr-term-value', `${len.avgLength} moves`),
        ]),
        h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Wins'),
          h('span.openings__pr-term-value', len.avgWinLength > 0 ? `${len.avgWinLength} moves` : '\u2014'),
        ]),
        h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Losses'),
          h('span.openings__pr-term-value', len.avgLossLength > 0 ? `${len.avgLossLength} moves` : '\u2014'),
        ]),
        len.shortGamePct > 0 ? h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Short (<20)'),
          h('span.openings__pr-term-value', `${len.shortGamePct}%`),
        ]) : null,
      ]),
    ]) : null,
  ]);
}

// --- Vulnerable positions (traps they fall for) ---

function renderVulnerablePositions(
  collection: ResearchCollection | null,
  redraw: () => void,
): VNode | null {
  if (!collection || !openingTree()) return null;

  const patterns = detectTrapPatterns(
    openingTree()!,
    colorFilter(),
    collection.games,
    collection.target ?? '',
  );
  const significant = patterns.filter(p => p.isSignificant);
  if (significant.length === 0) return null;

  return h('div.openings__pr-traps', [
    h('div.openings__pr-section-title', 'Vulnerable Positions'),
    h('div.openings__pr-traps-list', significant.slice(0, 6).map(trap =>
      h('button.openings__pr-trap-card', {
        on: { click: () => { navigateToPath(trap.path.slice(0, -1)); setActiveTool('opening-tree'); syncOpeningsBoard(redraw); redraw(); } },
      }, [
        h('div.openings__pr-trap-moves', trap.sans.slice(0, 5).join(' ')),
        h('div.openings__pr-trap-detail', [
          h('span', `plays ${trap.opponentMove}`),
          h('span.openings__pr-trap-losses', `loses ${trap.losses}/${trap.totalAtNode} (${Math.round(trap.losses / trap.totalAtNode * 100)}%)`),
        ]),
        h('span.openings__pr-line-nav', '\u2192'),
      ])
    )),
  ]);
}

// --- Opening recommendations section ---

function renderRecommendations(
  weakness: import('./analytics').WeaknessModule,
  lines: import('./analytics').PrepReportLines,
  totalGames: number,
  navToLine: (line: PrepLine) => void,
): VNode | null {
  const recs = computeOpeningRecommendations(weakness, lines, totalGames);
  if (recs.length === 0) return null;

  return h('div.openings__pr-recs', [
    h('div.openings__pr-section-title', 'Recommended Preparation'),
    h('div.openings__pr-recs-list', recs.map(rec =>
      h('button.openings__pr-rec-card', {
        class: { [`openings__pr-rec--${rec.confidence}`]: true },
        on: { click: () => navToLine(rec.line) },
      }, [
        h('div.openings__pr-rec-action', rec.actionLabel),
        h('div.openings__pr-rec-reason', rec.reason),
        h('span.openings__pr-line-nav', '\u2192'),
      ])
    )),
  ]);
}

/**
 * Style dashboard — renders a full-page portrait of the opponent's opening identity:
 * first-move tendencies, predictability, recent form, and synthesized style signals.
 *
 * Grounded in `StyleViewModel` which wraps only what the imported data can honestly support.
 * Signals are labeled as 'descriptive', 'interpretive', or 'cautious' to control display tone.
 */
function renderStyleTool(): VNode {
  const collection = activeCollection();
  const vm = getStyleViewModel();

  if (!vm || !collection) {
    return h('div.openings__tool-content', [
      h('div.openings__style', [
        h('div.openings__style-header', [
          h('span.openings__style-label', 'Style'),
        ]),
        treeBuilding()
          ? h('div.openings__style-loading', 'Building tree\u2026')
          : h('div.openings__style-loading', 'Open a collection to see Style.'),
      ]),
    ]);
  }

  return h('div.openings__tool-content', [
    h('div.openings__style', [
      renderStyleHeader(collection, vm),
      renderStylePlayerCard(vm),
      renderStyleAxesBars(vm),
      renderStyleSignals(vm),
      renderStyleFirstMoves(vm),
      renderStyleForm(vm),
      renderStyleBehavioral(vm),
    ]),
  ]);
}

function renderStyleHeader(collection: ResearchCollection, vm: StyleViewModel): VNode {
  const conf = vm.overallConfidence;
  const confLabel = conf === 'insufficient' ? 'Insufficient data'
    : conf === 'low'          ? 'Low confidence'
    : conf === 'medium'       ? 'Medium confidence'
    : 'High confidence';
  const n = vm.form.baseline.wdl.total;

  return h('div.openings__style-header', [
    h('span.openings__style-label', 'Style'),
    h('span.openings__style-context', `${collection.target} · ${n} games`),
    h('span.openings__style-confidence', {
      class: { [`openings__style-conf--${conf}`]: true },
    }, confLabel),
  ]);
}

/**
 * Derive a single archetype label from the StyleViewModel.
 * Labels are useful descriptions, not personality verdicts.
 * Uses a priority-ordered check so the most distinctive trait wins.
 */
function deriveArchetype(vm: StyleViewModel): { label: string; qualifier: string } | null {
  if (vm.overallConfidence === 'insufficient') return null;

  const { profile, form } = vm;
  const n = form.baseline.wdl.total;
  if (n < 5) return null;

  const drawRate = form.baseline.wdl.draws / (n || 1);
  const gambitsSignal = vm.signals.find(s => s.label.includes('named gambits'));
  const gambitsHighPct = (() => {
    if (!gambitsSignal) return 0;
    const m = gambitsSignal.label.match(/^(\d+)%/);
    return m ? parseInt(m[1]!, 10) : 0;
  })();

  // Ordered priority checks
  if (gambitsHighPct >= 30) {
    return { label: 'Gambit Player', qualifier: `${gambitsHighPct}% of games involve named gambits` };
  }
  if (profile.normalizedEntropy < 0.3 && profile.topFirstMovePct >= 0.7) {
    return {
      label: 'One-Trick Specialist',
      qualifier: `${Math.round(profile.topFirstMovePct * 100)}% of games open the same way`,
    };
  }
  if (profile.normalizedEntropy < 0.45) {
    return { label: 'Book Player', qualifier: 'Consistent, narrow opening repertoire' };
  }
  if (drawRate >= 0.35) {
    return { label: 'Draw Specialist', qualifier: `${Math.round(drawRate * 100)}% draw rate` };
  }
  if (profile.normalizedEntropy > 0.65) {
    return { label: 'Versatile Opponent', qualifier: 'Broad, unpredictable repertoire' };
  }
  return { label: 'Solid Repertoire', qualifier: 'Moderate opening variety' };
}

/**
 * Player card — at-a-glance identity panel.
 * Shows the archetype label (if derivable) and overall W/D/L as a bar.
 */
function renderStylePlayerCard(vm: StyleViewModel): VNode | null {
  const n = vm.form.baseline.wdl.total;
  if (n < 5) return null;

  const archetype = deriveArchetype(vm);
  const wdl = vm.form.baseline.wdl;
  const t   = wdl.total || 1;
  const wP  = (wdl.wins   / t * 100).toFixed(0);
  const dP  = (wdl.draws  / t * 100).toFixed(0);
  const lP  = (wdl.losses / t * 100).toFixed(0);

  return h('div.openings__style-player-card', [
    archetype ? h('div.openings__style-archetype', [
      h('span.openings__style-archetype-label', archetype.label),
      h('span.openings__style-archetype-qualifier', archetype.qualifier),
    ]) : null,
    h('div.openings__style-card-wdl', [
      h('div.openings__style-wdl-bar', [
        h('span.wdl-w', { attrs: { style: `width:${wP}%` } }),
        h('span.wdl-d', { attrs: { style: `width:${dP}%` } }),
        h('span.wdl-l', { attrs: { style: `width:${lP}%` } }),
      ]),
      h('div.openings__style-wdl-counts', [
        h('span.wdl-w', `${wdl.wins}W`),
        h('span.wdl-d', `${wdl.draws}D`),
        h('span.wdl-l', `${wdl.losses}L`),
      ]),
    ]),
  ]);
}

/**
 * Style-axis bars — compact visual representation of key style dimensions.
 * Each axis is a labeled bar placed between two poles.
 */
function renderStyleAxesBars(vm: StyleViewModel): VNode | null {
  const n = vm.form.baseline.wdl.total;
  if (n < 10) return null;

  const { profile } = vm;

  // Predictability axis: narrow (0) → broad (1)
  const predictPct = Math.round(profile.normalizedEntropy * 100);

  // Comfort zone: concentrated (high top3EcoPct) → varied (low top3EcoPct)
  // Invert so "concentrated" = left pole on bar
  const comfortPct = Math.round((1 - profile.top3EcoPct) * 100);

  const axes: Array<{ label: string; leftPole: string; rightPole: string; pct: number }> = [];

  if (profile.distinctFirstMoves > 1) {
    axes.push({ label: 'Repertoire breadth', leftPole: 'Narrow', rightPole: 'Broad', pct: predictPct });
  }
  if (profile.top3EcoPct > 0) {
    axes.push({ label: 'Opening variety', leftPole: 'Concentrated', rightPole: 'Varied', pct: comfortPct });
  }

  if (axes.length === 0) return null;

  return h('div.openings__style-axes', [
    h('div.openings__style-section-title', 'Style axes'),
    h('div.openings__style-axes-list',
      axes.map(axis =>
        h('div.openings__style-axis-row', [
          h('span.openings__style-axis-label', axis.label),
          h('div.openings__style-axis-track', [
            h('span.openings__style-axis-pole', axis.leftPole),
            h('div.openings__style-axis-bar-wrap', [
              h('div.openings__style-axis-bar', {
                attrs: { style: `left:${axis.pct}%` },
              }),
            ]),
            h('span.openings__style-axis-pole', axis.rightPole),
          ]),
        ])
      )
    ),
  ]);
}

function renderStyleSignals(vm: StyleViewModel): VNode | null {
  const { signals } = vm;
  if (signals.length === 0) return null;

  const descriptive  = signals.filter(s => s.type === 'descriptive');
  const interpretive = signals.filter(s => s.type === 'interpretive');
  const cautious     = signals.filter(s => s.type === 'cautious');

  function renderSignal(s: (typeof signals)[number]): VNode {
    return h('div.openings__style-signal', {
      class: {
        [`openings__style-signal--${s.type}`]: true,
        [`openings__style-signal--${s.confidence}`]: true,
      },
    }, [
      h('span.openings__style-signal-label', s.label),
      s.caveat ? h('span.openings__style-signal-caveat', s.caveat) : null,
    ]);
  }

  return h('div.openings__style-signals', [
    descriptive.length > 0 ? h('div.openings__style-signals-group', [
      h('div.openings__style-signals-title', 'Observed facts'),
      ...descriptive.map(renderSignal),
    ]) : null,
    interpretive.length > 0 ? h('div.openings__style-signals-group', [
      h('div.openings__style-signals-title', 'Inferences'),
      ...interpretive.map(renderSignal),
    ]) : null,
    cautious.length > 0 ? h('div.openings__style-signals-group', [
      h('div.openings__style-signals-title', 'Behavioral tendencies'),
      ...cautious.map(renderSignal),
    ]) : null,
  ]);
}

function renderStyleFirstMoves(vm: StyleViewModel): VNode {
  const { asWhite, asBlack } = vm.style;

  function renderMoveBar(m: (typeof asWhite.firstMoves)[number]): VNode {
    const pct = Math.round(m.pct * 100);
    return h('div.openings__style-move-row', [
      h('span.openings__style-move-san', m.san),
      h('div.openings__style-move-bar-wrap', [
        h('div.openings__style-move-bar', {
          attrs: { style: `width:${pct}%` },
        }),
      ]),
      h('span.openings__style-move-pct', `${pct}%`),
      h('span.openings__style-move-count', `(${m.count}g)`),
    ]);
  }

  return h('div.openings__style-first-moves', [
    h('div.openings__style-fm-col', [
      h('div.openings__style-section-title', 'As White'),
      asWhite.firstMoves.length > 0
        ? h('div.openings__style-move-list', asWhite.firstMoves.slice(0, 5).map(renderMoveBar))
        : h('div.openings__style-empty', 'No data'),
    ]),
    h('div.openings__style-fm-col', [
      h('div.openings__style-section-title', 'As Black'),
      asBlack.firstMoves.length > 0
        ? h('div.openings__style-move-list', asBlack.firstMoves.slice(0, 5).map(renderMoveBar))
        : h('div.openings__style-empty', 'No data'),
    ]),
  ]);
}

function renderStyleForm(vm: StyleViewModel): VNode | null {
  const { form } = vm;
  const baseline = form.baseline.wdl;
  const last90   = form.last90.wdl;
  const last30   = form.last30.wdl;

  if (baseline.total < 5) return null;

  function wdlBar(wdl: typeof baseline): VNode {
    const t = wdl.total || 1;
    const wP = (wdl.wins   / t * 100).toFixed(0);
    const dP = (wdl.draws  / t * 100).toFixed(0);
    const lP = (wdl.losses / t * 100).toFixed(0);
    return h('div.openings__style-wdl-row', [
      h('div.openings__style-wdl-bar', [
        h('span.wdl-w', { attrs: { style: `width:${wP}%` } }),
        h('span.wdl-d', { attrs: { style: `width:${dP}%` } }),
        h('span.wdl-l', { attrs: { style: `width:${lP}%` } }),
      ]),
      h('div.openings__style-wdl-counts', [
        h('span.wdl-w', `${wdl.wins}W`),
        h('span.wdl-d', `${wdl.draws}D`),
        h('span.wdl-l', `${wdl.losses}L`),
        h('span.openings__style-wdl-total', `n=${wdl.total}`),
      ]),
    ]);
  }

  const trendLabel = form.recentTrend === 'improving'    ? '\u2191 Improving recently'
    : form.recentTrend === 'declining'    ? '\u2193 Declining recently'
    : form.recentTrend === 'stable'       ? '\u2014 Stable'
    : null;

  return h('div.openings__style-form', [
    h('div.openings__style-section-title', 'Form'),
    h('div.openings__style-form-periods', [
      h('div.openings__style-form-row', [
        h('span.openings__style-form-label', 'All time'),
        wdlBar(baseline),
      ]),
      last90.total >= 3 ? h('div.openings__style-form-row', [
        h('span.openings__style-form-label', 'Last 90d'),
        wdlBar(last90),
      ]) : null,
      last30.total >= 3 ? h('div.openings__style-form-row', [
        h('span.openings__style-form-label', 'Last 30d'),
        wdlBar(last30),
      ]) : null,
    ]),
    trendLabel ? h('div.openings__style-trend', trendLabel) : null,
    form.recentTrend !== 'insufficient-data'
      ? h('div.openings__style-form-caveat', 'Based on win-rate change only — not engine-backed.')
      : null,
  ]);
}

/**
 * Behavioral tendency module — shows opening commitment, repertoire switching signals,
 * and stability indicators derived from FormData and RepertoireProfile.
 *
 * Deliberately avoids psychological claims. Language stays at the level of
 * observable patterns in the game history.
 */
function renderStyleBehavioral(vm: StyleViewModel): VNode | null {
  const { form, profile } = vm;
  const n = form.baseline.wdl.total;
  if (n < 10) return null;

  const items: VNode[] = [];

  // --- Opening commitment ---
  // high top3EcoPct = committed to a small set; low = experimenting
  const top3Pct = Math.round(profile.top3EcoPct * 100);
  if (profile.top3EcoPct > 0) {
    let commitLabel: string;
    let commitDetail: string;
    if (profile.top3EcoPct >= 0.75) {
      commitLabel = 'High opening commitment';
      commitDetail = `${top3Pct}% of games in top 3 openings — stays in familiar territory`;
    } else if (profile.top3EcoPct >= 0.5) {
      commitLabel = 'Moderate opening commitment';
      commitDetail = `${top3Pct}% of games in top 3 openings — some variety`;
    } else {
      commitLabel = 'Low opening commitment';
      commitDetail = `Only ${top3Pct}% of games in top 3 openings — experiments frequently`;
    }
    items.push(h('div.openings__style-behavioral-row', [
      h('span.openings__style-behavioral-label', commitLabel),
      h('span.openings__style-behavioral-detail', commitDetail),
    ]));
  }

  // --- ECO switching — recent vs all-time ---
  // If the recent topEco differs from the baseline topEco, they may have switched lines.
  const recentEco   = form.last90.topEco;
  const baselineEco = form.baseline.topEco;
  if (recentEco && baselineEco && recentEco !== baselineEco && form.last90.datedGameCount >= 5) {
    items.push(h('div.openings__style-behavioral-row', [
      h('span.openings__style-behavioral-label', 'Recent opening shift'),
      h('span.openings__style-behavioral-detail',
        `${baselineEco} historically → ${recentEco} in last 90 days`,
      ),
      h('span.openings__style-behavioral-caveat', 'May reflect prep change or one-off experiment.'),
    ]));
  }

  // --- No switching indicator (stability) ---
  if (recentEco && baselineEco && recentEco === baselineEco && form.last90.datedGameCount >= 5) {
    items.push(h('div.openings__style-behavioral-row', [
      h('span.openings__style-behavioral-label', 'Stable opening choice'),
      h('span.openings__style-behavioral-detail',
        `Same primary opening (${baselineEco}) in recent and all-time games`,
      ),
    ]));
  }

  if (items.length === 0) return null;

  return h('div.openings__style-behavioral', [
    h('div.openings__style-section-title', 'Behavioral tendencies'),
    h('div.openings__style-behavioral-caveat-banner',
      'These are observed patterns only — not psychological assessments.'),
    h('div.openings__style-behavioral-list', items),
  ]);
}

/**
 * Practice Against Them — board-led training mode.
 *
 * Returns two grid children: board column + practice panel.
 * The board is always visible as the center of gravity.
 *
 * Pre-session (no active PracticeSession):
 *   Shows color picker + "Start" button.
 *
 * Active session:
 *   Shows opponent source banner (repertoire / engine / exhausted),
 *   session info, and a Stop button.
 *
 * Game loop automation (opponent auto-play) is NOT wired in this prompt.
 * That comes in the next prompt. This shell establishes ownership and layout only.
 */
function renderPracticeTool(
  collection: ResearchCollection | null,
  node: OpeningTreeNode | null,
  redraw: () => void,
): VNode[] {
  const session = practiceSession();

  return [
    // Board column — same layout as Opening Tree
    h('div.openings__board-col', [
      renderPlayerStrip(collection, 'top'),
      h('div.openings__board-wrap', [
        renderOpeningsBoard(node, redraw),
      ]),
      renderPlayerStrip(collection, 'bottom'),
    ]),

    // Practice panel
    h('div.openings__session-panel openings__practice-panel', [
      session
        ? renderPracticeActivePanel(node, session, redraw)
        : renderPracticeSetupPanel(collection, node, redraw),
    ]),
  ];
}

/**
 * Pre-session panel: color picker and Start Practice button.
 */
function renderPracticeSetupPanel(
  collection: ResearchCollection | null,
  node: OpeningTreeNode | null,
  redraw: () => void,
): VNode {
  // Pick a default start color: play as the non-opponent side.
  // If color filter is set, user plays opposite of opponent's usual color.
  const suggestedColor: 'white' | 'black' =
    colorFilter() === 'black' ? 'white' : 'black';

  const target = collection?.target ?? 'them';

  let _selectedColor: 'white' | 'black' = suggestedColor;

  function handleStart(color: 'white' | 'black') {
    const fen = node?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    startPractice(color, fen);
    redraw();
  }

  return h('div.openings__practice-setup', [
    h('div.openings__practice-setup-title', `Practice Against ${target}`),
    h('div.openings__practice-setup-desc',
      `Play from the current position. ${target} will respond using their imported opening lines while repertoire data is available, then the engine takes over.`),
    h('div.openings__practice-color-picker', [
      h('span.openings__practice-color-label', 'You play as'),
      h('div.openings__practice-color-btns', [
        h('button.openings__practice-color-btn', {
          class: { 'openings__practice-color-btn--active': suggestedColor === 'white' },
          on: { click: () => { _selectedColor = 'white'; handleStart('white'); } },
        }, 'White'),
        h('button.openings__practice-color-btn', {
          class: { 'openings__practice-color-btn--active': suggestedColor === 'black' },
          on: { click: () => { _selectedColor = 'black'; handleStart('black'); } },
        }, 'Black'),
      ]),
    ]),
    h('div.openings__practice-strength', [
      h('span.openings__practice-strength-label', 'Engine strength'),
      renderStrengthSelector(getPlayStrengthLevel(), (level) => {
        setPlayStrengthLevel(level);
        redraw();
      }),
    ]),
    h('div.openings__practice-setup-note',
      'Selecting a color starts practice immediately.'),
  ]);
}

/**
 * Active session panel: opponent source banner + session info + Stop button.
 */
function renderPracticeActivePanel(
  node: OpeningTreeNode | null,
  session: ReturnType<typeof practiceSession>,
  redraw: () => void,
): VNode {
  if (!session) return h('div'); // type narrowing only; never reached

  const plan = planOpponentTurn(node, session);

  const engineStrength = plan.source === 'engine'
    ? STRENGTH_LEVELS[(session.strengthLevel ?? 4) - 1] ?? STRENGTH_LEVELS[3]!
    : null;
  const sourceBannerText = plan.source === 'repertoire'
    ? 'Playing from imported repertoire'
    : plan.source === 'engine' && engineStrength
      ? `Engine playing at Level ${engineStrength.level} (${engineStrength.label} ~${engineStrength.uciElo} Elo)`
      : plan.source === 'engine'
        ? 'Engine has taken over — repertoire data exhausted'
        : 'No moves available — practice has ended at this branch';

  const sourceBannerClass = plan.source === 'repertoire'
    ? 'openings__practice-source--repertoire'
    : plan.source === 'engine'
      ? 'openings__practice-source--engine'
      : 'openings__practice-source--exhausted';

  const moveCount = session.moveHistory.length;

  return h('div.openings__practice-active', [
    h('div.openings__practice-source-banner', {
      class: { [sourceBannerClass]: true },
    }, [
      h('span.openings__practice-source-icon',
        plan.source === 'repertoire' ? '●' : plan.source === 'engine' ? '⚡' : '✕'),
      h('span.openings__practice-source-text', sourceBannerText),
    ]),

    plan.selectionResult.totalFrequency > 0
      ? h('div.openings__practice-freq-note',
        `Opponent played this position ${plan.selectionResult.totalFrequency} time${plan.selectionResult.totalFrequency !== 1 ? 's' : ''} in imported games`)
      : null,

    h('div.openings__practice-controls', [
      h('div.openings__practice-stat', `Moves played: ${moveCount}`),
      h('div.openings__practice-stat', `Playing as: ${session.userColor}`),
    ]),

    h('button.openings__practice-stop-btn', {
      on: { click: () => { stopPractice(); redraw(); } },
    }, 'Stop Practice'),
  ]);
}

/**
 * Repertoire tool owner — renders the board column and session panel that make up
 * the current opening-tree experience. Returns two grid children so the session body
 * can spread them into the layout alongside the tool rail.
 *
 * Ownership boundary: board, player strips, move list, explorer, sample games, engine.
 * Session shell owns: header row, tool rail, dispatching to this function.
 */
function renderOpeningTreeTool(
  collection: ResearchCollection | null,
  node: OpeningTreeNode | null,
  path: readonly string[],
  redraw: () => void,
): VNode[] {
  return [
    h('div.openings__board-col', [
      renderPlayerStrip(collection, 'top'),
      h('div.openings__board-wrap', [
        renderOpeningsBoard(node, redraw),
      ]),
      renderPlayerStrip(collection, 'bottom'),
    ]),
    h('div.openings__session-panel', [
      renderOpeningsActionMenu(redraw),
      // Keep FEN override in sync with the current openings position on every render.
      // setCevalFenOverride also calls setEvalFenOverride so engine/ctrl uses the right FEN.
      (() => {
        setCevalFenOverride(node?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
        return null;
      })(),
      renderColorToggle(collection?.target ?? '', redraw),
      treeBuilding() ? renderTreeBuildBar() : null,
      // Engine section at the top of the panel, before position-context content.
      renderCeval(),
      renderEngineSettings(),
      engineEnabled ? renderPvBox() : null,
      // Position context: played lines + sample games appear together for integrated browsing.
      node ? renderPlayedLinesPanel(node, redraw) : null,
      renderDeviationPanel(redraw),
      renderSampleGamesPanel(),
      // Navigation and analysis controls below the position context.
      openingTree() ? renderOpeningsMoveList(openingTree()!, path, node, redraw) : null,
      renderExplorerToggle(node, redraw),
    ]),
  ];
}

/**
 * Repertoire dashboard — shows the prep-zone analytics for the active collection.
 * Overview, summary modules, and line insight cards without a board.
 * Spans the full content area via openings__tool-content grid layout.
 */
function renderRepertoireDashboard(
  collection: ResearchCollection | null,
  redraw: () => void,
): VNode {
  return h('div.openings__tool-content', [
    h('div.openings__prep-zone', treeBuilding()
      ? [h('div.openings__prep-zone-loading', 'Building tree\u2026')]
      : [
          collection ? renderRepertoireOverview(collection) : null,
          renderRepertoireSummaryModules(redraw),
          renderLineInsightCards(redraw),
        ]
    ),
  ]);
}

let _keyHandler: ((e: KeyboardEvent) => void) | null = null;

function renderSessionPage(redraw: () => void): VNode {
  const collection = activeCollection();
  const node = sessionNode();
  const path = sessionPath();

  return h('div.openings.openings--session', {
    hook: {
      insert: () => {
        _keyHandler = (e: KeyboardEvent) => {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateBack();
            syncOpeningsBoard(redraw);
            redraw();
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            const cur = sessionNode();
            if (cur && cur.children.length > 0) {
              navigateToMove(cur.children[0]!.uci);
              syncOpeningsBoard(redraw);
              redraw();
            }
          } else if (e.key === 'Home') {
            e.preventDefault();
            navigateToRoot();
            syncOpeningsBoard(redraw);
            redraw();
          }
        };
        document.addEventListener('keydown', _keyHandler);
      },
      destroy: () => {
        if (_keyHandler) {
          document.removeEventListener('keydown', _keyHandler);
          _keyHandler = null;
        }
      },
    },
  }, [
    h('div.openings__session-header', [
      h('button.openings__back-lib-btn', {
        on: { click: () => { _openingsCg = undefined; setCevalFenOverride(null); closeSession(); redraw(); } },
      }, '\u2190 Library'),
      h('h2.openings__session-title', collection?.name ?? 'Opponent Research'),
      h('span.openings__session-meta', node
        ? `${node.total} game${node.total !== 1 ? 's' : ''} reached this position`
        : ''),
    ]),
    h('div.openings__session-body', [
      renderToolRail(redraw),
      // Active tool owns the main content area.
      ...(activeTool() === 'opening-tree'
        ? renderOpeningTreeTool(collection, node, path, redraw)
        : activeTool() === 'repertoire'
          ? [renderRepertoireDashboard(collection, redraw)]
          : activeTool() === 'prep-report'
            ? [renderPrepReportTool(redraw)]
            : activeTool() === 'style'
              ? [renderStyleTool()]
              : activeTool() === 'practice'
                ? renderPracticeTool(collection, node, redraw)
                : [renderToolPlaceholder(activeTool())]),
    ]),
  ]);
}

/**
 * Player strip showing the target user and opponent labels around the board.
 * The target (researched player) appears on the side matching their color.
 */
function renderPlayerStrip(
  collection: ResearchCollection | null,
  position: 'top' | 'bottom',
): VNode {
  const target = collection?.target ?? 'Player';
  const orientation = boardOrientation();
  const filter = colorFilter();

  // Determine which color label goes on which side of the board
  // Bottom = the side the board is oriented toward
  // When orientation = 'white': bottom = white, top = black
  // When orientation = 'black': bottom = black, top = white
  const bottomColor: 'white' | 'black' = orientation;
  const topColor: 'white' | 'black' = orientation === 'white' ? 'black' : 'white';
  const stripColor = position === 'bottom' ? bottomColor : topColor;

  // Is the target player on this side?
  let label: string;
  let isTarget = false;
  if (filter === 'white') {
    isTarget = stripColor === 'white';
    label = isTarget ? target : 'Imported Game Opponents';
  } else if (filter === 'black') {
    isTarget = stripColor === 'black';
    label = isTarget ? target : 'Imported Game Opponents';
  } else {
    // 'both' — show target on bottom, opponents on top
    isTarget = position === 'bottom';
    label = isTarget ? target : 'Imported Game Opponents';
  }

  const colorDot = stripColor === 'white' ? '\u25CB' : '\u25CF'; // ○ or ●

  return h('div.openings__player-strip', {
    class: {
      'openings__player-strip--target': isTarget,
      'openings__player-strip--top': position === 'top',
      'openings__player-strip--bottom': position === 'bottom',
    },
  }, [
    h('span.openings__player-dot', colorDot),
    h('span.openings__player-name', label),
  ]);
}

// Icon codepoints for first/prev/next/last navigation buttons.
// Adapted from lichess-org/lila: ui/lib/src/licon.ts
/**
 * Convert the opening session path into a minimal TreeNode chain for renderMoveList.
 * Each node gets a 2-char hex ID so paths concatenate cleanly (e.g. "000102").
 * Adapted from lichess-org/lila: ui/lib/src/tree/types.ts TreeNode shape.
 */
function buildOpeningsMoveTree(
  tree: OpeningTreeNode,
  path: readonly string[],
): { root: TreeNode; currentPath: string } {
  const root: TreeNode = {
    id: '', ply: 0, fen: tree.fen,
    children: [], glyphs: [], comments: [],
  };
  let treeNode = root;
  let openingNode: OpeningTreeNode = tree;
  for (let i = 0; i < path.length; i++) {
    const child = openingNode.children.find(c => c.uci === path[i]);
    if (!child) break;
    const id = i.toString(16).padStart(2, '0');
    const next: TreeNode = {
      id, ply: i + 1, uci: child.uci, san: child.san, fen: child.fen,
      children: [], glyphs: [], comments: [],
    };
    treeNode.children.push(next);
    treeNode = next;
    openingNode = child;
  }
  const currentPath = Array.from(
    { length: path.length },
    (_, i) => i.toString(16).padStart(2, '0'),
  ).join('');
  return { root, currentPath };
}

/**
 * White / Black perspective toggle — placed directly beneath the move list.
 * Replaces the action-menu Color section for faster, always-visible access.
 */
function renderColorToggle(playerName: string, redraw: () => void): VNode {
  const filter = colorFilter();
  return h('div.openings__color-toggle', [
    h('button', {
      class: { active: filter === 'white', 'white-btn': true },
      attrs: { title: 'Show games as White' },
      on: { click: () => {
        if (filter === 'white') return;
        _lastBoardFen = '';
        setColorFilter('white', redraw);
        syncOpeningsBoard(redraw);
        redraw();
      } },
    }, [
      h('span.openings__color-username', filter === 'white' ? playerName : ''),
      h('span.openings__color-label', [h('span.openings__color-dot', '○'), '\u00a0White']),
    ]),
    h('button', {
      class: { active: filter === 'black', 'black-btn': true },
      attrs: { title: 'Show games as Black' },
      on: { click: () => {
        if (filter === 'black') return;
        _lastBoardFen = '';
        setColorFilter('black', redraw);
        syncOpeningsBoard(redraw);
        redraw();
      } },
    }, [
      h('span.openings__color-username', filter === 'black' ? playerName : ''),
      h('span.openings__color-label', [h('span.openings__color-dot', '●'), '\u00a0Black']),
    ]),
    // Flip button — inline, icon-only, sized like the book button in the nav bar.
    // Adapted from lichess-org/lila: ui/analyse/src/view/actionMenu.ts
    //   attrs: { 'data-icon': licon.ChasingArrows, title: 'Hotkey: f' }
    h('button.openings__color-flip', {
      attrs: { 'data-icon': '\ue020', title: 'Flip board (f)' },
      on: { click: () => {
        flipBoard();
        if (_openingsCg) _openingsCg.set({ orientation: boardOrientation() });
        redraw();
      } },
    }),
  ]);
}

/**
 * Render the move list for the current opening line using the analysis-board
 * tview2 column layout, followed by the move-nav-bar navigation bar.
 * Placed between the lines panel and the sample games panel.
 * Adapted from lichess-org/lila: ui/analyse/src/treeView/columnView.ts + controls.ts
 */
let _saveFeedback: string | null = null;
let _saveFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

function handleSaveLine(path: readonly string[], redraw: () => void): void {
  const collection = activeCollection();
  if (!collection || path.length < 3) return;

  // Build SAN sequence from tree
  const tree = openingTree();
  if (!tree) return;
  const sans: string[] = [];
  let current: import('./tree').OpeningTreeNode = tree;
  for (const uci of path) {
    const child = current.children.find(c => c.uci === uci);
    if (!child) break;
    sans.push(child.san);
    current = child;
  }

  const variation: SavedVariation = {
    id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    collectionId: collection.id,
    moves: [...path],
    sans,
    trainAs: boardOrientation(),
    createdAt: Date.now(),
  };

  saveVariation(variation);
  _saveFeedback = 'Saved!';
  if (_saveFeedbackTimer) clearTimeout(_saveFeedbackTimer);
  _saveFeedbackTimer = setTimeout(() => { _saveFeedback = null; redraw(); }, 1500);
  redraw();
}

function renderOpeningsMoveList(
  tree: OpeningTreeNode,
  path: readonly string[],
  node: OpeningTreeNode | null,
  redraw: () => void,
): VNode {
  const { root, currentPath } = buildOpeningsMoveTree(tree, path);

  const navigate = (treePath: string) => {
    const depth = treePath.length / 2;
    navigateToPath([...sessionPath().slice(0, depth)]);
    syncOpeningsBoard(redraw);
    redraw();
  };

  const canPrev = path.length > 0;
  const canNext = node !== null && node.children.length > 0;

  return h('div.openings__move-list', [
    h('div.analyse__moves.areplay', [
      renderMoveList(root, currentPath, () => undefined, navigate, null, false),
    ]),
    // Save to training button (visible when line is >= 3 moves)
    path.length >= 3 ? h('div.openings__save-line-row', [
      _saveFeedback
        ? h('span.openings__save-feedback', _saveFeedback)
        : h('button.openings__save-line-btn', {
            on: { click: () => handleSaveLine(path, redraw) },
          }, '\u2B50 Save line to training'),
    ]) : null,
    renderMoveNavBar([], {
      canPrev,
      canNext,
      first:      () => { navigateToRoot(); syncOpeningsBoard(redraw); redraw(); },
      prev:       () => { navigateBack(); syncOpeningsBoard(redraw); redraw(); },
      next:       () => {
        if (node && node.children.length > 0) {
          navigateToMove(node.children[0]!.uci);
          syncOpeningsBoard(redraw);
          redraw();
        }
      },
      last:       () => { navigateToEnd(); syncOpeningsBoard(redraw); redraw(); },
      bookActive: explorerCtrl.enabled,
      onBook:     () => {
        explorerCtrl.toggle();
        if (explorerCtrl.enabled && node) explorerCtrl.setNode(node.fen, redraw);
        redraw();
      },
      rightSlot: h('button.fbt', {
        class: { active: _openingsMenuOpen },
        attrs: { 'data-icon': ICON_HAMBURGER, title: 'Opponents menu' },
        on:    { click: () => { _openingsMenuOpen = !_openingsMenuOpen; redraw(); } },
      }),
    }),
  ]);
}

function renderOpeningsBoard(node: OpeningTreeNode | null, redraw: () => void): VNode {
  const fen = node?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  return h('div.cg-wrap.openings__board', {
    key: 'openings-board',
    hook: {
      insert: (vnode) => {
        const dests = destsForFen(fen);
        _lastBoardFen = fen;
        setCevalFenOverride(fen);
        _openingsCg = makeChessground(vnode.elm as HTMLElement, {
          fen,
          orientation: boardOrientation(),
          viewOnly: false,
          movable: {
            free: false,
            color: 'both',
            dests,
          },
          draggable: {
            enabled: true,
            showGhost: true,
          },
          drawable: {
            enabled: true,
            brushes: {
              green:    { key: 'g',  color: '#15781B', opacity: 0.8,  lineWidth: 10 },
              red:      { key: 'r',  color: '#882020', opacity: 0.8,  lineWidth: 10 },
              blue:     { key: 'b',  color: '#003088', opacity: 0.8,  lineWidth: 10 },
              yellow:   { key: 'y',  color: '#e6a520', opacity: 0.55, lineWidth: 8 },
              paleGrey: { key: 'pg', color: '#888888', opacity: 0.35, lineWidth: 6 },
              ...FREQ_BRUSHES,
            },
          },
          events: {
            move: (orig, dest) => {
              const uci = `${orig}${dest}`;
              const current = sessionNode();
              const session = practiceSession();

              if (session && session.running) {
                // Practice mode: only accept moves on the user's turn.
                // The FEN turn character determines whose move it is.
                const fen = current?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
                const fenTurn = fen.split(' ')[1]; // 'w' or 'b'
                const isUserTurn =
                  (session.userColor === 'white' && fenTurn === 'w') ||
                  (session.userColor === 'black' && fenTurn === 'b');

                if (!isUserTurn) return; // Not user's turn — board reverts automatically

                if (current) {
                  // Navigate tree if move is in children; otherwise no tree movement.
                  // Chessground already validated legality via dests.
                  const match = current.children.find(c =>
                    c.uci === uci || c.uci.startsWith(uci),
                  );
                  if (match) {
                    navigateToMove(match.uci);
                    recordPracticeMove(match.uci);
                    syncOpeningsBoard(redraw);
                    redraw();
                    // Schedule the opponent's response after user's move lands.
                    schedulePracticeOpponentResponse(redraw);
                  } else {
                    // Move is legal but not in the tree: board will revert (no tree navigation).
                    // The user played an off-tree move — just revert silently.
                    syncOpeningsBoard(redraw);
                  }
                }
              } else {
                // Browse mode: navigate tree children only.
                if (current) {
                  const match = current.children.find(c =>
                    c.uci === uci || c.uci.startsWith(uci),
                  );
                  if (match) {
                    navigateToMove(match.uci);
                    syncOpeningsBoard(redraw);
                    redraw();
                  }
                }
              }
            },
          },
        });
        bindBoardResizeHandle(vnode.elm as HTMLElement);
        // Draw initial arrows for the starting position
        if (node && _openingsCg) {
          _openingsCg.setAutoShapes(buildFrequencyArrows(node));
        }
      },
      postpatch: () => {
        // Sync arrows on every redraw (tree may have updated from background build)
        if (node && _openingsCg) {
          _openingsCg.setAutoShapes(buildFrequencyArrows(node));
        }
      },
      destroy: () => {
        _lastBoardFen = '';
        if (_openingsCg) {
          _openingsCg.destroy();
          _openingsCg = undefined;
        }
      },
    },
  });
}

// --- Cached dests to avoid recomputing for the same FEN ---
let _cachedDestsFen = '';
let _cachedDests: Map<Key, Key[]> = new Map();

function destsForFen(fen: string): Map<Key, Key[]> {
  if (fen === _cachedDestsFen) return _cachedDests;
  const setup = parseFen(fen);
  const pos = setup.isOk ? Chess.fromSetup(setup.value) : undefined;
  _cachedDests = pos?.isOk ? chessgroundDests(pos.value) : new Map();
  _cachedDestsFen = fen;
  return _cachedDests;
}

function syncOpeningsBoard(_redraw: () => void): void {
  const node = sessionNode();
  if (!_openingsCg || !node) return;
  const fen = node.fen;
  // Skip if nothing changed
  if (fen === _lastBoardFen) return;
  _lastBoardFen = fen;

  // In practice mode, restrict movable.color to the user's color.
  // In browse mode, allow both sides to move freely.
  const session = practiceSession();
  const movableColor: 'white' | 'black' | 'both' = session ? session.userColor : 'both';

  _openingsCg.set({
    fen,
    orientation: boardOrientation(),
    movable: { dests: destsForFen(fen), color: movableColor },
    ...(node.uci ? { lastMove: [node.uci.slice(0, 2) as Key, node.uci.slice(2, 4) as Key] } : {}),
  });
  _openingsCg.setAutoShapes(buildFrequencyArrows(node));
  // Update FEN override and re-evaluate if engine is on.
  setCevalFenOverride(fen);
  if (engineEnabled) evalCurrentPosition();
}

// Practice opponent response scheduling.
// After the user plays a move, the opponent responds after a short delay.
// Uses a single pending timer so rapid user actions don't queue multiple responses.
let _practiceOpponentTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule the opponent's practice response after the user's move.
 * Cancels any pending timer first (prevents double-responses on rapid input).
 *
 * Repertoire phase: picks a weighted move from the current node's children
 * and navigates to it after PRACTICE_OPPONENT_DELAY_MS.
 *
 * Engine phase: updates the source banner and defers auto-play to a future prompt.
 * The engine banner is set so the view communicates the handoff honestly.
 *
 * Exhausted phase: updates source to 'exhausted' — UI already shows the banner.
 */
const PRACTICE_OPPONENT_DELAY_MS = 400;

function schedulePracticeOpponentResponse(redraw: () => void): void {
  if (_practiceOpponentTimer !== null) {
    clearTimeout(_practiceOpponentTimer);
    _practiceOpponentTimer = null;
  }

  _practiceOpponentTimer = setTimeout(() => {
    _practiceOpponentTimer = null;
    const session = practiceSession();
    if (!session || !session.running) return;

    const node = sessionNode();
    const plan = planOpponentTurn(node, session);

    // Always update the source so the banner stays accurate.
    setPracticeOpponentSource(plan.source);

    if (plan.action === 'play-repertoire' && plan.moveUci) {
      // Opponent plays from imported repertoire.
      navigateToMove(plan.moveUci);
      recordPracticeMove(plan.moveUci);
      syncOpeningsBoard(redraw);
      redraw();
    } else if (plan.action === 'request-engine') {
      if (!node) { redraw(); return; }
      // Engine plays at the session's selected strength level.
      const strengthConfig = STRENGTH_LEVELS[(session.strengthLevel ?? 4) - 1] ?? STRENGTH_LEVELS[3]!;
      playMoveWithDelay({
        fen: node.fen,
        strength: strengthConfig,
        onMove: (uci) => {
          navigateToMove(uci);
          recordPracticeMove(uci);
          syncOpeningsBoard(redraw);
          redraw();
        },
        onError: () => redraw(),
      });
      redraw();
    } else {
      // Exhausted: session continues but no auto-play. Banner explains state.
      redraw();
    }
  }, PRACTICE_OPPONENT_DELAY_MS);
}

// Pre-built opacity brushes for frequency arrows (registered once at board init).
const FREQ_BRUSHES: Record<string, { key: string; color: string; opacity: number; lineWidth: number }> = {};
for (let i = 0; i < 8; i++) {
  // Pre-register 8 brushes with descending opacity: 0.85, 0.70, 0.55, ...
  const opacity = Math.max(0.15, 0.85 - i * 0.1);
  FREQ_BRUSHES[`freq${i}`] = { key: `f${i}`, color: '#15781B', opacity, lineWidth: 10 };
}

/**
 * Frequency arrows for child moves.
 * Same green color, width scales with frequency, opacity via pre-registered brushes.
 */
function buildFrequencyArrows(node: OpeningTreeNode): DrawShape[] {
  if (!node.children.length || node.total === 0) return [];
  const maxTotal = node.children[0]!.total;
  if (maxTotal === 0) return [];

  const shapes: DrawShape[] = [];
  const count = Math.min(node.children.length, 8);
  for (let i = 0; i < count; i++) {
    const child = node.children[i]!;
    const ratio = child.total / maxTotal;
    const width = Math.max(3, Math.round(14 * Math.sqrt(ratio)));
    shapes.push({
      orig: child.uci.slice(0, 2) as Key,
      dest: child.uci.slice(2, 4) as Key,
      brush: `freq${i}`,
      modifiers: { lineWidth: width },
    });
  }
  return shapes;
}

function renderTreeBuildBar(): VNode {
  const progress = treeBuildProgress();
  const total = treeBuildTotal();
  const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
  return h('div.openings__tree-build', [
    h('div.openings__tree-build-bar', [
      h('div.openings__tree-build-fill', {
        attrs: { style: `width:${pct}%` },
      }),
    ]),
    h('span.openings__tree-build-label',
      `Building tree\u2026 ${progress.toLocaleString()} / ${total.toLocaleString()} games (${pct}%)`),
  ]);
}

function renderMoveNav(path: readonly string[], redraw: () => void): VNode {
  const node = sessionNode();
  const canForward = node !== null && node.children.length > 0;
  return h('div.openings__nav', [
    h('button.openings__nav-btn', {
      attrs: { disabled: path.length === 0, title: 'Go to start' },
      on: { click: () => { navigateToRoot(); syncOpeningsBoard(redraw); redraw(); } },
    }, '\u23EE'),
    h('button.openings__nav-btn', {
      attrs: { disabled: path.length === 0, title: 'Back one move' },
      on: { click: () => { navigateBack(); syncOpeningsBoard(redraw); redraw(); } },
    }, '\u25C0'),
    h('button.openings__nav-btn', {
      attrs: { disabled: !canForward, title: 'Most popular continuation' },
      on: { click: () => {
        if (node && node.children.length > 0) {
          navigateToMove(node.children[0]!.uci);
          syncOpeningsBoard(redraw);
          redraw();
        }
      } },
    }, '\u25B6'),
    h('span.openings__nav-depth', `Move ${Math.ceil(path.length / 2)}`),
  ]);
}

/** Render the current line as a clickable breadcrumb trail. */
function renderMovePath(path: readonly string[], redraw: () => void): VNode {
  if (path.length === 0) {
    return h('div.openings__path', [h('span.openings__path-start', 'Starting position')]);
  }

  // Walk the tree to get SAN labels for each step
  const tree = openingTree();
  const labels: { san: string; pathTo: string[] }[] = [];
  if (tree) {
    let current: OpeningTreeNode | undefined = tree;
    for (let i = 0; i < path.length; i++) {
      const child: OpeningTreeNode | undefined = current?.children.find(c => c.uci === path[i]);
      if (!child) break;
      labels.push({ san: child.san, pathTo: path.slice(0, i + 1) as string[] });
      current = child;
    }
  }

  return h('div.openings__path', [
    h('span.openings__path-start', {
      on: { click: () => { navigateToRoot(); syncOpeningsBoard(redraw); redraw(); } },
    }, 'Start'),
    ...labels.map((l, i) => {
      const moveNum = Math.floor(i / 2) + 1;
      const isWhite = i % 2 === 0;
      const prefix = isWhite ? `${moveNum}. ` : (i === 0 ? '1... ' : '');
      return h('span.openings__path-move', {
        on: { click: () => { navigateToPath(l.pathTo); syncOpeningsBoard(redraw); redraw(); } },
      }, `${prefix}${l.san}`);
    }),
  ]);
}

function dateRangeDescription(settings?: { dateRange: string; customFrom?: string; customTo?: string }): string {
  if (!settings) return '';
  switch (settings.dateRange) {
    case '24h':     return ' in the last 24 hours';
    case '1week':   return ' in the last week';
    case '1month':  return ' in the last month';
    case '3months': return ' in the last 3 months';
    case '1year':   return ' in the last year';
    case 'all':     return '';
    case 'custom':
      if (settings.customFrom && settings.customTo) return ` from ${settings.customFrom} to ${settings.customTo}`;
      if (settings.customFrom) return ` since ${settings.customFrom}`;
      return '';
    default:        return '';
  }
}

/**
 * Speed filter chips — Bullet / Blitz / Rapid.
 * Counts are computed from the color-filtered game list so they reflect what's
 * actually in the tree. Toggling a chip rebuilds the tree via setSpeedFilter().
 * Empty filter set = all speeds included (default).
 */
function renderSpeedFilter(redraw: () => void): VNode {
  const collection = activeCollection();
  const filter = speedFilter();
  const color = colorFilter();
  const target = collection?.target?.toLowerCase() ?? '';

  // Count games per timeClass, mirroring the color filter applied during tree build.
  const counts = new Map<string, number>();
  if (collection) {
    let games = collection.games;
    if (color !== 'both' && target) {
      games = games.filter(g => {
        const isWhite = g.white?.toLowerCase() === target;
        const isBlack = g.black?.toLowerCase() === target;
        return color === 'white' ? isWhite : isBlack;
      });
    }
    for (const g of games) {
      const tc = g.timeClass ?? '';
      if (tc) counts.set(tc, (counts.get(tc) ?? 0) + 1);
    }
  }

  const toggle = (value: string) => {
    // Expand the implicit "all" state to an explicit set before modifying.
    const current = filter.size === 0
      ? new Set(SPEED_OPTIONS.map(s => s.value))
      : new Set(filter);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    // If all speeds are selected again, collapse back to the empty "all" shorthand.
    const allSelected = SPEED_OPTIONS.every(s => current.has(s.value));
    setSpeedFilter(allSelected || current.size === 0 ? new Set() : current, redraw);
    redraw();
  };

  return h('div.openings__speed-filter', [
    h('div.openings__speed-label-row', 'Time control'),
    h('div.openings__speed-chips', SPEED_OPTIONS.map(({ value, label, icon }) => {
      const count = counts.get(value) ?? 0;
      const isActive = filter.size === 0 || filter.has(value);
      return h('button.openings__speed-chip', {
        class: { active: isActive, 'no-games': count === 0 },
        attrs: { title: `${label}: ${count} game${count !== 1 ? 's' : ''}` },
        on: { click: () => toggle(value) },
      }, [
        h('span.openings__speed-icon', { attrs: { 'data-icon': icon } }),
        label,
        h('span.openings__speed-count', `${count}`),
      ]);
    })),
  ]);
}

// --- Deviation scan panel ---

function renderDeviationPanel(redraw: () => void): VNode {
  const results = deviationResults();
  const loading = deviationLoading();
  const progress = deviationProgress();
  const total = deviationTotal();

  return h('div.openings__deviation-panel', [
    h('div.openings__deviation-header', [
      h('span.openings__pr-section-title', 'Theory Deviations'),
      loading
        ? h('span.openings__deviation-progress', `Scanning ${progress}/${total}...`)
        : h('button.openings__deviation-scan-btn', {
            on: { click: () => startDeviationScan(redraw) },
          }, results.length > 0 ? 'Rescan' : 'Scan for deviations'),
    ]),

    results.length > 0 ? h('div.openings__deviation-list',
      results.slice(0, 8).map(d =>
        h('div.openings__deviation-row', {
          on: { click: () => { navigateToPath(d.path.slice(0, -1)); syncOpeningsBoard(redraw); redraw(); } },
        }, [
          h('span.openings__deviation-moves', d.sans.slice(0, 4).join(' ')),
          h('span.openings__deviation-detail', [
            h('span.openings__deviation-opp', `plays ${d.opponentMove}`),
            h('span.openings__deviation-theory', `theory: ${d.theoryMove}`),
          ]),
          h('span.openings__deviation-count', `(n=${d.gamesAtNode})`),
        ])
      )
    ) : (!loading ? h('div.openings__deviation-empty', 'Click "Scan" to find where they leave theory') : null),
  ]);
}

function renderPlayedLinesPanel(node: OpeningTreeNode, redraw: () => void): VNode {
  const dateLabel = dateRangeDescription(activeCollection()?.settings);
  return h('div.openings__lines-panel', [
    // Position header: game count + result bar — visually separated from moves
    h('div.openings__pos-header', [
      h('div.openings__pos-summary', [
        h('span.openings__pos-total', `${node.total} game${node.total !== 1 ? 's' : ''}`),
        h('span.openings__pos-label', `reached this position${dateLabel}`),
      ]),
      renderResultBar(node),
    ]),
    // Played lines
    node.children.length === 0
      ? h('div.openings__moves-empty', 'No further moves in this collection.')
      : h('div.openings__moves',
          node.children.map(child => renderMoveRow(child, node.total, redraw)),
        ),
    // Speed filter chips — below the moves, above the move-nav bar
    renderSpeedFilter(redraw),
  ]);
}

function renderMoveRow(child: OpeningTreeNode, parentTotal: number, redraw: () => void): VNode {
  const pct = parentTotal > 0 ? ((child.total / parentTotal) * 100).toFixed(1) : '0';

  // Check if this move is a known deviation from theory
  const path = sessionPath();
  const deviations = deviationResults();
  const deviation = deviations.find(d => {
    if (d.path.length !== path.length + 1) return false;
    for (let i = 0; i < path.length; i++) {
      if (d.path[i] !== path[i]) return false;
    }
    return d.path[path.length] === child.uci;
  });

  return h('div.openings__move-row', {
    key: child.uci,
    class: { 'openings__move-row--deviation': !!deviation },
    on: { click: () => { navigateToMove(child.uci); syncOpeningsBoard(redraw); redraw(); } },
  }, [
    h('span.openings__move-san', [
      child.san,
      deviation ? h('span.openings__deviation-badge', {
        attrs: { title: `Deviates from theory: ${deviation.theoryMove}` },
      }, '\u2197') : null,  // ↗
    ]),
    h('span.openings__move-count', `${child.total} (${pct}%)`),
    renderResultBar(child),
  ]);
}

/**
 * Lichess masters-database-style result bar.
 * Segments use display:inline-block with percentage width — the same
 * technique as lichess-org/lila ui/analyse/src/explorer/explorerView.ts.
 * Labels appear inside segments when wide enough.
 */
/**
 * Lichess masters-database-style result bar.
 * Segments use inline-block with percentage widths set via the style attribute.
 * Note: Snabbdom's styleModule is not loaded in this app, so we use
 * attrs.style (string) instead of the style object.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts
 */
function renderResultBar(node: { white: number; draws: number; black: number }): VNode {
  const sum = node.white + node.draws + node.black || 1;
  const wPct = (node.white * 100) / sum;
  const dPct = (node.draws * 100) / sum;
  const bPct = (node.black * 100) / sum;
  const wW = Math.round(wPct * 10) / 10;
  const dW = Math.round(dPct * 10) / 10;
  const bW = Math.round(bPct * 10) / 10;
  // Lichess convention: show label if segment > 12%, show '%' if > 20%
  const label = (p: number) => p > 12 ? `${Math.round(p)}${p > 20 ? '%' : ''}` : '';
  return h('div.openings__result-bar', [
    h('span.openings__bar-w', { attrs: { style: `width:${wW}%` } }, label(wPct)),
    h('span.openings__bar-d', { attrs: { style: `width:${dW}%` } }, label(dPct)),
    h('span.openings__bar-b', { attrs: { style: `width:${bW}%` } }, label(bPct)),
  ]);
}

// ========== Sample games panel ==========

function renderSampleGamesPanel(): VNode {
  const games = sampleGames(5);
  if (games.length === 0) {
    return h('div.openings__samples', [
      h('h3.openings__samples-title', 'Example Games'),
      h('div.openings__samples-empty', 'No games match this position.'),
    ]);
  }
  return h('div.openings__samples', [
    h('h3.openings__samples-title', `Example Games (${games.length})`),
    ...games.map(renderSampleGameRow),
  ]);
}

/** Extract game URL from PGN headers (Site for Lichess, Link for Chess.com). */
function extractGameUrl(pgn: string): string | null {
  // Try [Link "..."] first (Chess.com)
  const linkMatch = pgn.match(/\[Link\s+"([^"]+)"\]/);
  if (linkMatch?.[1]) return linkMatch[1];
  // Try [Site "..."] (Lichess — contains https://lichess.org/...)
  const siteMatch = pgn.match(/\[Site\s+"(https?:\/\/[^"]+)"\]/);
  if (siteMatch?.[1]) return siteMatch[1];
  return null;
}

function renderSampleGameRow(game: ResearchGame): VNode {
  const players = [game.white ?? '?', game.black ?? '?'].join(' vs ');
  const result = game.result ?? '*';
  const info: string[] = [];
  if (game.opening) info.push(game.opening);
  if (game.date) info.push(game.date);
  if (game.timeClass) info.push(game.timeClass);
  const ratings: string[] = [];
  if (game.whiteRating) ratings.push(`W:${game.whiteRating}`);
  if (game.blackRating) ratings.push(`B:${game.blackRating}`);
  const gameUrl = extractGameUrl(game.pgn);

  return h('div.openings__sample-row', {
    key: game.id,
    class: { 'openings__sample-row--clickable': !!gameUrl },
    on: gameUrl ? { click: () => window.open(gameUrl, '_blank') } : {},
  }, [
    h('div.openings__sample-players', [
      h('span', players),
      h('span.openings__sample-result', result),
    ]),
    info.length > 0
      ? h('div.openings__sample-info', [
          info.join(' \u00B7 '),
          ratings.length > 0 ? ` \u00B7 ${ratings.join(' ')}` : '',
        ])
      : null,
    h('div.openings__sample-actions', [
      h('button.openings__sample-copy', {
        attrs: { title: 'Copy PGN' },
        on: { click: (e: Event) => {
          e.stopPropagation();
          void navigator.clipboard.writeText(game.pgn).then(() => {
            const btn = e.target as HTMLButtonElement;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy PGN'; }, 1500);
          });
        } },
      }, 'Copy PGN'),
      game.source === 'lichess' && game.pgn
        ? h('a.openings__sample-link', {
            attrs: {
              href: extractLichessUrl(game.pgn),
              target: '_blank',
              rel: 'noopener',
              title: 'View on Lichess',
            },
          }, 'Lichess')
        : null,
    ]),
  ]);
}

function extractLichessUrl(pgn: string): string {
  const site = pgn.match(/\[Site\s+"([^"]+)"]/)?.[1];
  return site && site.includes('lichess.org') ? site : '#';
}

// ========== Lichess Explorer comparison ==========

/**
 * Tablebase view — renders per-move outcome badges and DTZ/DTM data.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/tablebaseView.ts
 */

/** Which result class to apply based on category and side to move.
 *  In Lichess's naming: 'loss' means the side to move WINS (opponent loses).
 *  'win' means the side to move LOSES (opponent wins).
 *  Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerUtil.ts winnerOf()
 */
function tablebaseCategoryClass(fen: string, category: TablebaseCategory): string {
  const turnWhite = (fen.split(' ')[1] ?? 'w') === 'w';
  if (category === 'loss' || category === 'blessed-loss' || category === 'syzygy-loss' || category === 'maybe-loss') {
    return turnWhite ? 'white' : 'black';
  }
  if (category === 'win' || category === 'cursed-win' || category === 'syzygy-win' || category === 'maybe-win') {
    return turnWhite ? 'black' : 'white';
  }
  return 'draws';
}

const CATEGORY_LABELS: Record<TablebaseCategory, string> = {
  'loss':         'Winning',
  'maybe-loss':   'Win or 50-move',
  'blessed-loss': 'Win (prevented by 50-move)',
  'syzygy-loss':  'Win (prior mistake)',
  'unknown':      'Unknown',
  'draw':         'Draw',
  'cursed-win':   'Loss (saved by 50-move)',
  'maybe-win':    'Loss or 50-move',
  'syzygy-win':   'Loss (prior mistake)',
  'win':          'Losing',
};

function renderTablebaseMoveRow(fen: string, move: TablebaseMoveStats, onMoveClick: (uci: string) => void): VNode {
  const cls = tablebaseCategoryClass(fen, move.category);
  const badge: VNode[] = [];
  if (move.checkmate)              badge.push(h(`result.${cls}`, 'Checkmate'));
  else if (move.stalemate)         badge.push(h('result.draws', 'Stalemate'));
  else if (move.insufficient_material) badge.push(h('result.draws', 'Insufficient'));
  else if (move.dtz === 0)         badge.push(h('result.draws', 'Draw'));
  else if (move.dtz !== undefined) badge.push(h(`result.${cls}`, { attrs: { title: 'Distance To Zeroing' } }, `DTZ ${Math.abs(move.dtz)}`));
  else if (move.dtm !== undefined) badge.push(h(`result.${cls}`, { attrs: { title: 'Distance To Mate' } }, `DTM ${Math.abs(move.dtm)}`));
  else                             badge.push(h(`result.${cls}`, CATEGORY_LABELS[move.category] ?? move.category));

  return h('tr.tablebase__row', {
    attrs: { 'data-uci': move.uci },
    on: { click: () => onMoveClick(move.uci) },
  }, [
    h('td.tablebase__san', move.san),
    h('td.tablebase__result', badge),
  ]);
}

function renderTablebaseSection(
  fen: string,
  title: string,
  moves: TablebaseMoveStats[],
  onMoveClick: (uci: string) => void,
): VNode | null {
  if (!moves.length) return null;
  return h('div.tablebase__section', [
    h('div.tablebase__section-title', title),
    h('table.tablebase', [
      h('tbody', moves.map(m => renderTablebaseMoveRow(fen, m, onMoveClick))),
    ]),
  ]);
}

/**
 * Full tablebase panel — groups moves by outcome category.
 * Mirrors lichess-org/lila: ui/analyse/src/explorer/explorerView.ts tablebase block.
 */
function renderTablebasePanel(data: TablebaseData, _redraw: () => void): VNode {
  const onMoveClick = (uci: string) => {
    explorerCtrl.hovering = { fen: data.fen, uci };
    _redraw();
  };

  if (data.checkmate) return h('div.openings__explorer-box', [h('div.openings__explorer-message', [h('strong', 'Checkmate')])]);
  if (data.stalemate) return h('div.openings__explorer-box', [h('div.openings__explorer-message', [h('strong', 'Stalemate')])]);

  const sections = [
    renderTablebaseSection(data.fen, 'Winning',                data.moves.filter(m => m.category === 'loss'),        onMoveClick),
    renderTablebaseSection(data.fen, 'Win or 50-move draw',    data.moves.filter(m => m.category === 'maybe-loss'),  onMoveClick),
    renderTablebaseSection(data.fen, 'Win (50-move)',           data.moves.filter(m => m.category === 'blessed-loss'),onMoveClick),
    renderTablebaseSection(data.fen, 'Win (prior mistake)',     data.moves.filter(m => m.category === 'syzygy-loss'), onMoveClick),
    renderTablebaseSection(data.fen, 'Unknown',                 data.moves.filter(m => m.category === 'unknown'),     onMoveClick),
    renderTablebaseSection(data.fen, 'Drawing',                 data.moves.filter(m => m.category === 'draw'),        onMoveClick),
    renderTablebaseSection(data.fen, 'Loss (50-move)',          data.moves.filter(m => m.category === 'cursed-win'),  onMoveClick),
    renderTablebaseSection(data.fen, 'Loss or 50-move draw',   data.moves.filter(m => m.category === 'maybe-win'),   onMoveClick),
    renderTablebaseSection(data.fen, 'Loss (prior mistake)',    data.moves.filter(m => m.category === 'syzygy-win'),  onMoveClick),
    renderTablebaseSection(data.fen, 'Losing',                  data.moves.filter(m => m.category === 'win'),         onMoveClick),
  ].filter(Boolean) as VNode[];

  return h('div.openings__explorer-box.tablebase-view', [
    h('div.tablebase__header', [
      h('span.tablebase__label', 'Tablebase'),
      h('span.tablebase__pieces', `${data.moves.length} move${data.moves.length !== 1 ? 's' : ''}`),
    ]),
    sections.length ? h('div.tablebase__body', sections) : h('div.openings__explorer-message', 'No tablebase data for this position.'),
  ]);
}

/**
 * Render the appropriate error box for a failed explorer request.
 * 401 errors get a "Connect to Lichess" prompt instead of the generic message.
 */
function renderPlayerNamePrompt(redraw: () => void): VNode {
  return h('div.openings__explorer-box', [
    h('div.openings__explorer-message', [
      h('strong', 'Enter a player name'),
      h('p.openings__explorer-explanation', 'Open the settings panel and enter a Lichess username to search player games.'),
      h('button.openings__explorer-retry', {
        on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
      }, 'Open settings'),
    ]),
  ]);
}

function renderExplorerErrorBox(err: Error, fen: string, redraw: () => void): VNode {
  const isAuthError = err.message.includes('401') || err.message.includes('Unauthorized') || err.message.includes('Not connected');
  if (isAuthError) {
    return h('div.openings__explorer-box', { class: { reduced: true } }, [
      h('div.overlay'),
      h('div.openings__explorer-message', [
        h('strong', 'Lichess account required'),
        h('p.openings__explorer-explanation', 'The opening book requires a Lichess login.'),
        h('a.openings__explorer-connect-btn', {
          attrs: { href: '/api/lichess/connect' },
        }, 'Connect to Lichess'),
      ]),
    ]);
  }
  return h('div.openings__explorer-box', { class: { reduced: true } }, [
    h('div.overlay'),
    h('div.openings__explorer-message', [
      h('h3', 'Oops, sorry!'),
      h('p.openings__explorer-explanation', err.message),
      h('button.openings__explorer-retry', {
        on: { click: () => { explorerCtrl.reload(fen, redraw); redraw(); } },
      }, 'Retry'),
    ]),
  ]);
}

function renderExplorerToggle(node: OpeningTreeNode | null, redraw: () => void): VNode | null {
  if (!explorerCtrl.enabled) return null;
  return h('div.openings__explorer', [
    h('div.openings__explorer-header', [
      h('button.openings__explorer-gear', {
        attrs: { title: 'Configure explorer' },
        on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
      }, '\u2699\uFE0F'),
    ]),
    renderExplorerDbTabs(node, redraw),
    explorerCtrl.configOpen ? renderExplorerConfigPanel(redraw) : renderExplorerPanel(node, redraw),
  ]);
}

function renderExplorerDbTabs(node: OpeningTreeNode | null, redraw: () => void): VNode {
  const db = explorerCtrl.config.db;
  const setDb = (d: ExplorerDb) => {
    explorerCtrl.setDb(d);
    if (node) explorerCtrl.setNode(node.fen, redraw);
    redraw();
  };
  return h('div.openings__explorer-tabs', [
    h(`button.openings__explorer-tab${db === 'masters' ? '.active' : ''}`, { on: { click: () => setDb('masters') } }, 'Masters'),
    h(`button.openings__explorer-tab${db === 'lichess' ? '.active' : ''}`, { on: { click: () => setDb('lichess') } }, 'Lichess'),
    h(`button.openings__explorer-tab${db === 'player' ? '.active' : ''}`, { on: { click: () => setDb('player') } }, 'Player'),
  ]);
}

/**
 * Config panel — DB-specific filter controls.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerConfig.ts view()
 */
function renderExplorerConfigPanel(redraw: () => void): VNode {
  const cfg = explorerCtrl.config;
  const db = cfg.db;

  const toggleBtn = <T>(label: string, active: boolean, onClick: () => void) =>
    h('button.openings__explorer-filter-btn', {
      class: { active },
      on: { click: () => { onClick(); redraw(); } },
    }, label);

  const speedSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Time control'),
    h('div.openings__explorer-filter-row',
      ALL_SPEEDS.map(s => toggleBtn(s, cfg.speeds.includes(s), () => cfg.toggleSpeed(s))),
    ),
  ]);

  const ratingSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Avg rating'),
    h('div.openings__explorer-filter-row',
      ALL_RATINGS.map(r => toggleBtn(String(r), cfg.ratings.includes(r), () => cfg.toggleRating(r))),
    ),
  ]);

  const modeSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Mode'),
    h('div.openings__explorer-filter-row',
      ALL_MODES.map(m => toggleBtn(m, cfg.modes.includes(m), () => cfg.toggleMode(m))),
    ),
  ]);

  const dateInput = (label: string, value: string, onChange: (v: string) => void, type: 'number' | 'month') =>
    h('label.openings__explorer-date-label', [
      label,
      h('input', {
        attrs: { type, value, placeholder: type === 'number' ? 'YYYY' : 'YYYY-MM', min: type === 'number' ? '1952' : '1952-01' },
        on: { change: (e: Event) => { onChange((e.target as HTMLInputElement).value); redraw(); } },
      }),
    ]);

  const dateSection = (type: 'number' | 'month') =>
    h('div.openings__explorer-config-section', [
      dateInput('Since', cfg.since(), v => cfg.setSince(v), type),
      dateInput('Until', cfg.until(), v => cfg.setUntil(v), type),
    ]);

  const playerSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Player'),
    h('input.openings__explorer-player-input', {
      attrs: { type: 'text', placeholder: 'Lichess username', value: cfg.playerName },
      on: {
        change: (e: Event) => {
          cfg.setPlayerName((e.target as HTMLInputElement).value.trim());
          redraw();
        },
      },
    }),
    cfg.playerPrevious.length ? h('div.openings__explorer-player-prev',
      cfg.playerPrevious.slice(0, 10).map(name =>
        h('button.openings__explorer-prev-btn', {
          on: { click: () => { cfg.setPlayerName(name); redraw(); } },
        }, name),
      ),
    ) : null,
    h('div.openings__explorer-color-row', [
      h('label', 'Color'),
      toggleBtn('White', cfg.color === 'white', () => { cfg.color = 'white'; }),
      toggleBtn('Black', cfg.color === 'black', () => { cfg.color = 'black'; }),
    ]),
  ]);

  const sections: VNode[] = [];
  if (db === 'masters') sections.push(dateSection('number'));
  if (db === 'lichess') { sections.push(speedSection(), ratingSection(), dateSection('month')); }
  if (db === 'player') { sections.push(playerSection(), speedSection(), modeSection(), dateSection('month')); }

  return h('div.openings__explorer-config', [
    ...sections,
    h('button.openings__explorer-config-close', {
      on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
    }, 'Done'),
  ]);
}

/**
 * Explorer panel — handles all four UI states: loading, error, empty, and data.
 * Mirrors lichess-org/lila: ui/analyse/src/explorer/explorerView.ts main() function.
 *
 * - Preserves stale cached data under a loading overlay (`.loading` class)
 * - `.reduced` class when movesAway > 2 (position moved far from book)
 * - "Max depth reached" when at or beyond MAX_EXPLORER_DEPTH
 * - Queue position message when player DB is indexing
 * - Error state with retry button
 */
function renderExplorerPanel(node: OpeningTreeNode | null, redraw: () => void): VNode {
  if (!node) return h('div.openings__explorer-empty', 'No position selected.');

  const data = explorerCtrl.current(node.fen);
  if (!data && !explorerCtrl.loading && !explorerCtrl.failing && !explorerCtrl.needsPlayerName) {
    explorerCtrl.setNode(node.fen, redraw);
  }

  const loading = explorerCtrl.loading;
  const failing = explorerCtrl.failing;
  const movesAway = explorerCtrl.movesAway;
  const isMasters = explorerCtrl.config.db === 'masters';

  // Player DB needs a username before we can fetch
  if (explorerCtrl.needsPlayerName) return renderPlayerNamePrompt(redraw);

  // Tablebase mode — ≤7 pieces
  if (explorerCtrl.tablebaseData) return renderTablebasePanel(explorerCtrl.tablebaseData, redraw);

  // Error state — 401 shows a connect prompt; other errors show retry
  if (failing && !data) return renderExplorerErrorBox(failing, node.fen, redraw);

  // Empty state — no data and no longer loading
  if (!loading && !data) {
    const tooDeep = movesAway >= MAX_EXPLORER_DEPTH;
    const queuePos = (data as import('./explorer').OpeningData | undefined)?.queuePosition;
    return h('div.openings__explorer-box', { class: { reduced: movesAway > 2 } }, [
      h('div.openings__explorer-message', [
        h('strong', tooDeep ? 'Max depth reached' : 'No game found'),
        queuePos
          ? h('p.openings__explorer-explanation', `Indexing ${queuePos} other players first\u2026`)
          : !tooDeep
            ? h('p.openings__explorer-explanation', 'Try adjusting the filters.')
            : null,
      ]),
    ]);
  }

  // Data available — show with loading overlay if refreshing
  if (data) {
    const hasContent = data.moves.length > 0 || (data.topGames?.length ?? 0) > 0 || (data.recentGames?.length ?? 0) > 0;
    const queuePos = data.queuePosition;

    const content = hasContent
      ? h('div.openings__explorer-data', [
          data.opening
            ? h('div.openings__explorer-opening', `${data.opening.eco} ${data.opening.name}`)
            : null,
          renderExplorerMovesTable(data, node.fen, redraw),
          renderExplorerGamesTable('Top games', data.topGames ?? [], isMasters),
          renderExplorerGamesTable('Recent games', data.recentGames ?? [], isMasters),
        ])
      : h('div.openings__explorer-message', [
          h('strong', movesAway >= MAX_EXPLORER_DEPTH ? 'Max depth reached' : 'No game found'),
          queuePos
            ? h('p.openings__explorer-explanation', `Indexing ${queuePos} other players first\u2026`)
            : null,
        ]);

    return h('div.openings__explorer-box', { class: { loading, reduced: movesAway > 2 && !hasContent } }, [
      h('div.overlay'),
      content,
    ]);
  }

  // Still waiting on first response
  return h('div.openings__explorer-box', { class: { loading: true } }, [
    h('div.overlay'),
    h('div.openings__explorer-message', h('p', 'Loading\u2026')),
  ]);
}

/**
 * Top/recent games table — adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts showGameTable()
 * Columns: ratings (stacked), player names (stacked), result badge, month/year, speed icon (non-masters).
 * Row click opens the game on Lichess in a new tab.
 */
function renderExplorerGamesTable(
  title: string,
  games: import('./explorer').OpeningGame[],
  isMasters: boolean,
): VNode | null {
  if (!games.length) return null;
  const colSpan = isMasters ? 4 : 5;

  const resultBadge = (winner?: 'white' | 'black') =>
    winner === 'white'
      ? h('result.white', '1-0')
      : winner === 'black'
        ? h('result.black', '0-1')
        : h('result.draws', '\u00BD-\u00BD');

  const openGame = (gameId: string) => {
    const url = isMasters
      ? `https://lichess.org/import/master/${gameId}`
      : `https://lichess.org/${gameId}`;
    window.open(url, '_blank', 'noopener');
  };

  return h('table.explorer-games', [
    h('thead', h('tr', h('th', { attrs: { colspan: colSpan } }, title))),
    h('tbody',
      games.map(game =>
        h('tr', {
          key: game.id,
          attrs: { 'data-id': game.id, 'data-uci': game.uci ?? '' },
          on: { click: () => openGame(game.id) },
        }, [
          h('td.ratings', [
            h('span', String(game.white.rating)),
            h('span', String(game.black.rating)),
          ]),
          h('td.players', [
            h('span', game.white.name),
            h('span', game.black.name),
          ]),
          h('td', resultBadge(game.winner)),
          h('td.date', game.month ?? game.year ?? ''),
          !isMasters
            ? h('td.speed', game.speed ? h('span', { attrs: { title: game.speed } }, speedGlyph(game.speed)) : '')
            : null,
        ]),
      ),
    ),
  ]);
}

/** Simple text glyph for speed — no icon font required. */
function speedGlyph(speed: string): string {
  const glyphs: Record<string, string> = {
    ultraBullet: '\u26a1\u26a1', bullet: '\u26a1', blitz: '\uD83D\uDD25',
    rapid: '\u23F1', classical: '\u231B', correspondence: '\u2709',
  };
  return glyphs[speed] ?? speed;
}

/** Compact number formatter: 12400 → "12.4k", 1200000 → "1.2M". */
function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Render a stacked W/D/B result bar — adapted from Lichess explorerView.ts resultBar(). */
function renderExplorerResultBar(move: OpeningMoveStats): VNode {
  const sum = move.white + move.draws + move.black || 1;
  const seg = (key: 'white' | 'draws' | 'black') => {
    const pct = (move[key] * 100) / sum;
    const width = Math.round((move[key] * 1000) / sum) / 10;
    return h(`span.${key}`, { attrs: { style: `width: ${width}%` } },
      pct > 12 ? `${Math.round(pct)}${pct > 20 ? '%' : ''}` : '');
  };
  return h('div.bar', [seg('white'), seg('draws'), seg('black')]);
}

/**
 * Lichess-style moves table with result bar, hover arrows, and click-to-play.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts showMoveTable()
 * and ui/analyse/src/explorer/explorerUtil.ts moveArrowAttributes().
 *
 * @param onMoveClick — optional; defaults to openings navigateToMove. Analysis board passes its own.
 * @param cgBoard     — optional; defaults to openings board. Analysis board passes its Chessground.
 */
function renderExplorerMovesTable(
  data: import('./explorer').OpeningData,
  fen: string,
  redraw: () => void,
  onMoveClick?: (uci: string) => void,
  cgBoard?: CgApi,
): VNode {
  const sumTotal = (data.white ?? 0) + (data.draws ?? 0) + (data.black ?? 0) || 1;

  type SumRow = { uci: ''; san: string; white: number; black: number; draws: number };
  type AnyRow = OpeningMoveStats | SumRow;
  const rows: AnyRow[] = data.moves.length > 1
    ? [...data.moves, { uci: '' as '', san: '\u03A3', white: data.white ?? 0, black: data.black ?? 0, draws: data.draws ?? 0 }]
    : [...data.moves];

  const board = cgBoard ?? _openingsCg;
  const defaultMoveClick = (uci: string) => {
    navigateToMove(uci);
    const newNode = sessionNode();
    if (newNode) explorerCtrl.setNode(newNode.fen, redraw);
    redraw();
  };
  const handleMoveClick = onMoveClick ?? defaultMoveClick;

  return h('table.explorer-moves', {
    hook: {
      insert(vnode: import('snabbdom').VNode) {
        const el = vnode.elm as HTMLElement;
        el.addEventListener('mouseover', (e: MouseEvent) => {
          const tr = (e.target as HTMLElement).closest('tr');
          const uci = tr?.getAttribute('data-uci');
          if (uci) {
            explorerCtrl.setHovering(fen, uci);
            const orig = uci.slice(0, 2);
            const dest = uci.slice(2, 4);
            board?.setAutoShapes([{ orig: orig as any, dest: dest as any, brush: 'blue' }]);
          }
        });
        el.addEventListener('mouseout', () => {
          explorerCtrl.setHovering(fen, null);
          board?.setAutoShapes([]);
        });
        el.addEventListener('click', (e: MouseEvent) => {
          const tr = (e.target as HTMLElement).closest('tr');
          const uci = tr?.getAttribute('data-uci');
          if (uci) handleMoveClick(uci);
        });
      },
    },
  }, [
    h('thead', h('tr', [
      h('th', 'Move'), h('th', '%'), h('th', 'Games'), h('th', 'W/D/B'),
    ])),
    h('tbody', rows.map(move => {
      const total = move.white + move.draws + move.black || 1;
      const isSum = move.uci === '';
      return h(isSum ? 'tr.sum' : 'tr', {
        key: move.uci || '\u03A3',
        attrs: move.uci ? { 'data-uci': move.uci } : {},
      }, [
        h('td', move.san),
        h('td', `${((total / sumTotal) * 100).toFixed(0)}%`),
        h('td', compactNum(total)),
        h('td', renderExplorerResultBar(move as OpeningMoveStats)),
      ]);
    })),
  ]);
}

// ========== Analysis board explorer integration ==========

/**
 * Explorer section for the analysis board tools column.
 * Uses the same ExplorerCtrl singleton as the openings page.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts default export.
 *
 * @param fen         — current board FEN (from ctrl.node.fen)
 * @param cg          — analysis board Chessground instance (for hover arrows)
 * @param onMoveClick — called when a move row is clicked; should advance the analysis tree
 * @param redraw      — analysis board redraw function
 */
export function renderAnalysisExplorerSection(
  fen: string,
  cg: CgApi | undefined,
  onMoveClick: (uci: string) => void,
  redraw: () => void,
): VNode | null {
  if (!explorerCtrl.enabled) return null;

  const isMasters = explorerCtrl.config.db === 'masters';

  return h('div.openings__explorer', [
    h('div.openings__explorer-header', [
      h('button.openings__explorer-gear', {
        attrs: { title: 'Configure explorer' },
        on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
      }, '\u2699\uFE0F'),
    ]),
    renderExplorerDbTabs(null, redraw),
    explorerCtrl.configOpen
      ? renderExplorerConfigPanel(redraw)
      : renderAnalysisExplorerPanel(fen, isMasters, cg, onMoveClick, redraw),
  ]);
}

/**
 * FEN-based explorer panel for the analysis board (no OpeningTreeNode dependency).
 * Mirrors renderExplorerPanel() but uses a plain FEN and custom move/arrow callbacks.
 */
function renderAnalysisExplorerPanel(
  fen: string,
  isMasters: boolean,
  cg: CgApi | undefined,
  onMoveClick: (uci: string) => void,
  redraw: () => void,
): VNode {
  const data = explorerCtrl.current(fen);
  if (!data && !explorerCtrl.loading && !explorerCtrl.failing && !explorerCtrl.needsPlayerName) {
    explorerCtrl.setNode(fen, redraw);
  }

  const loading = explorerCtrl.loading;
  const failing = explorerCtrl.failing;
  const movesAway = explorerCtrl.movesAway;

  if (explorerCtrl.needsPlayerName) return renderPlayerNamePrompt(redraw);

  if (explorerCtrl.tablebaseData) return renderTablebasePanel(explorerCtrl.tablebaseData, redraw);

  if (failing && !data) return renderExplorerErrorBox(failing, fen, redraw);

  if (!loading && !data) {
    const tooDeep = movesAway >= MAX_EXPLORER_DEPTH;
    return h('div.openings__explorer-box', { class: { reduced: movesAway > 2 } }, [
      h('div.openings__explorer-message', [
        h('strong', tooDeep ? 'Max depth reached' : 'No game found'),
        !tooDeep ? h('p.openings__explorer-explanation', 'Try adjusting the filters.') : null,
      ]),
    ]);
  }

  if (data) {
    const hasContent = data.moves.length > 0 || (data.topGames?.length ?? 0) > 0 || (data.recentGames?.length ?? 0) > 0;
    const content = hasContent
      ? h('div.openings__explorer-data', [
          data.opening ? h('div.openings__explorer-opening', `${data.opening.eco} ${data.opening.name}`) : null,
          renderExplorerMovesTable(data, fen, redraw, onMoveClick, cg),
          renderExplorerGamesTable('Top games', data.topGames ?? [], isMasters),
          renderExplorerGamesTable('Recent games', data.recentGames ?? [], isMasters),
        ])
      : h('div.openings__explorer-message', [
          h('strong', movesAway >= MAX_EXPLORER_DEPTH ? 'Max depth reached' : 'No game found'),
        ]);
    return h('div.openings__explorer-box', { class: { loading, reduced: movesAway > 2 && !hasContent } }, [
      h('div.overlay'),
      content,
    ]);
  }

  return h('div.openings__explorer-box', { class: { loading: true } }, [
    h('div.overlay'),
    h('div.openings__explorer-message', h('p', 'Loading\u2026')),
  ]);
}
