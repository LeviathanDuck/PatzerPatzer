/**
 * Stats dashboard view — renders the improvement intelligence dashboard.
 * Uses Snabbdom h() functions following the Lichess ctrl+view module pattern.
 */

import { h, type VNode } from 'snabbdom';
import {
  filteredSummaries,
  filteredGameCount,
  importedGames,
  summariesLoaded,
  timeFilter,
  setTimeFilter,
  type StatsTimeFilter,
} from './ctrl';
import type { GameSummary } from './types';
import { diagnoseWeaknesses, type DiagnosedWeakness } from './weakness';

// ── Time-control filter tabs ──────────────────────────────────────────────────

const TIME_FILTERS: { label: string; value: StatsTimeFilter }[] = [
  { label: 'All',       value: 'all' },
  { label: 'Bullet',    value: 'bullet' },
  { label: 'Blitz',     value: 'blitz' },
  { label: 'Rapid',     value: 'rapid' },
  { label: 'Classical', value: 'classical' },
];

function renderTimeFilterTabs(redraw: () => void): VNode {
  const active = timeFilter();
  return h('div.stats-filter-tabs', TIME_FILTERS.map(f =>
    h('button.stats-filter-tab', {
      class: { 'stats-filter-tab--active': f.value === active },
      on: { click: () => { setTimeFilter(f.value); redraw(); } },
    }, f.label),
  ));
}

// ── Loading / empty states ────────────────────────────────────────────────────

function renderLoading(): VNode {
  return h('div.stats-loading', 'Loading stats…');
}

function renderEmpty(): VNode {
  return h('div.stats-empty', [
    h('p', 'No analyzed games yet.'),
    h('p', 'Run Game Review on your imported games to build your improvement profile.'),
  ]);
}

// ── Header summary ────────────────────────────────────────────────────────────

function renderHeader(redraw: () => void): VNode {
  const count = filteredGameCount();
  return h('div.stats-header', [
    h('h2.stats-title', 'Improvement Stats'),
    renderTimeFilterTabs(redraw),
    h('div.stats-game-count', `${count} analyzed game${count === 1 ? '' : 's'}`),
  ]);
}

// ── Placeholder sections (filled by subsequent prompts) ───────────────────────

function renderPlaceholderSection(title: string, note: string): VNode {
  return h('section.stats-section.stats-section--placeholder', [
    h('h3.stats-section-title', title),
    h('p.stats-section-note', note),
  ]);
}

// ── Trend charts (inline SVG) ─────────────────────────────────────────────────

const CHART_W = 320;
const CHART_H = 80;
const CHART_PAD = { top: 8, right: 8, bottom: 18, left: 32 };

/** Map a value in [min, max] to an SVG y coordinate (top = higher value). */
function yScale(v: number, min: number, max: number): number {
  const range = max - min || 1;
  const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  return CHART_PAD.top + innerH * (1 - (v - min) / range);
}

function xScale(i: number, n: number): number {
  const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  return CHART_PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
}

function renderSvgLine(
  values: number[],
  min:    number,
  max:    number,
  cls:    string,
): VNode {
  const n      = values.length;
  const points = values.map((v, i) => `${xScale(i, n).toFixed(1)},${yScale(v, min, max).toFixed(1)}`).join(' ');
  return h(`polyline.${cls}`, { attrs: { points, fill: 'none' } });
}

/** Render y-axis labels at min/mid/max. */
function renderYLabels(min: number, max: number, suffix = ''): VNode[] {
  const mid = (min + max) / 2;
  return [max, mid, min].map(v =>
    h('text.stats-chart__label', {
      attrs: {
        x: CHART_PAD.left - 4,
        y: yScale(v, min, max) + 4,
        'text-anchor': 'end',
        'font-size': '9',
      },
    }, `${Math.round(v)}${suffix}`),
  );
}

function renderTrendChart(
  label:  string,
  values: number[],
  min:    number,
  max:    number,
  suffix: string,
  cls:    string,
): VNode {
  const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  const yBase  = CHART_PAD.top + innerH;
  return h('div.stats-chart', [
    h('div.stats-chart__label-top', `${label} (${values.length} games)`),
    h('svg.stats-chart__svg', {
      attrs: { viewBox: `0 0 ${CHART_W} ${CHART_H}`, width: '100%', height: CHART_H },
    }, [
      // Axis lines
      h('line.stats-chart__axis', { attrs: { x1: CHART_PAD.left, y1: CHART_PAD.top, x2: CHART_PAD.left, y2: yBase } }),
      h('line.stats-chart__axis', { attrs: { x1: CHART_PAD.left, y1: yBase, x2: CHART_PAD.left + innerW, y2: yBase } }),
      ...renderYLabels(min, max, suffix),
      renderSvgLine(values, min, max, cls),
    ] as VNode[]),
  ]);
}

