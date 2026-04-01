/**
 * Opponent analytics foundation for the openings tool suite.
 *
 * Pure functions over ResearchGame[] and OpeningTreeNode.
 * Each function derives only what the current imported data can honestly support.
 *
 * Intentionally deferred (requires clock tags or engine analysis, not yet available):
 *   - Per-move accuracy / blunder rate
 *   - Time pressure indicators
 *   - Engine-evaluated opening quality scores
 */

import type { ResearchGame } from './types';
import type { OpeningTreeNode } from './tree';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Win / draw / loss counts with a total. */
export interface OpponentWDL {
  wins: number;
  draws: number;
  losses: number;
  total: number;
}

function emptyWDL(): OpponentWDL {
  return { wins: 0, draws: 0, losses: 0, total: 0 };
}

function accumulateResult(wdl: OpponentWDL, result: string | undefined, isWhite: boolean): void {
  if (!result) return;
  wdl.total++;
  if (result === '1-0')     { isWhite ? wdl.wins++   : wdl.losses++; }
  else if (result === '0-1') { isWhite ? wdl.losses++ : wdl.wins++;   }
  else if (result === '1/2-1/2') { wdl.draws++; }
}

// ---------------------------------------------------------------------------
// Base collection summary — computed once, shared by all tool dashboards
// ---------------------------------------------------------------------------

/** Recency buckets — count of games played within each time window. */
export interface RecencyBuckets {
  last30:  number;
  last90:  number;
  last365: number;
}

/**
 * Base collection-level scouting facts derivable from ResearchGame[] alone.
 * All tool dashboards should build on this rather than re-iterating games.
 *
 * Assumptions:
 *   - `target` matching is case-insensitive against game.white / game.black
 *   - Games with no date are not counted in recency buckets
 *   - Games with no timeClass are grouped under 'unknown'
 *   - Games where neither player matches target are excluded from WDL counts
 */
export interface CollectionSummary {
  totalGames: number;
  /** All games where target was white. */
  asWhite: OpponentWDL;
  /** All games where target was black. */
  asBlack: OpponentWDL;
  /** Combined WDL regardless of color. */
  overall: OpponentWDL;
  /** WDL and opponent rating per time control. */
  bySpeed: OpponentSpeedBreakdown[];
  /** Games played in recency windows (based on game date). */
  recency: RecencyBuckets;
  /** Earliest and latest game dates (YYYY-MM-DD), or null if unknown. */
  dateRange: { earliest: string; latest: string } | null;
}

/** Compute the base CollectionSummary for a collection. */
export function computeCollectionSummary(
  games: ResearchGame[],
  target: string,
): CollectionSummary {
  const lowerTarget = target.toLowerCase();

  const overall = emptyWDL();
  const asWhite = emptyWDL();
  const asBlack = emptyWDL();
  const speedMap = new Map<string, { wdl: OpponentWDL; oppRatingSum: number; oppRatingCount: number }>();
  const recency: RecencyBuckets = { last30: 0, last90: 0, last365: 0 };
  let earliest = '';
  let latest   = '';

  const now = Date.now();
  const MS_PER_DAY = 86_400_000;

  for (const g of games) {
    const isWhite = (g.white?.toLowerCase() ?? '') === lowerTarget;
    const isBlack = (g.black?.toLowerCase() ?? '') === lowerTarget;
    if (!isWhite && !isBlack) continue;

    accumulateResult(overall, g.result, isWhite);
    accumulateResult(isWhite ? asWhite : asBlack, g.result, isWhite);

    // Date range + recency
    if (g.date) {
      const d = g.date.slice(0, 10);
      if (!earliest || d < earliest) earliest = d;
      if (!latest   || d > latest)   latest   = d;
      const ageMs = now - new Date(d).getTime();
      if (ageMs <= 30  * MS_PER_DAY) recency.last30++;
      if (ageMs <= 90  * MS_PER_DAY) recency.last90++;
      if (ageMs <= 365 * MS_PER_DAY) recency.last365++;
    }

    // Speed breakdown
    const tc = g.timeClass ?? 'unknown';
    if (!speedMap.has(tc)) speedMap.set(tc, { wdl: emptyWDL(), oppRatingSum: 0, oppRatingCount: 0 });
    const sp = speedMap.get(tc)!;
    accumulateResult(sp.wdl, g.result, isWhite);
    const oppRating = isWhite ? g.blackRating : g.whiteRating;
    if (oppRating !== undefined) { sp.oppRatingSum += oppRating; sp.oppRatingCount++; }
  }

  const bySpeed: OpponentSpeedBreakdown[] = Array.from(speedMap.entries())
    .map(([timeClass, { wdl, oppRatingSum, oppRatingCount }]) => ({
      timeClass,
      wdl,
      avgOpponentRating: oppRatingCount > 0 ? Math.round(oppRatingSum / oppRatingCount) : null,
    }))
    .sort((a, b) => b.wdl.total - a.wdl.total);

  return {
    totalGames: games.length,
    asWhite,
    asBlack,
    overall,
    bySpeed,
    recency,
    dateRange: earliest && latest ? { earliest, latest } : null,
  };
}

// ---------------------------------------------------------------------------
// Prep Report data
// ---------------------------------------------------------------------------

/** W/D/L and rating context for a single time control. */
export interface OpponentSpeedBreakdown {
  timeClass: string;
  wdl: OpponentWDL;
  /** Average opponent's rating across these games, or null if no ratings. */
  avgOpponentRating: number | null;
}

/** A single ECO / opening frequency entry. */
export interface EcoFrequency {
  eco: string;
  opening: string;
  count: number;
  wdl: OpponentWDL;
}

/**
 * Aggregated prep-report analytics derivable from ResearchGame[] alone.
 * Suitable for the Prep Report dashboard.
 */
export interface PrepReportData {
  overall: OpponentWDL;
  bySpeed: OpponentSpeedBreakdown[];
  /** Top ECO codes by frequency (up to 10). */
  topEcos: EcoFrequency[];
  totalGames: number;
  /** Earliest and latest game dates (YYYY-MM-DD), or null if unknown. */
  dateRange: { earliest: string; latest: string } | null;
}

/**
 * Derive PrepReportData from a base CollectionSummary and the raw game list.
 * The summary provides pre-computed WDL/speed/date data; only ECO breakdown
 * requires a separate pass over games.
 */
export function computePrepReport(
  games: ResearchGame[],
  target: string,
  summary?: CollectionSummary,
): PrepReportData {
  const base = summary ?? computeCollectionSummary(games, target);
  const lowerTarget = target.toLowerCase();
  const ecoMap = new Map<string, { eco: string; opening: string; wdl: OpponentWDL }>();

  for (const g of games) {
    const isWhite = (g.white?.toLowerCase() ?? '') === lowerTarget;
    const isBlack = (g.black?.toLowerCase() ?? '') === lowerTarget;
    if (!isWhite && !isBlack) continue;
    const eco     = g.eco ?? '';
    const opening = g.opening ?? eco;
    if (eco) {
      if (!ecoMap.has(eco)) ecoMap.set(eco, { eco, opening, wdl: emptyWDL() });
      accumulateResult(ecoMap.get(eco)!.wdl, g.result, isWhite);
    }
  }

  const topEcos: EcoFrequency[] = Array.from(ecoMap.values())
    .sort((a, b) => b.wdl.total - a.wdl.total)
    .slice(0, 10)
    .map(e => ({ eco: e.eco, opening: e.opening, count: e.wdl.total, wdl: e.wdl }));

  return {
    overall:    base.overall,
    bySpeed:    base.bySpeed,
    topEcos,
    totalGames: base.totalGames,
    dateRange:  base.dateRange,
  };
}