const TIME_CONTROL_LABELS: Record<string, string> = {
  bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical', ultrabullet: 'UltraBullet',
};

/**
 * Compute a rolling average over an array of values.
 * Each output point is the mean of the preceding `window` values (or fewer at the start).
 */
function rollingAvg(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    return slice.reduce((a, v) => a + v, 0) / slice.length;
  });
}

function renderTrendSection(summaries: ReturnType<typeof filteredSummaries>): VNode {
  const MIN_GAMES    = 20;
  const ROLL_WINDOW  = 20;

  // Group by time class and sort by date within each group
  const byTc = new Map<string, typeof summaries>();
  for (const s of summaries) {
    const tc = s.timeClass || 'classical';
    const group = byTc.get(tc) ?? [];
    group.push(s);
    byTc.set(tc, group);
  }

  // Collect groups with enough games for trend rendering
  const groups: { label: string; summaries: typeof summaries }[] = [];
  for (const [tc, group] of byTc) {
    if (group.length >= MIN_GAMES) {
      const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
      groups.push({ label: TIME_CONTROL_LABELS[tc] ?? tc, summaries: sorted });
    }
  }

  // Also check combined if individual controls don't have enough but combined does
  if (groups.length === 0) {
    if (summaries.length < MIN_GAMES) {
      return h('section.stats-section', [
        h('h3.stats-section-title', 'Accuracy & Blunder Trends'),
        h('div.stats-insufficient', [
          h('p', `Need at least ${MIN_GAMES} analyzed games to show trends.`),
          h('p.stats-insufficient__count', `${summaries.length} analyzed so far.`),
        ]),
      ]);
    }
    // Use combined across all time controls
    const sorted = [...summaries].sort((a, b) => a.date.localeCompare(b.date));
    groups.push({ label: 'All time controls', summaries: sorted });
  }

  const charts: VNode[] = [];
  for (const { label, summaries: gs } of groups) {
    // Apply 20-game rolling average so each point reflects recent form, not a single game
    const accs     = rollingAvg(gs.map(s => s.accuracy), ROLL_WINDOW);
    const blunders = rollingAvg(gs.map(s => s.blunderCount), ROLL_WINDOW);
    const chartLabel = `${label} (${gs.length} games, ${ROLL_WINDOW}-game rolling avg)`;
    charts.push(
      h('div.stats-trend-group', [
        h('div.stats-trend-group__title', chartLabel),
        renderTrendChart('Accuracy', accs, 0, 100, '%', 'stats-chart__line--accuracy'),
        renderTrendChart('Blunders/game', blunders, 0, Math.max(5, ...blunders), '', 'stats-chart__line--blunders'),
      ]),
    );
  }

  return h('section.stats-section', [
    h('h3.stats-section-title', 'Accuracy & Blunder Trends'),
    h('div.stats-trends', charts),
  ]);
}

// ── Weakness panel ────────────────────────────────────────────────────────────

/** Map a training action type to the hash route fragment. */
function trainingActionRoute(type: DiagnosedWeakness['trainingAction'] extends undefined ? never : NonNullable<DiagnosedWeakness['trainingAction']>['type']): string {
  switch (type) {
    case 'puzzles':  return '#/puzzles';
    case 'openings': return '#/openings';
    case 'retro':    // fallthrough — retro lives on the analysis page
    case 'review':   return '#/analysis';
  }
}

function renderWeaknessCard(w: DiagnosedWeakness): VNode {
  return h(`div.weakness-card.weakness-card--${w.severity}`, [
    h('div.weakness-card__header', [
      h('span.weakness-card__severity', w.severity),
      h('span.weakness-card__category', w.category),
      h('span.weakness-card__confidence', `${w.confidence} confidence`),
    ]),
    h('p.weakness-card__description', w.description),
    h('p.weakness-card__recommendation', w.recommendation),
    h('div.weakness-card__meta', `Based on ${w.sampleSize} analyzed game${w.sampleSize === 1 ? '' : 's'}`),
    w.trainingAction ? h('div.weakness-card__action', [
      h('button.weakness-card__action-btn', {
        on: { click: () => { window.location.hash = trainingActionRoute(w.trainingAction!.type); } },
      }, `${w.trainingAction.label} →`),
    ]) : null,
  ].filter(Boolean) as VNode[]);
}