// ---------------------------------------------------------------------------
// Style data
// ---------------------------------------------------------------------------

/** A first-move frequency entry. */
export interface FirstMoveFrequency {
  san: string;
  uci: string;
  count: number;
  /** Fraction of games 0–1. */
  pct: number;
}

/** Per-color opening style summary. */
export interface ColorStyleData {
  /** Most common first moves for this color, sorted by frequency. */
  firstMoves: FirstMoveFrequency[];
  /** Number of distinct ECO codes seen. */
  uniqueEcos: number;
}

/**
 * Opening style summary for both colors.
 * Suitable for the Style dashboard.
 */
export interface StyleData {
  asWhite: ColorStyleData;
  asBlack: ColorStyleData;
}

/** Derive StyleData from the opening tree root (first-move frequency) and game list. */
export function computeStyle(
  games: ResearchGame[],
  treeRoot: OpeningTreeNode | null,
  target: string,
): StyleData {
  const lowerTarget = target.toLowerCase();

  // First-move frequencies come from the opening tree root children,
  // split by which color played them.
  const whiteEcos = new Set<string>();
  const blackEcos = new Set<string>();

  for (const g of games) {
    const isWhite = (g.white?.toLowerCase() ?? '') === lowerTarget;
    const isBlack = (g.black?.toLowerCase() ?? '') === lowerTarget;
    if (g.eco) {
      if (isWhite) whiteEcos.add(g.eco);
      if (isBlack) blackEcos.add(g.eco);
    }
  }

  // First-move stats from tree root children (ply 1 = White's move).
  // Tree is built from all games; root children are White's first moves.
  const whiteFirst: FirstMoveFrequency[] = [];
  const blackFirst: FirstMoveFrequency[] = [];

  if (treeRoot) {
    const total = treeRoot.total || 1;
    for (const child of treeRoot.children) {
      // White's first move
      whiteFirst.push({
        san: child.san,
        uci: child.uci,
        count: child.total,
        pct: child.total / total,
      });
      // Black's reply (first moves for Black are at depth 2 — children of White's first move)
      for (const reply of child.children) {
        const existing = blackFirst.find(m => m.uci === reply.uci);
        if (existing) {
          existing.count += reply.total;
          existing.pct = existing.count / total;
        } else {
          blackFirst.push({
            san: reply.san,
            uci: reply.uci,
            count: reply.total,
            pct: reply.total / total,
          });
        }
      }
    }
  }

  whiteFirst.sort((a, b) => b.count - a.count);
  blackFirst.sort((a, b) => b.count - a.count);

  return {
    asWhite: { firstMoves: whiteFirst.slice(0, 8), uniqueEcos: whiteEcos.size },
    asBlack: { firstMoves: blackFirst.slice(0, 8), uniqueEcos: blackEcos.size },
  };
}

// ---------------------------------------------------------------------------
// Recency and form analytics
// ---------------------------------------------------------------------------

/**
 * WDL and opening context for a time window.
 */
export interface FormPeriod {
  wdl: OpponentWDL;
  /** The single most common ECO code in this window, or null if no ECO data. */
  topEco: string | null;
  /** Number of games with a known date that fell in this window. */
  datedGameCount: number;
}

/**
 * Recency and form data for a research collection.
 *
 * Honest limitations:
 *   - Only games with a known date contribute to period comparisons.
 *   - recentTrend is 'insufficient-data' when < 5 recent games have dates.
 *   - A 10-percentage-point difference in win rate is required to call a trend.
 *   - This is simple trend detection from results, not engine-backed form analysis.
 */
export interface FormData {
  last30:   FormPeriod;
  last90:   FormPeriod;
  /** All games (baseline). */
  baseline: FormPeriod;
  /**
   * Whether recent form (last30) is meaningfully different from baseline.
   * 'improving' = last30 win rate > baseline win rate + 0.10
   * 'declining' = last30 win rate < baseline win rate − 0.10
   * 'stable'    = within 10 percentage points
   * 'insufficient-data' = < 5 recent dated games
   */
  recentTrend: 'improving' | 'declining' | 'stable' | 'insufficient-data';
}

/** Derive FormData from a collection's game list. */
export function computeFormData(
  games: ResearchGame[],
  target: string,
): FormData {
  const lowerTarget = target.toLowerCase();
  const now = Date.now();
  const MS_PER_DAY = 86_400_000;

  const last30  = { wdl: emptyWDL(), ecoMap: new Map<string, number>(), datedGameCount: 0 };
  const last90  = { wdl: emptyWDL(), ecoMap: new Map<string, number>(), datedGameCount: 0 };
  const baseline = { wdl: emptyWDL(), ecoMap: new Map<string, number>(), datedGameCount: 0 };

  for (const g of games) {
    const isWhite = (g.white?.toLowerCase() ?? '') === lowerTarget;
    const isBlack = (g.black?.toLowerCase() ?? '') === lowerTarget;
    if (!isWhite && !isBlack) continue;

    accumulateResult(baseline.wdl, g.result, isWhite);
    if (g.eco) baseline.ecoMap.set(g.eco, (baseline.ecoMap.get(g.eco) ?? 0) + 1);

    if (!g.date) continue;
    const ageMs = now - new Date(g.date.slice(0, 10)).getTime();
    baseline.datedGameCount++;

    if (ageMs <= 90 * MS_PER_DAY) {
      accumulateResult(last90.wdl, g.result, isWhite);
      last90.datedGameCount++;
      if (g.eco) last90.ecoMap.set(g.eco, (last90.ecoMap.get(g.eco) ?? 0) + 1);
    }
    if (ageMs <= 30 * MS_PER_DAY) {
      accumulateResult(last30.wdl, g.result, isWhite);
      last30.datedGameCount++;
      if (g.eco) last30.ecoMap.set(g.eco, (last30.ecoMap.get(g.eco) ?? 0) + 1);
    }
  }

  const topEco = (m: Map<string, number>): string | null => {
    let best: [string, number] | null = null;
    for (const [eco, n] of m) {
      if (!best || n > best[1]) best = [eco, n];
    }
    return best?.[0] ?? null;
  };

  // Trend: win rate comparison between last30 and baseline
  const MIN_RECENT = 5;
  const TREND_THRESHOLD = 0.10;
  let recentTrend: FormData['recentTrend'] = 'insufficient-data';
  if (last30.datedGameCount >= MIN_RECENT && baseline.wdl.total > 0) {
    const recentWR   = last30.wdl.total  > 0 ? last30.wdl.wins  / last30.wdl.total  : 0;
    const baselineWR = baseline.wdl.total > 0 ? baseline.wdl.wins / baseline.wdl.total : 0;
    const delta = recentWR - baselineWR;
    if      (delta >  TREND_THRESHOLD) recentTrend = 'improving';
    else if (delta < -TREND_THRESHOLD) recentTrend = 'declining';
    else                               recentTrend = 'stable';
  }

  return {
    last30:   { wdl: last30.wdl,   topEco: topEco(last30.ecoMap),   datedGameCount: last30.datedGameCount },
    last90:   { wdl: last90.wdl,   topEco: topEco(last90.ecoMap),   datedGameCount: last90.datedGameCount },
    baseline: { wdl: baseline.wdl, topEco: topEco(baseline.ecoMap), datedGameCount: baseline.datedGameCount },
    recentTrend,
  };
}

// ---------------------------------------------------------------------------
// Prep Report line summaries
// ---------------------------------------------------------------------------

/** A single opening line extracted from the tree for Prep Report dashboards. */
export interface PrepLine {
  /** UCI move sequence from root. */
  moves: string[];
  /** SAN move sequence for display. */
  sans: string[];
  /** Games through this node. */
  frequency: number;
  /** Opponent win fraction (0–1) from their color perspective. */
  opponentWinPct: number;
  /** Most recent game date at this node (YYYY-MM-DD), or '' if unknown. */
  lastPlayed: string;
  /** True if lastPlayed is within 90 days of today. */
  isRecent: boolean;
  /** True if frequency >= 5 (minimum for reliable percentages). */
  isReliable: boolean;
}

/** Categorized line summaries for the Prep Report dashboard. */
export interface PrepReportLines {
  /** Most played lines (up to 10, by frequency). */
  likelyLines: PrepLine[];
  /** Lines where opponent wins most often (opponentWinPct > 0.60, reliable only). */
  strongLines: PrepLine[];
  /** Lines where opponent scores poorly (opponentWinPct < 0.30, reliable only). */
  weakLines: PrepLine[];
  /** Lines played within the last 90 days (recent additions). */
  freshLines: PrepLine[];
  /** Lines that reached >= 5% of total games but not played in last 90 days. */
  driftLines: PrepLine[];
}

/**
 * Walk the opening tree (DFS, up to maxDepth) and collect PrepLine entries.
 *
 * colorPerspective: 'white' | 'black' — which color the opponent is playing.
 * We measure opponentWinPct from their color's perspective:
 *   - asWhite: white wins / total
 *   - asBlack: black wins / total
 */
export function computePrepReportLines(
  treeRoot: OpeningTreeNode | null,
  colorPerspective: 'white' | 'black' | 'both',
  maxDepth = 8,
): PrepReportLines {
  if (!treeRoot || treeRoot.children.length === 0) {
    return { likelyLines: [], strongLines: [], weakLines: [], freshLines: [], driftLines: [] };
  }

  const rootTotal = treeRoot.total || 1;
  const now       = Date.now();
  const MS_90D    = 90 * 86_400_000;
  const allLines: PrepLine[] = [];

  // DFS walk — collect leaf nodes or nodes at maxDepth
  function walk(
    node: OpeningTreeNode,
    moves: string[],
    sans: string[],
    depth: number,
  ): void {
    if (node.total < 1) return;
    const isLeaf = node.children.length === 0 || depth >= maxDepth;
    if (isLeaf) {
      const opponentWinPct = colorPerspective === 'white'
        ? node.white / node.total
        : colorPerspective === 'black'
          ? node.black / node.total
          : (node.white + node.black) / (node.total * 2); // approximate for 'both'

      const isRecent = node.lastPlayed
        ? (now - new Date(node.lastPlayed).getTime()) <= MS_90D
        : false;

      allLines.push({
        moves:          [...moves],
        sans:           [...sans],
        frequency:      node.total,
        opponentWinPct: Math.round(opponentWinPct * 1000) / 1000,
        lastPlayed:     node.lastPlayed ?? '',
        isRecent,
        isReliable:     node.total >= 5,
      });
    }
    if (!isLeaf) {
      for (const child of node.children) {
        walk(child, [...moves, child.uci], [...sans, child.san], depth + 1);
      }
    }
  }

  for (const child of treeRoot.children) {
    walk(child, [child.uci], [child.san], 1);
  }

  // Sort helpers
  const byFreqDesc = (a: PrepLine, b: PrepLine) => b.frequency - a.frequency;

  const likelyLines = [...allLines].sort(byFreqDesc).slice(0, 10);

  const strongLines = allLines
    .filter(l => l.isReliable && l.opponentWinPct > 0.60)
    .sort(byFreqDesc)
    .slice(0, 8);

  const weakLines = allLines
    .filter(l => l.isReliable && l.opponentWinPct < 0.30)
    .sort(byFreqDesc)
    .slice(0, 8);

  const freshLines = allLines
    .filter(l => l.isRecent)
    .sort(byFreqDesc)
    .slice(0, 8);

  // Drift: was >= 5% of total games but not played in last 90 days
  const driftLines = allLines
    .filter(l => l.isReliable && (l.frequency / rootTotal) >= 0.05 && !l.isRecent)
    .sort(byFreqDesc)
    .slice(0, 8);

  return { likelyLines, strongLines, weakLines, freshLines, driftLines };
}

// ---------------------------------------------------------------------------
// Repertoire breadth, predictability, and opening concentration
// ---------------------------------------------------------------------------

/**
 * Grounded repertoire profile for Repertoire and Style dashboards.
 *
 * All metrics are derived purely from move-frequency distributions.
 * No psychological inference or engine data is involved.
 *
 * Interpretation notes:
 *   - firstMoveEntropy (bits): 0 = opponent always plays the same first move;
 *     log2(N) = opponent distributes evenly across N first moves.
 *   - normalizedEntropy (0–1): entropy / log2(N); 1 = maximally unpredictable.
 *   - topFirstMovePct: fraction of games that use the single most common first move.
 *   - top3EcoPct: fraction of games in the 3 most common ECO codes.
 *   - isSampleSmall: if true (< 30 games), all metrics should be treated as rough
 *     indicators, not reliable statistics.
 */
export interface RepertoireProfile {
  /** Number of distinct first moves played (from tree root children). */
  distinctFirstMoves: number;
  /** Number of distinct ECO codes seen across all games. */
  distinctEcos: number;
  /** Shannon entropy of the first-move frequency distribution, in bits. */
  firstMoveEntropy: number;
  /** firstMoveEntropy / log2(distinctFirstMoves); 0–1, or 0 if only 1 first move. */
  normalizedEntropy: number;
  /** Fraction of games (0–1) that used the single most common first move. */
  topFirstMovePct: number;
  /** Fraction of games (0–1) accounted for by the top 3 ECO codes. */
  top3EcoPct: number;
  /** Number of games used for this analysis. */
  sampleSize: number;
  /** True if sampleSize < 30 — metrics are less reliable. */
  isSampleSmall: boolean;
}