function renderWeaknessPanel(summaries: ReturnType<typeof filteredSummaries>): VNode {
  const MINIMUM_GAMES = 10;
  const count = summaries.length;

  if (count < MINIMUM_GAMES) {
    return h('section.stats-section', [
      h('h3.stats-section-title', 'Your Weaknesses'),
      h('div.stats-insufficient', [
        h('p', `Analyze at least ${MINIMUM_GAMES} games to see your weakness profile.`),
        h('p.stats-insufficient__count', `${count} analyzed game${count === 1 ? '' : 's'} so far.`),
      ]),
    ]);
  }

  const weaknesses = diagnoseWeaknesses(summaries);

  if (weaknesses.length === 0) {
    return h('section.stats-section', [
      h('h3.stats-section-title', 'Your Weaknesses'),
      h('p.stats-no-weaknesses', 'No significant weaknesses detected. Keep playing and analyzing!'),
    ]);
  }

  return h('section.stats-section', [
    h('h3.stats-section-title', 'Your Weaknesses'),
    h('div.weakness-list', weaknesses.slice(0, 5).map(renderWeaknessCard)),
  ]);
}

// ── Opening win rate table (import data only, no analysis required) ───────────

interface ImportOpeningRow {
  name:       string;
  color:      'White' | 'Black';
  games:      number;
  wins:       number;
  draws:      number;
  losses:     number;
  winRate:    number;  // percentage 0–100
  belowAvg:   boolean; // > 15pp below user's overall win rate for that color
  hasAnalysis: boolean; // hook for CCP-387-F2: at least one GameSummary exists for this opening+color
}

function buildImportOpeningRows(summaries: ReturnType<typeof filteredSummaries>): ImportOpeningRow[] {
  const games  = importedGames();
  if (games.length === 0) return [];

  // Index GameSummary gameIds for the "has analysis" indicator
  const analyzedIds = new Set(summaries.map(s => s.gameId));

  // Determine player color per game: importedUsername matches white/black name (lowercased)
  const byColorOpening = new Map<string, { wins: number; draws: number; losses: number; hasAnalysis: boolean }>();
  const colorWins   = { White: 0, Black: 0 };
  const colorGames  = { White: 0, Black: 0 };

  for (const g of games) {
    if (!g.result || (!g.opening && !g.eco)) continue;
    const name = g.opening || g.eco || 'Unknown';
    const username = (g.importedUsername ?? '').toLowerCase();
    let color: 'White' | 'Black' | null = null;
    if (username && g.white && g.white.toLowerCase() === username) color = 'White';
    else if (username && g.black && g.black.toLowerCase() === username) color = 'Black';
    // PGN paste: no username — skip color detection
    if (!color) continue;

    const key = `${name}||${color}`;
    const entry = byColorOpening.get(key) ?? { wins: 0, draws: 0, losses: 0, hasAnalysis: false };
    const won  = (color === 'White' && g.result === '1-0') || (color === 'Black' && g.result === '0-1');
    const drew = g.result === '1/2-1/2';
    if (won) entry.wins++;
    else if (drew) entry.draws++;
    else entry.losses++;
    if (analyzedIds.has(g.id)) entry.hasAnalysis = true;
    byColorOpening.set(key, entry);

    if (won) colorWins[color]++;
    colorGames[color]++;
  }

  const overallWinRate = {
    White: colorGames.White > 0 ? (colorWins.White / colorGames.White) * 100 : 50,
    Black: colorGames.Black > 0 ? (colorWins.Black / colorGames.Black) * 100 : 50,
  };

  const rows: ImportOpeningRow[] = [];
  for (const [key, entry] of byColorOpening) {
    const [name, colorStr] = key.split('||') as [string, 'White' | 'Black'];
    const total = entry.wins + entry.draws + entry.losses;
    if (total < 5) continue;
    const winRate = (entry.wins / total) * 100;
    rows.push({
      name,
      color:      colorStr,
      games:      total,
      wins:       entry.wins,
      draws:      entry.draws,
      losses:     entry.losses,
      winRate:    Math.round(winRate),
      belowAvg:   winRate < overallWinRate[colorStr] - 15,
      hasAnalysis: entry.hasAnalysis,
    });
  }
  rows.sort((a, b) => a.winRate - b.winRate);
  return rows;
}