/** Derive repertoire breadth and predictability from tree and game list. */
export function computeRepertoireProfile(
  games: ResearchGame[],
  treeRoot: OpeningTreeNode | null,
  target: string,
): RepertoireProfile {
  const lowerTarget = target.toLowerCase();
  const ecoSet = new Set<string>();
  const ecoCount = new Map<string, number>();

  for (const g of games) {
    const isWhite = (g.white?.toLowerCase() ?? '') === lowerTarget;
    const isBlack = (g.black?.toLowerCase() ?? '') === lowerTarget;
    if (!isWhite && !isBlack) continue;
    if (g.eco) {
      ecoSet.add(g.eco);
      ecoCount.set(g.eco, (ecoCount.get(g.eco) ?? 0) + 1);
    }
  }

  const sampleSize = games.length;

  // First-move distribution from tree root
  const children   = treeRoot?.children ?? [];
  const treeTotal  = children.reduce((s, c) => s + c.total, 0);
  let firstMoveEntropy = 0;
  let topFirstMovePct  = 0;

  if (treeTotal > 0 && children.length > 0) {
    const probs = children.map(c => c.total / treeTotal);
    firstMoveEntropy = probs.reduce((h, p) => p > 0 ? h - p * Math.log2(p) : h, 0);
    topFirstMovePct  = probs[0] ?? 0; // children sorted by frequency (most common first)
  }

  const maxEntropy        = children.length > 1 ? Math.log2(children.length) : 0;
  const normalizedEntropy = maxEntropy > 0 ? firstMoveEntropy / maxEntropy : 0;

  // Top-3 ECO concentration
  const top3Count = Array.from(ecoCount.values())
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((s, n) => s + n, 0);
  const top3EcoPct = sampleSize > 0 ? top3Count / sampleSize : 0;

  return {
    distinctFirstMoves: children.length,
    distinctEcos:       ecoSet.size,
    firstMoveEntropy:   Math.round(firstMoveEntropy * 1000) / 1000,
    normalizedEntropy:  Math.round(normalizedEntropy * 1000) / 1000,
    topFirstMovePct:    Math.round(topFirstMovePct * 1000) / 1000,
    top3EcoPct:         Math.round(top3EcoPct * 1000) / 1000,
    sampleSize,
    isSampleSmall:      sampleSize < 30,
  };
}

// ---------------------------------------------------------------------------
// Likely-line module — recency-weighted opponent expectation for Prep Report
// ---------------------------------------------------------------------------

/**
 * A recency-weighted line entry for the Prep Report "Likely Lines" module.
 * Extends PrepLine with a recency score so the view can order by expected
 * current likelihood rather than raw lifetime frequency.
 */
export interface LikelyLineEntry extends PrepLine {
  /**
   * Recency boost factor applied to frequency:
   *   - 2.0  → lastPlayed ≤ 30 days ago
   *   - 1.5  → lastPlayed ≤ 90 days ago
   *   - 1.2  → lastPlayed ≤ 365 days ago
   *   - 1.0  → older or unknown
   */
  recencyBoost: number;
  /**
   * Recency-weighted score: frequency × recencyBoost.
   * Entries are sorted by this value descending.
   */
  recencyScore: number;
}

/**
 * Likely-line module output for one color perspective.
 * Covers the top-N expected lines from the opponent's imported history,
 * weighted to favour recently played lines over stale ones.
 */
export interface LikelyLineModule {
  /**
   * Lines sorted by recencyScore descending.
   * Capped at maxLines (default 8).
   */
  lines: LikelyLineEntry[];
  /**
   * True if there are enough reliable lines (frequency ≥ 5) to make
   * the module useful. False for very small or fragmented collections.
   */
  hasSufficientData: boolean;
  /**
   * Color perspective this module was computed for.
   * 'both' means opponent wins count all decisive results.
   */
  colorPerspective: 'white' | 'black' | 'both';
}

const MS_PER_DAY = 86_400_000;

function recencyBoostFor(lastPlayed: string, now: number): number {
  if (!lastPlayed) return 1.0;
  const ageMs = now - new Date(lastPlayed).getTime();
  if (ageMs <= 30  * MS_PER_DAY) return 2.0;
  if (ageMs <= 90  * MS_PER_DAY) return 1.5;
  if (ageMs <= 365 * MS_PER_DAY) return 1.2;
  return 1.0;
}

/**
 * Compute the recency-weighted likely-line module for the Prep Report.
 *
 * Walks the tree DFS (up to maxDepth) to collect line candidates, then
 * applies per-line recency boosts and sorts by recencyScore descending.
 *
 * Honest limitations:
 *   - hasSufficientData requires at least 3 reliable lines (frequency ≥ 5).
 *   - Lines with unknown lastPlayed dates get no recency boost (boost = 1.0).
 *   - Depth-limited walk means very long lines may be truncated at maxDepth.
 *
 * @param colorPerspective  'white'|'black' for color-specific win percentage;
 *                          'both' scores all decisive results equally.
 */
export function computeLikelyLineModule(
  treeRoot: OpeningTreeNode | null,
  colorPerspective: 'white' | 'black' | 'both',
  maxLines    = 8,
  maxDepth    = 8,
  recencyMode: 'recent' | 'all-time' = 'recent',
): LikelyLineModule {
  const empty = (): LikelyLineModule => ({
    lines: [], hasSufficientData: false, colorPerspective,
  });

  if (!treeRoot || treeRoot.children.length === 0) return empty();

  const now      = Date.now();
  const rawLines = computePrepReportLines(treeRoot, colorPerspective, maxDepth).likelyLines;

  const entries: LikelyLineEntry[] = rawLines.map(l => {
    const boost = recencyMode === 'all-time' ? 1.0 : recencyBoostFor(l.lastPlayed, now);
    return { ...l, recencyBoost: boost, recencyScore: l.frequency * boost };
  });

  // 'all-time': sort by raw frequency so recency boosts have no influence.
  // 'recent': sort by recency-weighted score (default).
  if (recencyMode === 'all-time') {
    entries.sort((a, b) => b.frequency - a.frequency);
  } else {
    entries.sort((a, b) => b.recencyScore - a.recencyScore);
  }

  const top = entries.slice(0, maxLines);
  const reliableCount = top.filter(l => l.isReliable).length;

  return {
    lines:             top,
    hasSufficientData: reliableCount >= 3,
    colorPerspective,
  };
}

// ---------------------------------------------------------------------------
// Targetable weakness module and prep notes
// ---------------------------------------------------------------------------

/**
 * A single targetable weakness signal for the Prep Report.
 * Wraps a PrepLine with a category label and a plain-language reason.
 */
export interface WeaknessEntry {
  /** The line with position and score data. */
  line: PrepLine;
  /**
   * Category of weakness:
   *   'low-score'   — opponent scores poorly here (opponentWinPct < 0.30)
   *   'drift'       — was played frequently but not recently (may be stale prep)
   *   'fresh-risk'  — recently introduced but not yet reliable (< 5 games)
   *   'narrow'      — bottleneck node (high frequency, few alternatives)
   */
  category: 'low-score' | 'drift' | 'fresh-risk' | 'narrow';
  /** Short plain-language label for display. */
  label: string;
}

/**
 * Targetable weakness module for the Prep Report.
 * All signals are grounded in the imported game history and tree structure.
 *
 * Honest limitations (recorded as module-level caveats):
 *   - No engine evaluation: a "low-score" line may have been bad positions, not bad preparation.
 *   - No clock data: "fresh-risk" is based on recency, not time pressure.
 *   - Small samples (< 5 games) reduce reliability of all signals.
 */
export interface WeaknessModule {
  /** Ranked list of weakness entries (most actionable first). */
  entries: WeaknessEntry[];
  /**
   * True if at least 2 entries are reliable (frequency ≥ 5).
   * False for very small or fragmented collections.
   */
  hasActionableWeaknesses: boolean;
  /** Plain-language caveats to display with the module. */
  caveats: string[];
}

/**
 * Derive targetable weakness signals from the Prep Report line data.
 *
 * Combines weakLines, driftLines, and freshLines from PrepReportLines into a
 * single ranked list with category labels and honest caveats.
 * No engine data, clock data, or tactical analysis is involved.
 */
export function computeWeaknessModule(
  lines: PrepReportLines,
  totalGames: number,
): WeaknessModule {
  const entries: WeaknessEntry[] = [];

  // Low-scoring lines: opponent scores < 30% — possible prep holes
  for (const l of lines.weakLines.slice(0, 3)) {
    entries.push({
      line:     l,
      category: 'low-score',
      label:    'Low scoring',
    });
  }

  // Drift lines: historically popular but not played recently — may be stale
  for (const l of lines.driftLines.slice(0, 3)) {
    // Skip if already added as low-score
    if (entries.some(e => e.line.moves.join() === l.moves.join())) continue;
    entries.push({
      line:     l,
      category: 'drift',
      label:    'Stale line',
    });
  }

  // Fresh-risk: recently introduced but with < 5 games — unproven territory
  const freshRisk = lines.freshLines.filter(l => !l.isReliable);
  for (const l of freshRisk.slice(0, 2)) {
    if (entries.some(e => e.line.moves.join() === l.moves.join())) continue;
    entries.push({
      line:     l,
      category: 'fresh-risk',
      label:    'Newly tried',
    });
  }

  // Sort: low-score first, then drift, then fresh-risk; within category by frequency desc
  const categoryOrder: Record<WeaknessEntry['category'], number> = {
    'low-score': 0, 'drift': 1, 'fresh-risk': 2, 'narrow': 3,
  };
  entries.sort((a, b) =>
    categoryOrder[a.category] - categoryOrder[b.category]
    || b.line.frequency - a.line.frequency
  );

  const reliable = entries.filter(e => e.line.isReliable);
  const caveats: string[] = [];
  if (totalGames < 30) {
    caveats.push('Small sample — treat all signals as rough indicators.');
  }
  if (entries.some(e => e.category === 'low-score')) {
    caveats.push('Low-scoring lines reflect results only — no engine evaluation available.');
  }
  if (entries.some(e => e.category === 'drift')) {
    caveats.push('Stale lines may have been replaced by other prep, not forgotten.');
  }

  return {
    entries:                entries.slice(0, 6),
    hasActionableWeaknesses: reliable.length >= 2,
    caveats,
  };
}

// ---------------------------------------------------------------------------
// Plain-language prep notes
// ---------------------------------------------------------------------------

/**
 * A single auto-generated prep note grounded in collection analytics.
 *
 * Notes are intentionally limited to what the imported game history can prove:
 *   - first-move tendencies
 *   - overall win/draw/loss rates
 *   - recency signals
 *   - opening concentration
 *
 * Intentionally excluded (requires engine or clock data, not available):
 *   - tactical weaknesses
 *   - time pressure patterns
 *   - move quality assessments
 */