function renderImportOpeningTable(summaries: ReturnType<typeof filteredSummaries>): VNode | null {
  const rows = buildImportOpeningRows(summaries);
  // Hide when fewer than 3 qualifying opening+color rows
  if (rows.length < 3) return null;

  return h('section.stats-section', [
    h('h3.stats-section-title', 'Opening Win Rates'),
    h('p.stats-section-note', 'Sorted worst-first. Requires 5+ games per opening as each colour.'),
    h('table.opening-table.opening-table--import', [
      h('thead', h('tr', [
        h('th', 'Opening'),
        h('th', 'Colour'),
        h('th', 'Games'),
        h('th', 'W / D / L'),
        h('th', 'Win %'),
      ])),
      h('tbody', rows.map(row =>
        h(`tr.opening-table__row${row.belowAvg ? '.opening-table__row--weak' : ''}`, [
          h('td.opening-table__name', [
            row.name,
            row.hasAnalysis ? h('span.opening-table__analyzed-badge', { attrs: { title: 'Analysis data available' } }, ' ●') : null,
          ].filter(Boolean) as (VNode | string)[]),
          h('td.opening-table__color', row.color),
          h('td.opening-table__games', String(row.games)),
          h('td.opening-table__wdl', `${row.wins} / ${row.draws} / ${row.losses}`),
          h('td.opening-table__winrate', `${row.winRate}%`),
        ]),
      )),
    ]),
  ]);
}

// ── Opening performance table ─────────────────────────────────────────────────

interface OpeningRow {
  name:     string;
  games:    number;
  accuracy: number;
  winRate:  number;
  belowAvg: boolean; // accuracy or win-rate significantly below user average
}

function buildOpeningRows(summaries: GameSummary[], globalAvgAccuracy: number): OpeningRow[] {
  const byOpening = new Map<string, GameSummary[]>();
  for (const s of summaries) {
    const key = s.opening || s.eco || 'Unknown';
    const group = byOpening.get(key) ?? [];
    group.push(s);
    byOpening.set(key, group);
  }
  const rows: OpeningRow[] = [];
  for (const [name, group] of byOpening) {
    if (group.length < 5) continue;
    const accuracy = group.reduce((a, s) => a + s.accuracy, 0) / group.length;
    const wins = group.filter(s => {
      const r = s.result;
      return (s.playerColor === 'white' && r === '1-0') || (s.playerColor === 'black' && r === '0-1');
    }).length;
    const winRate = wins / group.length;
    rows.push({
      name,
      games:    group.length,
      accuracy: Math.round(accuracy),
      winRate:  Math.round(winRate * 100),
      belowAvg: accuracy < globalAvgAccuracy - 5,
    });
  }
  // Sort worst-first (lowest accuracy)
  rows.sort((a, b) => a.accuracy - b.accuracy);
  return rows;
}

// Module-level state for "show all" toggle (simple boolean per view lifecycle)
let _openingShowAll = false;

function renderOpeningTable(summaries: GameSummary[], redraw: () => void): VNode {
  if (summaries.length < 5) {
    return h('section.stats-section', [
      h('h3.stats-section-title', 'Opening Performance'),
      h('p.stats-insufficient', 'Need at least 5 analyzed games per opening.'),
    ]);
  }

  const globalAvgAccuracy = summaries.reduce((a, s) => a + s.accuracy, 0) / summaries.length;
  const rows = buildOpeningRows(summaries, globalAvgAccuracy);

  if (rows.length === 0) {
    return h('section.stats-section', [
      h('h3.stats-section-title', 'Opening Performance'),
      h('p.stats-insufficient', 'Need 5+ games in each opening to show this table.'),
    ]);
  }

  const visible = _openingShowAll ? rows : rows.slice(0, 10);
  const showExpandBtn = rows.length > 10;

  return h('section.stats-section', [
    h('h3.stats-section-title', 'Opening Performance'),
    h('p.stats-section-note', `Your average accuracy: ${Math.round(globalAvgAccuracy)}%`),
    h('table.opening-table', [
      h('thead', h('tr', [
        h('th', 'Opening'),
        h('th', 'Games'),
        h('th', 'Accuracy'),
        h('th', 'Win %'),
      ])),
      h('tbody', visible.map(row =>
        h(`tr.opening-table__row${row.belowAvg ? '.opening-table__row--weak' : ''}`, [
          h('td.opening-table__name', row.name),
          h('td.opening-table__games', String(row.games)),
          h('td.opening-table__accuracy', `${row.accuracy}%`),
          h('td.opening-table__winrate', `${row.winRate}%`),
        ]),
      )),
    ]),
    showExpandBtn ? h('button.stats-expand-btn', {
      on: {
        click: () => {
          _openingShowAll = !_openingShowAll;
          redraw();
        },
      },
    }, _openingShowAll ? 'Show fewer' : `Show all ${rows.length} openings`) : null,
  ].filter(Boolean) as VNode[]);
}