export interface PrepNote {
  /** Short title for the note. */
  title: string;
  /** 1-2 sentence body grounded in actual data. */
  body: string;
  /** Confidence level based on sample size and signal clarity. */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Derive 2–5 auto-generated prep notes from collection analytics.
 * Returns an empty array if the collection is too sparse to say anything useful.
 */
export function computePrepNotes(
  summary: CollectionSummary,
  profile: RepertoireProfile,
  lines: PrepReportLines,
): PrepNote[] {
  const notes: PrepNote[] = [];
  const total = summary.overall.total;
  if (total < 5) return notes;

  const topSpeed = summary.bySpeed[0];

  // Note 1: Overall scoring context
  const winPct = total > 0 ? (summary.overall.wins / total * 100).toFixed(0) : '?';
  const dateSuffix = summary.dateRange
    ? ` (${summary.dateRange.earliest.slice(0, 7)} – ${summary.dateRange.latest.slice(0, 7)})`
    : '';
  notes.push({
    title:      'Overall scoring',
    body:       `Opponent scores ${winPct}% across ${total} games in this collection${dateSuffix}.`,
    confidence: total >= 30 ? 'high' : total >= 10 ? 'medium' : 'low',
  });

  // Note 2: Repertoire breadth
  if (profile.sampleSize >= 10) {
    const breadthDesc =
      profile.normalizedEntropy < 0.35 ? 'a narrow, predictable repertoire' :
      profile.normalizedEntropy < 0.65 ? 'a moderately varied repertoire' :
      'a broad, less predictable repertoire';
    const topMoveDesc = profile.topFirstMovePct > 0.7
      ? ` Most games (${(profile.topFirstMovePct * 100).toFixed(0)}%) start with the same first move.`
      : '';
    notes.push({
      title:      'Repertoire shape',
      body:       `Opponent shows ${breadthDesc} across ${profile.distinctFirstMoves} distinct opening lines.${topMoveDesc}`,
      confidence: profile.sampleSize >= 30 ? 'high' : 'medium',
    });
  }

  // Note 3: Time control context
  if (topSpeed && topSpeed.wdl.total >= 5) {
    const speedName = topSpeed.timeClass.charAt(0).toUpperCase() + topSpeed.timeClass.slice(1);
    const speedWinPct = (topSpeed.wdl.wins / topSpeed.wdl.total * 100).toFixed(0);
    notes.push({
      title:      `${speedName} games`,
      body:       `Most games (${topSpeed.wdl.total}) are ${speedName.toLowerCase()}, where opponent scores ${speedWinPct}%.`,
      confidence: topSpeed.wdl.total >= 20 ? 'high' : topSpeed.wdl.total >= 10 ? 'medium' : 'low',
    });
  }

  // Note 4: Recency signal
  const recent = summary.recency.last90;
  const recent30 = summary.recency.last30;
  if (recent >= 5) {
    const activityDesc = recent30 >= 5 ? 'active in the last month' : 'active in the last 3 months';
    notes.push({
      title:      'Recent activity',
      body:       `${recent} games in the last 90 days — opponent is ${activityDesc}. Recent-form lines may differ from lifetime tendencies.`,
      confidence: recent >= 20 ? 'high' : 'medium',
    });
  } else if (recent === 0 && total >= 10) {
    notes.push({
      title:      'Stale collection',
      body:       `No games in the last 90 days. This prep may not reflect the opponent's current repertoire.`,
      confidence: 'high',
    });
  }

  // Note 5: Pet-line signal
  const topLine = lines.likelyLines[0];
  if (topLine && topLine.isReliable && topLine.frequency / total > 0.25) {
    const moveSan = topLine.sans.slice(0, 3).join(' ');
    const pct = (topLine.frequency / total * 100).toFixed(0);
    notes.push({
      title:      'Dominant line',
      body:       `${pct}% of games follow ${moveSan}… — prepare this line deeply.`,
      confidence: topLine.frequency >= 20 ? 'high' : 'medium',
    });
  }

  return notes;
}

// ---------------------------------------------------------------------------
// Practice move candidates
// ---------------------------------------------------------------------------

/**
 * A weighted move candidate from the opponent's repertoire.
 * Used by Practice Against Them to select the opponent's response.
 */
export interface PracticeMoveCandidate {
  uci: string;
  san: string;
  /** Number of games that played this move from the current position. */
  frequency: number;
  /** Normalized weight 0–1 for weighted random selection. */
  weight: number;
}

/**
 * Build the set of weighted move candidates for a practice opponent response
 * from the current position's tree node.
 * Returns an empty array if no repertoire data exists (engine takeover signal).
 */
export function buildPracticeCandidates(node: OpeningTreeNode | null): PracticeMoveCandidate[] {
  if (!node || node.children.length === 0) return [];
  const total = node.children.reduce((sum, c) => sum + c.total, 0);
  if (total === 0) return [];
  return node.children.map(c => ({
    uci:       c.uci,
    san:       c.san,
    frequency: c.total,
    weight:    c.total / total,
  }));
}

/**
 * Pick a weighted random move from practice candidates.
 * Returns null if candidates is empty (repertoire exhausted).
 */
export function pickWeightedMove(candidates: PracticeMoveCandidate[]): PracticeMoveCandidate | null {
  if (candidates.length === 0) return null;
  const r = Math.random();
  let acc = 0;
  for (const c of candidates) {
    acc += c.weight;
    if (r <= acc) return c;
  }
  return candidates[candidates.length - 1]!;
}

/**
 * The outcome of a practice move selection attempt.
 *
 *  'selected'       — a credible repertoire move was chosen; proceed with it.
 *  'sparse-handoff' — children exist but none meet the frequency threshold;
 *                     engine should take over.
 *  'empty-handoff'  — the current node has no children at all;
 *                     engine should take over (or session can be ended).
 */
export type PracticeSelectionOutcome = 'selected' | 'sparse-handoff' | 'empty-handoff';

/** Result of a confidence-gated practice move selection. */
export interface PracticeSelectionResult {
  /**
   * The selected move. Null when outcome is 'sparse-handoff' or 'empty-handoff'.
   * Always non-null when outcome is 'selected'.
   */
  move: PracticeMoveCandidate | null;
  /** Why the selection succeeded or fell back. */
  outcome: PracticeSelectionOutcome;
  /**
   * Confidence derived from total games across all children at this node.
   * A position the opponent has reached 20+ times across imported games = 'high'.
   * Reflects the quality of the repertoire data, not just the winning odds.
   */
  confidence: ConfidenceLevel;
  /**
   * Sum of game counts across all direct children (eligible + ineligible).
   * Use this to label the handoff banner: "Opponent played here X times in your data."
   */
  totalFrequency: number;
}

/**
 * Select the opponent's next practice move with confidence gating and sparse-branch handling.
 *
 * Algorithm:
 *   1. Build all weighted candidates from the node's children.
 *   2. Filter by `minFreq` — moves the opponent played fewer than `minFreq` times are
 *      excluded from the eligible pool (too sparse to trust).
 *   3. If no candidates at all → 'empty-handoff' (tree boundary reached).
 *   4. If candidates exist but none are eligible → 'sparse-handoff' (data too thin).
 *   5. Otherwise → re-normalize weights for eligible pool and pick weighted-randomly.
 *
 * Design note: re-normalizing the eligible pool means that when one very common move
 * coexists with several rare moves, the rare moves below threshold are excluded and the
 * remaining probabilities add to 1 correctly. This avoids the common move being selected
 * at a lower-than-expected rate due to including sparse candidates in the total.
 *
 * Reference: lichess-org/lila practiceCtrl picks engine best move at the boundary —
 * the threshold here provides a coarser but honest repertoire-vs-engine boundary
 * without requiring engine analysis at every node.
 *
 * @param node     Current tree node whose children are the candidate moves.
 * @param minFreq  Minimum times the opponent must have played a move for it to be
 *                 eligible for repertoire selection. Default: 2 (see PracticeSession.minRepertoireFreq).
 */
export function selectPracticeMove(
  node: OpeningTreeNode | null,
  minFreq = 2,
): PracticeSelectionResult {
  const allCandidates = buildPracticeCandidates(node);
  const totalFrequency = allCandidates.reduce((sum, c) => sum + c.frequency, 0);
  const confidence = deriveConfidence(totalFrequency);

  if (allCandidates.length === 0) {
    return { move: null, outcome: 'empty-handoff', confidence: 'insufficient', totalFrequency: 0 };
  }

  const eligible = allCandidates.filter(c => c.frequency >= minFreq);

  if (eligible.length === 0) {
    // Node has children but all are below the frequency threshold — engine handoff.
    return { move: null, outcome: 'sparse-handoff', confidence, totalFrequency };
  }

  // Re-normalize weights so eligible candidates sum to 1.0 after filtering sparse moves.
  const eligibleTotal = eligible.reduce((sum, c) => sum + c.frequency, 0);
  const normalized: PracticeMoveCandidate[] = eligible.map(c => ({
    ...c,
    weight: c.frequency / eligibleTotal,
  }));

  const move = pickWeightedMove(normalized)!; // safe: normalized is non-empty
  return { move, outcome: 'selected', confidence, totalFrequency };
}

// ---------------------------------------------------------------------------
// Termination profile
// ---------------------------------------------------------------------------

export interface TerminationProfile {
  resignation: number;
  timeout: number;
  checkmate: number;
  drawAgreement: number;
  stalemate: number;
  other: number;
  total: number;
}

const TERMINATION_RE = /\[Termination\s+"([^"]+)"\]/i;

function classifyTermination(raw: string): keyof TerminationProfile {
  const t = raw.toLowerCase();
  if (t.includes('time forfeit') || t.includes('time') || t.includes('timeout') || t.includes('abandoned')) return 'timeout';
  if (t.includes('checkmate') || t === 'normal' || t === 'won by checkmate') {
    // "Normal" in Lichess = checkmate OR resignation.  We need to further disambiguate
    // by checking if the game ended with # in the move text. For simplicity at this stage,
    // treat "Normal" as resignation (the common case) since Lichess uses "Normal" for both.
    if (t === 'normal') return 'resignation';
    return 'checkmate';
  }
  if (t.includes('resign')) return 'resignation';
  if (t.includes('stalemate')) return 'stalemate';
  if (t.includes('draw') || t.includes('agreement') || t.includes('repetition') || t.includes('insufficient') || t.includes('50')) return 'drawAgreement';
  return 'other';
}