// ── Tactical profile ──────────────────────────────────────────────────────────

function renderTacticalProfile(summaries: GameSummary[]): VNode {
  if (summaries.length < 10) {
    return h('section.stats-section', [
      h('h3.stats-section-title', 'Tactical Profile'),
      h('p.stats-insufficient', `Need at least 10 analyzed games. ${summaries.length} so far.`),
    ]);
  }

  const totalMoments    = summaries.reduce((a, s) => a + s.missedMomentCount, 0);
  const avgPerGame      = totalMoments / summaries.length;
  const totalBlunders   = summaries.reduce((a, s) => a + s.blunderCount, 0);
  const avgBlunders     = totalBlunders / summaries.length;

  // Type breakdown (use optional fields; absent on older records)
  const swingTotal     = summaries.reduce((a, s) => a + (s.swingCount     ?? 0), 0);
  const mateTotal      = summaries.reduce((a, s) => a + (s.missedMateCount ?? 0), 0);
  const collapseTotal  = summaries.reduce((a, s) => a + (s.collapseCount   ?? 0), 0);
  const hasBreakdown   = summaries.some(s => s.swingCount !== undefined);

  return h('section.stats-section', [
    h('h3.stats-section-title', 'Tactical Profile'),
    h('div.tactical-profile', [
      h('div.tactical-profile__stats', [
        h('div.tactical-stat', [h('span.tactical-stat__value', totalMoments.toString()), h('span.tactical-stat__label', 'total missed moments')]),
        h('div.tactical-stat', [h('span.tactical-stat__value', avgPerGame.toFixed(1)), h('span.tactical-stat__label', 'missed per game')]),
        h('div.tactical-stat', [h('span.tactical-stat__value', avgBlunders.toFixed(1)), h('span.tactical-stat__label', 'blunders per game')]),
      ]),
      hasBreakdown ? h('div.tactical-profile__breakdown', [
        h('div.tactical-breakdown__title', 'Missed moment types'),
        h('div.tactical-breakdown__items', [
          h('div.tactical-breakdown__item', [h('span', 'Win-chance swings:'), h('span', swingTotal.toString())]),
          h('div.tactical-breakdown__item', [h('span', 'Missed forced mates:'), h('span', mateTotal.toString())]),
          h('div.tactical-breakdown__item', [h('span', 'Near-win collapses:'), h('span', collapseTotal.toString())]),
        ]),
      ]) : null,
    ].filter(Boolean) as VNode[]),
  ]);
}

// ── Conversion and resourcefulness metrics ────────────────────────────────────

function renderConversionMetrics(summaries: GameSummary[]): VNode | null {
  const MIN_QUALIFYING = 5;

  const winningGames  = summaries.filter(s => s.hadWinningPosition);
  const losingGames   = summaries.filter(s => s.hadLosingPosition);

  const hasConversion     = winningGames.length >= MIN_QUALIFYING;
  const hasResourcefulness = losingGames.length >= MIN_QUALIFYING;

  if (!hasConversion && !hasResourcefulness) return null;

  const rows: VNode[] = [];

  if (hasConversion) {
    const converted = winningGames.filter(s => s.converted);
    const rate = converted.length / winningGames.length;
    const failedGames = winningGames.filter(s => !s.converted);
    rows.push(h('div.conversion-metric', [
      h('div.conversion-metric__header', [
        h('span.conversion-metric__label', 'Winning position conversion'),
        h('span.conversion-metric__value', `${Math.round(rate * 100)}%`),
        h('span.conversion-metric__sample', `(${winningGames.length} games)`),
      ]),
      rate < 0.6 && failedGames.length > 0 ? h('div.conversion-metric__games', [
        h('span.conversion-metric__note', 'Missed conversions: '),
        ...failedGames.slice(0, 5).map(s =>
          h('span.conversion-metric__game', {
            attrs: { title: `${s.date} vs. ${s.opponentRating}` },
          }, s.date.slice(0, 10)),
        ),
      ]) : null,
    ].filter(Boolean) as VNode[]));
  }

  if (hasResourcefulness) {
    const survived = losingGames.filter(s => s.survived);
    const rate = survived.length / losingGames.length;
    rows.push(h('div.conversion-metric', [
      h('div.conversion-metric__header', [
        h('span.conversion-metric__label', 'Resourcefulness (saved worse positions)'),
        h('span.conversion-metric__value', `${Math.round(rate * 100)}%`),
        h('span.conversion-metric__sample', `(${losingGames.length} games)`),
      ]),
    ]));
  }

  return h('section.stats-section', [
    h('h3.stats-section-title', 'Conversion & Resourcefulness'),
    ...rows,
  ]);
}

// ── Clock / time-management profile ──────────────────────────────────────────

function renderClockProfile(summaries: GameSummary[]): VNode | null {
  const MIN_CLOCK_GAMES = 10;
  const withClock = summaries.filter(s => s.hasClockData);

  // Hide entirely below threshold — no "need more games" message per spec
  if (withClock.length < MIN_CLOCK_GAMES) return null;

  const avgTime     = withClock.filter(s => s.avgTimePerMove !== undefined);
  const avgTimeMean = avgTime.length > 0
    ? (avgTime.reduce((a, s) => a + s.avgTimePerMove!, 0) / avgTime.length)
    : null;

  const totalTT = withClock.reduce((a, s) => a + (s.timeTroubleMoves ?? 0), 0);
  const totalMoves = withClock.reduce((a, s) => a + s.totalMoves, 0);
  const ttFraction = totalMoves > 0 ? totalTT / totalMoves : 0;

  // Blunder rate in time-trouble games vs non-time-trouble games
  const ttGames  = withClock.filter(s => (s.timeTroubleMoves ?? 0) > 0);
  const nonTtGames = withClock.filter(s => (s.timeTroubleMoves ?? 0) === 0);
  const ttBlunderAvg  = ttGames.length > 0
    ? ttGames.reduce((a, s) => a + s.blunderCount, 0) / ttGames.length : null;
  const nonTtBlunderAvg = nonTtGames.length > 0
    ? nonTtGames.reduce((a, s) => a + s.blunderCount, 0) / nonTtGames.length : null;

  return h('section.stats-section', [
    h('h3.stats-section-title', 'Time Management'),
    h('p.stats-section-note', `Based on ${withClock.length} games with clock data.`),
    h('div.clock-profile', [
      avgTimeMean !== null ? h('div.clock-stat', [
        h('span.clock-stat__value', avgTimeMean.toFixed(1) + 's'),
        h('span.clock-stat__label', 'avg time per move'),
      ]) : null,
      h('div.clock-stat', [
        h('span.clock-stat__value', Math.round(ttFraction * 100) + '%'),
        h('span.clock-stat__label', 'moves in time trouble (<30s)'),
      ]),
      (ttBlunderAvg !== null && nonTtBlunderAvg !== null) ? h('div.clock-profile__comparison', [
        h('p', `Blunders/game with time trouble: ${ttBlunderAvg.toFixed(1)}`),
        h('p', `Blunders/game without time trouble: ${nonTtBlunderAvg.toFixed(1)}`),
        ttBlunderAvg > nonTtBlunderAvg + 0.5
          ? h('p.clock-profile__warning', 'Time trouble is contributing to blunders.')
          : h('p.clock-profile__ok', 'Time trouble has minimal impact on your blunder rate.'),
      ]) : null,
    ].filter(Boolean) as VNode[]),
  ]);
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderStatsPage(redraw: () => void): VNode {
  if (!summariesLoaded()) return renderLoading();

  const summaries = filteredSummaries();
  if (summaries.length === 0) {
    return h('div.stats-page', [
      renderHeader(redraw),
      renderEmpty(),
    ]);
  }

  return h('div.stats-page', [
    renderHeader(redraw),
    // Weakness panel
    renderWeaknessPanel(summaries),
    // Accuracy & blunder trends
    renderTrendSection(summaries),
    // Opening win rate table (import data only — renders before any games are reviewed)
    renderImportOpeningTable(summaries),
    // Opening performance table (analysis data — accuracy and blunder columns)
    renderOpeningTable(summaries, redraw),
    // Tactical profile
    renderTacticalProfile(summaries),
    // Conversion and resourcefulness metrics (hidden below 5 qualifying games)
    renderConversionMetrics(summaries),
    // Clock / time-management profile (hidden when insufficient clock data)
    renderClockProfile(summaries),
  ].filter(Boolean) as VNode[]);
}