/**
 * Parse PGN Termination headers and classify how games ended.
 * Only counts games where the target player participated.
 */
export function computeTerminationProfile(games: readonly ResearchGame[], target: string): TerminationProfile {
  const tgt = target.toLowerCase();
  const result: TerminationProfile = { resignation: 0, timeout: 0, checkmate: 0, drawAgreement: 0, stalemate: 0, other: 0, total: 0 };

  for (const g of games) {
    const isPlayer = g.white?.toLowerCase() === tgt || g.black?.toLowerCase() === tgt;
    if (!isPlayer || !g.pgn) continue;
    const m = TERMINATION_RE.exec(g.pgn);
    if (!m) { result.other++; result.total++; continue; }
    const cat = classifyTermination(m[1] ?? '');
    result[cat]++;
    result.total++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Game length profile
// ---------------------------------------------------------------------------

export interface GameLengthProfile {
  avgLength: number;
  avgWinLength: number;
  avgLossLength: number;
  shortGamePct: number;
  totalCounted: number;
}

const MOVE_NUMBER_RE = /\d+\./g;

function countMoves(pgn: string): number {
  // Strip headers
  const body = pgn.replace(/\[[^\]]*\]\s*/g, '').trim();
  const matches = body.match(MOVE_NUMBER_RE);
  return matches ? matches.length : 0;
}

/**
 * Compute game length statistics from PGN move counts.
 */
export function computeGameLengthProfile(games: readonly ResearchGame[], target: string): GameLengthProfile {
  const tgt = target.toLowerCase();
  const winLengths: number[] = [];
  const lossLengths: number[] = [];
  const allLengths: number[] = [];

  for (const g of games) {
    const isWhite = g.white?.toLowerCase() === tgt;
    const isBlack = g.black?.toLowerCase() === tgt;
    if (!isWhite && !isBlack) continue;
    if (!g.pgn) continue;

    const moves = countMoves(g.pgn);
    if (moves === 0) continue;
    allLengths.push(moves);

    const won = (isWhite && g.result === '1-0') || (isBlack && g.result === '0-1');
    const lost = (isWhite && g.result === '0-1') || (isBlack && g.result === '1-0');
    if (won)  winLengths.push(moves);
    if (lost) lossLengths.push(moves);
  }

  const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
  const shortCount = allLengths.filter(l => l < 20).length;

  return {
    avgLength: avg(allLengths),
    avgWinLength: avg(winLengths),
    avgLossLength: avg(lossLengths),
    shortGamePct: allLengths.length > 0 ? Math.round((shortCount / allLengths.length) * 100) : 0,
    totalCounted: allLengths.length,
  };
}

// ---------------------------------------------------------------------------
// Opening recommendations
// ---------------------------------------------------------------------------

export interface OpeningRecommendation {
  line: PrepLine;
  reason: string;
  category: 'exploit-low-score' | 'exploit-drift' | 'exploit-fresh';
  confidence: 'high' | 'medium' | 'low';
  actionLabel: string;
}

/**
 * Generate actionable opening recommendations from weakness data.
 * Only recommends lines with sufficient games (isReliable).
 */
export function computeOpeningRecommendations(
  weakness: WeaknessModule,
  lines: PrepReportLines,
  totalGames: number,
): OpeningRecommendation[] {
  const recs: OpeningRecommendation[] = [];
  if (!weakness.hasActionableWeaknesses) return recs;

  for (const entry of weakness.entries) {
    const { line, category } = entry;
    if (!line.isReliable) continue;

    const pct = Math.round(line.opponentWinPct * 100);
    const n = line.frequency;
    const moveSan = line.sans.slice(0, 4).join(' ');

    let reason: string;
    let recCategory: OpeningRecommendation['category'];
    let confidence: OpeningRecommendation['confidence'];

    if (category === 'low-score') {
      reason = `They score ${pct}% in this line (n=${n})`;
      recCategory = 'exploit-low-score';
      confidence = n >= 10 ? 'high' : 'medium';
    } else if (category === 'drift') {
      reason = `Historically popular but no longer played recently (n=${n})`;
      recCategory = 'exploit-drift';
      confidence = 'medium';
    } else if (category === 'fresh-risk') {
      reason = `New addition to their repertoire, untested (n=${n})`;
      recCategory = 'exploit-fresh';
      confidence = 'low';
    } else {
      continue;
    }

    recs.push({
      line,
      reason,
      category: recCategory,
      confidence,
      actionLabel: `Prepare ${moveSan}`,
    });
  }

  return recs.slice(0, 8); // cap at 8 recommendations
}

// ---------------------------------------------------------------------------
// Style confidence model
// ---------------------------------------------------------------------------

/**
 * Confidence level for a derived style signal.
 *  'high'         — supported by ≥20 matching games with consistent signal
 *  'medium'       — 10–19 games or moderate consistency
 *  'low'          — fewer than 10 games or weak signal
 *  'insufficient' — too few games to report anything useful
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient';

/**
 * How a style signal was derived — controls display tone.
 *  'descriptive'  — observable fact: "plays e4 in 70% of games"
 *  'interpretive' — reasonable inference, hedged: "appears to prefer open positions"
 *  'cautious'     — behavioral/psychological claim requiring explicit caveats
 */
export type SignalType = 'descriptive' | 'interpretive' | 'cautious';

/** A single synthesized signal about the opponent's playing style. */
export interface StyleAxisSignal {
  /** Human-readable label suitable for display in the Style dashboard. */
  label: string;
  /** How the signal was derived — drives display tone in the view. */
  type: SignalType;
  /** Confidence given available data. */
  confidence: ConfidenceLevel;
  /** Optional caveat shown alongside the signal when confidence is low or the signal is interpretive/cautious. */
  caveat?: string;
}

/**
 * Assembled view-model for the Style dashboard.
 * Wraps raw analytics data with confidence annotations so the view
 * can render each signal with appropriate tone and hedging.
 */
export interface StyleViewModel {
  /** Raw first-move and ECO style data. */
  style: StyleData;
  /** Recent form and trend data. */
  form: FormData;
  /** Opening breadth and predictability profile. */
  profile: RepertoireProfile;
  /**
   * Synthesized style axis signals.
   * Mix of descriptive, interpretive, and cautious entries.
   * View should group or label by `type` so the user knows what is fact vs inference.
   */
  signals: StyleAxisSignal[];
  /** Overall data confidence for this collection. Drives banner display in the view. */
  overallConfidence: ConfidenceLevel;
}

function deriveConfidence(n: number): ConfidenceLevel {
  if (n >= 20) return 'high';
  if (n >= 10) return 'medium';
  if (n >= 5)  return 'low';
  return 'insufficient';
}

/**
 * Assemble a StyleViewModel from available collection data.
 *
 * Signal honesty rules:
 *   - 'descriptive' signals are only emitted when the underlying count is ≥ 3.
 *   - 'interpretive' signals require ≥ 5 games with sufficient spread.
 *   - 'cautious' signals (behavioral tendencies) are reserved for future work when
 *     clock/engine data is available; none are emitted here.
 *   - Signals that cannot be derived honestly (e.g., time-pressure tendencies, engine
 *     accuracy) are intentionally omitted — they require data not yet in scope.
 */
export function computeStyleViewModel(
  games: ResearchGame[],
  treeRoot: OpeningTreeNode | null,
  target: string,
  summary: CollectionSummary,
): StyleViewModel {
  const style   = computeStyle(games, treeRoot, target);
  const form    = computeFormData(games, target);
  const profile = computeRepertoireProfile(games, treeRoot, target);

  const n = summary.overall.total;
  const overallConfidence = deriveConfidence(n);
  const signals: StyleAxisSignal[] = [];

  // --- Descriptive: first-move preference as White ---
  const whiteTop = style.asWhite.firstMoves[0];
  if (whiteTop && whiteTop.count >= 3) {
    const pct = Math.round(whiteTop.pct * 100);
    signals.push({
      label: `Plays ${whiteTop.san} as White in ${pct}% of games`,
      type: 'descriptive',
      confidence: deriveConfidence(whiteTop.count),
    });
  }

  // --- Descriptive: first-move preference as Black ---
  const blackTop = style.asBlack.firstMoves[0];
  if (blackTop && blackTop.count >= 3) {
    const pct = Math.round(blackTop.pct * 100);
    signals.push({
      label: `Replies with ${blackTop.san} as Black in ${pct}% of games`,
      type: 'descriptive',
      confidence: deriveConfidence(blackTop.count),
    });
  }

  // --- Descriptive: opening variety (ECO count) ---
  if (n >= 5) {
    const ecoW = style.asWhite.uniqueEcos;
    const ecoB = style.asBlack.uniqueEcos;
    if (ecoW > 0) {
      signals.push({
        label: `${ecoW} distinct opening ${ecoW === 1 ? 'variation' : 'variations'} as White`,
        type: 'descriptive',
        confidence: overallConfidence,
      });
    }
    if (ecoB > 0) {
      signals.push({
        label: `${ecoB} distinct opening ${ecoB === 1 ? 'variation' : 'variations'} as Black`,
        type: 'descriptive',
        confidence: overallConfidence,
      });
    }
  }

  // --- Interpretive: repertoire predictability ---
  if (n >= 5 && profile.distinctFirstMoves > 0) {
    let predictLabel: string;
    if (profile.normalizedEntropy < 0.35) {
      predictLabel = 'Narrow opening repertoire — likely to play familiar lines';
    } else if (profile.normalizedEntropy > 0.65) {
      predictLabel = 'Broad opening repertoire — harder to predict';
    } else {
      predictLabel = 'Moderate opening variety';
    }
    signals.push({
      label: predictLabel,
      type: 'interpretive',
      confidence: deriveConfidence(n),
      caveat: 'Based on observed move distribution only.',
    });
  }

  // --- Interpretive: recent form trend ---
  if (form.recentTrend !== 'insufficient-data') {
    const trendLabels = {
      improving: 'Recent results trending upward',
      declining: 'Recent results trending downward',
      stable:    'Results stable in recent games',
    } as const;
    signals.push({
      label: trendLabels[form.recentTrend],
      type: 'interpretive',
      confidence: deriveConfidence(form.last30.datedGameCount),
      caveat: 'Based on win-rate change only — not engine-backed.',
    });
  }

  // --- Descriptive: gambit / sharp-opening tendency ---
  // Derived from opening names containing "Gambit" — no engine needed.
  // Intentionally narrow scope: only named gambits are counted, not tactical sharpness.
  if (n >= 5) {
    const lowerTarget = target.toLowerCase();
    let gambitsWhite = 0;
    let gambitsBlack = 0;
    let gamesAsWhite = 0;
    let gamesAsBlack = 0;
    for (const g of games) {
      const isWhite = (g.white?.toLowerCase() ?? '') === lowerTarget;
      const isBlack = (g.black?.toLowerCase() ?? '') === lowerTarget;
      if (!isWhite && !isBlack) continue;
      const hasGambit = (g.opening ?? '').toLowerCase().includes('gambit');
      if (isWhite) { gamesAsWhite++; if (hasGambit) gambitsWhite++; }
      if (isBlack) { gamesAsBlack++; if (hasGambit) gambitsBlack++; }
    }
    const gambitsTotal  = gambitsWhite + gambitsBlack;
    const totalSided    = gamesAsWhite + gamesAsBlack;
    if (totalSided >= 5 && gambitsTotal > 0) {
      const pct = Math.round((gambitsTotal / totalSided) * 100);
      const gambConf = deriveConfidence(totalSided);
      signals.push({
        label: `${pct}% of games involve named gambits`,
        type: 'descriptive',
        confidence: gambConf,
        caveat: 'Based on opening name only — does not measure tactical sharpness.',
      });
    } else if (totalSided >= 10 && gambitsTotal === 0) {
      signals.push({
        label: 'No named gambits in imported games',
        type: 'descriptive',
        confidence: deriveConfidence(totalSided),
        caveat: 'Based on opening name only.',
      });
    }
  }

  // --- Interpretive: comfort zone concentration ---
  // top3EcoPct > 0.7 means 70%+ of games concentrate in 3 ECO codes.
  // Indicates a player who stays in familiar territory vs experimenting.
  if (n >= 10 && profile.top3EcoPct > 0) {
    const pct = Math.round(profile.top3EcoPct * 100);
    let concentrationLabel: string;
    if (profile.top3EcoPct >= 0.75) {
      concentrationLabel = `Top 3 openings cover ${pct}% of games — concentrated comfort zone`;
    } else if (profile.top3EcoPct >= 0.5) {
      concentrationLabel = `Top 3 openings cover ${pct}% of games — moderate comfort zone`;
    } else {
      concentrationLabel = `Top 3 openings cover ${pct}% of games — varied repertoire`;
    }
    signals.push({
      label: concentrationLabel,
      type: 'interpretive',
      confidence: deriveConfidence(n),
      caveat: 'Based on ECO code frequency only.',
    });
  }

  // --- Interpretive: draw tendency ---
  // A draw rate meaningfully above average (>35%) or below (< 10%) is worth noting.
  // No baseline normalization — just a direct rate with caveats.
  if (n >= 15) {
    const drawRate = summary.overall.draws / (n || 1);
    const drawPct = Math.round(drawRate * 100);
    if (drawRate >= 0.35) {
      signals.push({
        label: `High draw rate: ${drawPct}% of games drawn`,
        type: 'interpretive',
        confidence: deriveConfidence(n),
        caveat: 'Draw rates vary by rating, time control, and opponent pool.',
      });
    } else if (drawRate < 0.07) {
      signals.push({
        label: `Low draw rate: ${drawPct}% of games drawn`,
        type: 'interpretive',
        confidence: deriveConfidence(n),
        caveat: 'Low draw rates are common at faster time controls.',
      });
    }
  }

  return { style, form, profile, signals, overallConfidence };
}
