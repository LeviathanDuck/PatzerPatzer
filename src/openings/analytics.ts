/**
 * Opponent analytics foundation for the openings tool suite.
 *
 * Pure functions over ResearchGame[] and OpeningTreeNode.
 * Each function derives only what the current imported data can honestly support.
 */

import type { ResearchGame } from './types';
import type { OpeningTreeNode } from './tree';

// ---------------------------------------------------------------------------
// Sample size thresholds
// ---------------------------------------------------------------------------

export const MIN_COLLECTION_SIZE = 20;
export const MIN_RELIABLE_SAMPLE = 5;

export function isCollectionSmall(total: number): boolean {
  return total < MIN_COLLECTION_SIZE;
}

export function isStatReliable(n: number): boolean {
  return n >= MIN_RELIABLE_SAMPLE;
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

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
// Base collection summary
// ---------------------------------------------------------------------------

export interface RecencyBuckets {
  last30:  number;
  last90:  number;
  last365: number;
}

export interface CollectionSummary {
  totalGames: number;
  asWhite: OpponentWDL;
  asBlack: OpponentWDL;
  overall: OpponentWDL;
  bySpeed: OpponentSpeedBreakdown[];
  recency: RecencyBuckets;
  dateRange: { earliest: string; latest: string } | null;
}

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

    if (g.date) {
      const d = g.date.slice(0, 10);
      if (!earliest || d < earliest) earliest = d;
      if (!latest   || d > latest)   latest   = d;
      const ageMs = now - new Date(d).getTime();
      if (ageMs <= 30  * MS_PER_DAY) recency.last30++;
      if (ageMs <= 90  * MS_PER_DAY) recency.last90++;
      if (ageMs <= 365 * MS_PER_DAY) recency.last365++;
    }

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

export interface OpponentSpeedBreakdown {
  timeClass: string;
  wdl: OpponentWDL;
  avgOpponentRating: number | null;
}

export interface EcoFrequency {
  eco: string;
  opening: string;
  count: number;
  wdl: OpponentWDL;
}

export interface PrepReportData {
  overall: OpponentWDL;
  bySpeed: OpponentSpeedBreakdown[];
  topEcos: EcoFrequency[];
  totalGames: number;
  dateRange: { earliest: string; latest: string } | null;
}

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
// Style and Psychology profiling
// ---------------------------------------------------------------------------

export interface FirstMoveFrequency {
  san: string;
  uci: string;
  count: number;
  pct: number;
}

export interface ColorStyleData {
  firstMoves: FirstMoveFrequency[];
  uniqueEcos: number;
}

export interface StyleData {
  asWhite: ColorStyleData;
  asBlack: ColorStyleData;
}

export interface PsychologyModule {
  mentalStability: number;
  tiltScore: number;
  postLossWinrate: number;
  resignationRate: number;
}

export interface ClockProfile {
  flagRate: number;
  timePressureBlunders: number;
}

export type Archetype = 
  | 'The Solid Rock' 
  | 'The Speedster' 
  | 'The Time Scrambler' 
  | 'The Gambit Wizard' 
  | 'The Clock Master' 
  | 'The Unpredictable'
  | 'The Strategist';

export function computeStyle(
  games: ResearchGame[],
  treeRoot: OpeningTreeNode | null,
  target: string,
): StyleData {
  const lowerTarget = target.toLowerCase();
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

  const whiteFirst: FirstMoveFrequency[] = [];
  const blackFirst: FirstMoveFrequency[] = [];

  if (treeRoot) {
    const total = treeRoot.total || 1;
    for (const child of treeRoot.children) {
      whiteFirst.push({ san: child.san, uci: child.uci, count: child.total, pct: child.total / total });
      for (const reply of child.children) {
        const existing = blackFirst.find(m => m.uci === reply.uci);
        if (existing) {
          existing.count += reply.total;
          existing.pct = existing.count / total;
        } else {
          blackFirst.push({ san: reply.san, uci: reply.uci, count: reply.total, pct: reply.total / total });
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

export function computePsychology(games: ResearchGame[], target: string): PsychologyModule {
  const tgt = target.toLowerCase();
  let losses = 0;
  let gamesAfterLoss = 0;
  let winsAfterLoss = 0;
  let totalResignations = 0;
  
  const sorted = [...games].sort((a, b) => (a.date ?? '') < (b.date ?? '') ? -1 : 1);

  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    if (!g) continue;
    const isWhite = g.white?.toLowerCase() === tgt;
    const isBlack = g.black?.toLowerCase() === tgt;
    if (!isWhite && !isBlack) continue;

    const won = (isWhite && g.result === '1-0') || (isBlack && g.result === '0-1');
    const lost = (isWhite && g.result === '0-1') || (isBlack && g.result === '1-0');

    if (lost) {
      losses++;
      if (g.pgn.toLowerCase().includes('resign')) totalResignations++;
      const next = sorted.slice(i + 1).find(ng => ng.white?.toLowerCase() === tgt || ng.black?.toLowerCase() === tgt);
      if (next) {
        gamesAfterLoss++;
        const nextWhite = next.white?.toLowerCase() === tgt;
        const nextWon = (nextWhite && next.result === '1-0') || (!nextWhite && next.result === '0-1');
        if (nextWon) winsAfterLoss++;
      }
    }
  }

  const postLossWinrate = gamesAfterLoss > 0 ? (winsAfterLoss / gamesAfterLoss) * 100 : 50;
  const resignationRate = losses > 0 ? (totalResignations / losses) * 100 : 0;
  const tiltScore = Math.max(0, 50 - postLossWinrate) * 2;
  const mentalStability = Math.max(0, 100 - (tiltScore * 0.7 + (resignationRate > 50 ? (resignationRate-50) : 0)));

  return {
    mentalStability: Math.round(mentalStability),
    tiltScore: Math.round(tiltScore),
    postLossWinrate: Math.round(postLossWinrate),
    resignationRate: Math.round(resignationRate),
  };
}

export function computeClockProfile(games: ResearchGame[], target: string): ClockProfile {
  const tgt = target.toLowerCase();
  let totalGames = 0;
  let flagLosses = 0;

  for (const g of games) {
    const isWhite = g.white?.toLowerCase() === tgt;
    const isBlack = g.black?.toLowerCase() === tgt;
    if (!isWhite && !isBlack) continue;
    totalGames++;
    if (g.pgn.toLowerCase().includes('time forfeit')) {
      const lost = (isWhite && g.result === '0-1') || (isBlack && g.result === '1-0');
      if (lost) flagLosses++;
    }
  }

  return {
    flagRate: totalGames > 0 ? Math.round((flagLosses / totalGames) * 100) : 0,
    timePressureBlunders: 0,
  };
}

export function determineArchetype(
  style: StyleData, 
  psych: PsychologyModule, 
  clock: ClockProfile,
  profile: RepertoireProfile
): Archetype {
  if (clock.flagRate > 15) return 'The Time Scrambler';
  if (psych.tiltScore > 40) return 'The Unpredictable';
  if (profile.normalizedEntropy < 0.3) return 'The Solid Rock';
  if (style.asWhite.uniqueEcos + style.asBlack.uniqueEcos > 15) return 'The Gambit Wizard';
  if (clock.flagRate < 5 && psych.mentalStability > 70) return 'The Clock Master';
  return 'The Strategist';
}

// ---------------------------------------------------------------------------
// Recency and form analytics
// ---------------------------------------------------------------------------

export interface FormPeriod {
  wdl: OpponentWDL;
  topEco: string | null;
  datedGameCount: number;
}

export interface FormData {
  last30:   FormPeriod;
  last90:   FormPeriod;
  baseline: FormPeriod;
  recentTrend: 'improving' | 'declining' | 'stable' | 'insufficient-data';
}

export function computeFormData(games: ResearchGame[], target: string): FormData {
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
    for (const [eco, n] of m) if (!best || n > best[1]) best = [eco, n];
    return best?.[0] ?? null;
  };

  const delta = (last30.wdl.wins / (last30.wdl.total || 1)) - (baseline.wdl.wins / (baseline.wdl.total || 1));
  let recentTrend: FormData['recentTrend'] = 'insufficient-data';
  if (last30.datedGameCount >= 5) {
    if (delta > 0.1) recentTrend = 'improving';
    else if (delta < -0.1) recentTrend = 'declining';
    else recentTrend = 'stable';
  }

  return {
    last30:   { wdl: last30.wdl, topEco: topEco(last30.ecoMap), datedGameCount: last30.datedGameCount },
    last90:   { wdl: last90.wdl, topEco: topEco(last90.ecoMap), datedGameCount: last90.datedGameCount },
    baseline: { wdl: baseline.wdl, topEco: topEco(baseline.ecoMap), datedGameCount: baseline.datedGameCount },
    recentTrend,
  };
}

// ---------------------------------------------------------------------------
// Prep Report line summaries
// ---------------------------------------------------------------------------

export interface PrepLine {
  moves: string[];
  sans: string[];
  frequency: number;
  opponentWinPct: number;
  lastPlayed: string;
  isRecent: boolean;
  isReliable: boolean;
}

export interface PrepReportLines {
  likelyLines: PrepLine[];
  strongLines: PrepLine[];
  weakLines: PrepLine[];
  freshLines: PrepLine[];
  driftLines: PrepLine[];
}

export function computePrepReportLines(
  treeRoot: OpeningTreeNode | null,
  colorPerspective: 'white' | 'black' | 'both',
  maxDepth = 8,
): PrepReportLines {
  if (!treeRoot || treeRoot.children.length === 0) return { likelyLines: [], strongLines: [], weakLines: [], freshLines: [], driftLines: [] };
  const rootTotal = treeRoot.total || 1;
  const now = Date.now();
  const allLines: PrepLine[] = [];

  function walk(node: OpeningTreeNode, moves: string[], sans: string[], depth: number): void {
    if (node.total < 1) return;
    if (node.children.length === 0 || depth >= maxDepth) {
      const winPct = colorPerspective === 'white' ? node.white / node.total : colorPerspective === 'black' ? node.black / node.total : (node.white + node.black) / (node.total * 2);
      allLines.push({ moves: [...moves], sans: [...sans], frequency: node.total, opponentWinPct: winPct, lastPlayed: node.lastPlayed ?? '', isRecent: node.lastPlayed ? (now - new Date(node.lastPlayed).getTime()) <= 90 * 86400000 : false, isReliable: node.total >= 5 });
    } else {
      for (const child of node.children) walk(child, [...moves, child.uci], [...sans, child.san], depth + 1);
    }
  }
  for (const child of treeRoot.children) walk(child, [child.uci], [child.san], 1);
  const byFreq = (a: PrepLine, b: PrepLine) => b.frequency - a.frequency;
  return {
    likelyLines: [...allLines].sort(byFreq).slice(0, 10),
    strongLines: allLines.filter(l => l.isReliable && l.opponentWinPct > 0.6).sort(byFreq).slice(0, 8),
    weakLines: allLines.filter(l => l.isReliable && l.opponentWinPct < 0.3).sort(byFreq).slice(0, 8),
    freshLines: allLines.filter(l => l.isRecent).sort(byFreq).slice(0, 8),
    driftLines: allLines.filter(l => l.isReliable && (l.frequency / rootTotal) >= 0.05 && !l.isRecent).sort(byFreq).slice(0, 8),
  };
}

// ---------------------------------------------------------------------------
// Repertoire profile
// ---------------------------------------------------------------------------

export interface RepertoireProfile {
  distinctFirstMoves: number;
  distinctEcos: number;
  firstMoveEntropy: number;
  normalizedEntropy: number;
  topFirstMovePct: number;
  top3EcoPct: number;
  sampleSize: number;
  isSampleSmall: boolean;
}

export function computeRepertoireProfile(games: ResearchGame[], treeRoot: OpeningTreeNode | null, target: string): RepertoireProfile {
  const total = treeRoot?.total || 0;
  const firstMoves = treeRoot?.children || [];
  let entropy = 0, topFirstMovePct = 0;
  for (const child of firstMoves) {
    const p = child.total / (total || 1);
    entropy -= p * Math.log2(p || 1);
    if (p > topFirstMovePct) topFirstMovePct = p;
  }
  const ecoMap = new Map<string, number>(), tgt = target.toLowerCase();
  for (const g of games) {
    if (((g.white?.toLowerCase() === tgt) || (g.black?.toLowerCase() === tgt)) && g.eco) ecoMap.set(g.eco, (ecoMap.get(g.eco) ?? 0) + 1);
  }
  const top3Sum = Array.from(ecoMap.values()).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  return {
    distinctFirstMoves: firstMoves.length,
    distinctEcos: ecoMap.size,
    firstMoveEntropy: entropy,
    normalizedEntropy: firstMoves.length > 1 ? entropy / Math.log2(firstMoves.length) : 0,
    topFirstMovePct,
    top3EcoPct: total > 0 ? top3Sum / total : 0,
    sampleSize: total,
    isSampleSmall: total < 30,
  };
}

// ---------------------------------------------------------------------------
// Style Axis assembled view-model
// ---------------------------------------------------------------------------

export interface StyleAxisSignal { label: string; type: SignalType; confidence: ConfidenceLevel; caveat?: string; }
export interface StyleViewModel {
  style: StyleData; form: FormData; profile: RepertoireProfile; psychology: PsychologyModule; clock: ClockProfile;
  stalkerScore: number; archetype: Archetype; signals: StyleAxisSignal[]; overallConfidence: ConfidenceLevel;
}
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient';
export type SignalType = 'descriptive' | 'interpretive' | 'cautious';

export function computeStyleViewModel(games: ResearchGame[], treeRoot: OpeningTreeNode | null, target: string, summary: CollectionSummary): StyleViewModel {
  const style = computeStyle(games, treeRoot, target), form = computeFormData(games, target), profile = computeRepertoireProfile(games, treeRoot, target);
  const psychology = computePsychology(games, target), clock = computeClockProfile(games, target), archetype = determineArchetype(style, psychology, clock, profile);
  let stalkerScore = 50;
  if (summary.totalGames >= 5) {
    stalkerScore = (100 - psychology.mentalStability) / 5 + (clock.flagRate > 15 ? 15 : 5) + (psychology.tiltScore > 40 ? 15 : 5) + (psychology.resignationRate > 60 ? 10 : 0) + (1 - profile.normalizedEntropy) * 20;
  }
  const signals: StyleAxisSignal[] = [
    { label: `Archetype: ${archetype}`, type: 'descriptive', confidence: 'high' },
    { label: psychology.mentalStability < 50 ? 'Shows signs of tilt' : 'Mentally stable', type: 'interpretive', confidence: 'medium' }
  ];
  return { style, form, profile, psychology, clock, archetype, stalkerScore: Math.round(Math.min(100, Math.max(0, stalkerScore))), signals, overallConfidence: 'high' };
}

// ---------------------------------------------------------------------------
// Recommendations and Weaknesses
// ---------------------------------------------------------------------------

export interface OpeningRecommendation { line: PrepLine; reason: string; category: 'exploit-low-score' | 'exploit-drift' | 'exploit-fresh'; confidence: 'high' | 'medium' | 'low'; actionLabel: string; }
export function computeOpeningRecommendations(weakness: WeaknessModule, lines: PrepReportLines, totalGames: number): OpeningRecommendation[] {
  const recs: OpeningRecommendation[] = [];
  for (const entry of weakness.entries) {
    if (!entry.line.isReliable) continue;
    if (entry.category === 'low-score') recs.push({ line: entry.line, reason: `They score ${Math.round(entry.line.opponentWinPct * 100)}% here`, category: 'exploit-low-score', confidence: 'medium', actionLabel: `Prepare ${entry.line.sans.slice(0,4).join(' ')}` });
  }
  return recs;
}

export interface WeaknessEntry { line: PrepLine; category: 'low-score' | 'drift' | 'fresh-risk' | 'narrow'; label: string; }
export interface WeaknessModule { entries: WeaknessEntry[]; hasActionableWeaknesses: boolean; caveats: string[]; }
export function computeWeaknessModule(lines: PrepReportLines, totalGames: number): WeaknessModule {
  const entries: WeaknessEntry[] = [];
  for (const l of lines.weakLines.slice(0, 3)) {
    entries.push({ line: l, category: 'low-score', label: 'Low scoring' });
  }
  for (const l of lines.driftLines.slice(0, 3)) {
    if (entries.some(e => e.line.moves.join() === l.moves.join())) continue;
    entries.push({ line: l, category: 'drift', label: 'Stale line' });
  }
  const freshRisk = lines.freshLines.filter(l => !l.isReliable);
  for (const l of freshRisk.slice(0, 2)) {
    if (entries.some(e => e.line.moves.join() === l.moves.join())) continue;
    entries.push({ line: l, category: 'fresh-risk', label: 'Newly tried' });
  }
  const categoryOrder: Record<string, number> = { 'low-score': 0, 'drift': 1, 'fresh-risk': 2, 'narrow': 3 };
  entries.sort((a, b) => categoryOrder[a.category]! - categoryOrder[b.category]! || b.line.frequency - a.line.frequency);
  const reliable = entries.filter(e => e.line.isReliable);
  const caveats: string[] = [];
  if (totalGames < 30) caveats.push('Small sample \u2014 treat all signals as rough indicators.');
  if (entries.some(e => e.category === 'low-score')) caveats.push('Low-scoring lines reflect results only \u2014 no engine evaluation available.');
  if (entries.some(e => e.category === 'drift')) caveats.push('Stale lines may have been replaced by other prep, not forgotten.');
  return { entries: entries.slice(0, 6), hasActionableWeaknesses: reliable.length >= 2, caveats };
}

// ---------------------------------------------------------------------------
// Likely Line Module
// ---------------------------------------------------------------------------

function recencyBoostFor(lastPlayed: string | undefined, now: number): number {
  if (!lastPlayed) return 1;
  const MS_PER_DAY = 86_400_000;
  const ageMs = now - new Date(lastPlayed).getTime();
  if (ageMs <= 30  * MS_PER_DAY) return 2;
  if (ageMs <= 90  * MS_PER_DAY) return 1.5;
  if (ageMs <= 365 * MS_PER_DAY) return 1.2;
  return 1;
}

export interface LikelyLineEntry extends PrepLine { recencyBoost: number; recencyScore: number; }
export interface LikelyLineModule { lines: LikelyLineEntry[]; hasSufficientData: boolean; colorPerspective: 'white' | 'black'; }

export function computeLikelyLineModule(
  treeRoot: OpeningTreeNode | null,
  colorPerspective: 'white' | 'black',
  maxLines = 8,
  maxDepth = 8,
  recencyMode: 'recent' | 'all-time' = 'recent',
): LikelyLineModule {
  const empty = (): LikelyLineModule => ({ lines: [], hasSufficientData: false, colorPerspective });
  if (!treeRoot || treeRoot.children.length === 0) return empty();
  const now = Date.now();
  const rawLines = computePrepReportLines(treeRoot, colorPerspective, maxDepth).likelyLines;
  const entries: LikelyLineEntry[] = rawLines.map(l => {
    const boost = recencyMode === 'all-time' ? 1 : recencyBoostFor(l.lastPlayed, now);
    return { ...l, recencyBoost: boost, recencyScore: l.frequency * boost };
  });
  if (recencyMode === 'all-time') {
    entries.sort((a, b) => b.frequency - a.frequency);
  } else {
    entries.sort((a, b) => b.recencyScore - a.recencyScore);
  }
  const top = entries.slice(0, maxLines);
  const reliableCount = top.filter(l => l.isReliable).length;
  return { lines: top, hasSufficientData: reliableCount >= 3, colorPerspective };
}

// ---------------------------------------------------------------------------
// Prep Notes
// ---------------------------------------------------------------------------

export interface PrepNote { title: string; body: string; confidence: ConfidenceLevel; }

export function computePrepNotes(
  summary: CollectionSummary,
  profile: RepertoireProfile,
  lines: PrepReportLines,
): PrepNote[] {
  const notes: PrepNote[] = [];
  const total = summary.overall.total;
  if (total < 5) return notes;
  const topSpeed = summary.bySpeed[0];
  const winPct = total > 0 ? (summary.overall.wins / total * 100).toFixed(0) : '?';
  const dateSuffix = summary.dateRange
    ? ` (${summary.dateRange.earliest.slice(0, 7)} \u2013 ${summary.dateRange.latest.slice(0, 7)})`
    : '';
  notes.push({
    title: 'Overall scoring',
    body: `Opponent scores ${winPct}% across ${total} games in this collection${dateSuffix}.`,
    confidence: total >= 30 ? 'high' : total >= 10 ? 'medium' : 'low',
  });
  if (profile.sampleSize >= 10) {
    const breadthDesc = profile.normalizedEntropy < 0.35
      ? 'a narrow, predictable repertoire'
      : profile.normalizedEntropy < 0.65
        ? 'a moderately varied repertoire'
        : 'a broad, less predictable repertoire';
    const topMoveDesc = profile.topFirstMovePct > 0.7
      ? ` Most games (${(profile.topFirstMovePct * 100).toFixed(0)}%) start with the same first move.`
      : '';
    notes.push({
      title: 'Repertoire shape',
      body: `Opponent shows ${breadthDesc} across ${profile.distinctFirstMoves} distinct opening lines.${topMoveDesc}`,
      confidence: profile.sampleSize >= 30 ? 'high' : 'medium',
    });
  }
  if (topSpeed && topSpeed.wdl.total >= 5) {
    const speedName = topSpeed.timeClass.charAt(0).toUpperCase() + topSpeed.timeClass.slice(1);
    const speedWinPct = (topSpeed.wdl.wins / topSpeed.wdl.total * 100).toFixed(0);
    notes.push({
      title: `${speedName} games`,
      body: `Most games (${topSpeed.wdl.total}) are ${speedName.toLowerCase()}, where opponent scores ${speedWinPct}%.`,
      confidence: topSpeed.wdl.total >= 20 ? 'high' : topSpeed.wdl.total >= 10 ? 'medium' : 'low',
    });
  }
  const recent = summary.recency.last90;
  const recent30 = summary.recency.last30;
  if (recent >= 5) {
    const activityDesc = recent30 >= 5 ? 'active in the last month' : 'active in the last 3 months';
    notes.push({
      title: 'Recent activity',
      body: `${recent} games in the last 90 days \u2014 opponent is ${activityDesc}. Recent-form lines may differ from lifetime tendencies.`,
      confidence: recent >= 20 ? 'high' : 'medium',
    });
  } else if (recent === 0 && total >= 10) {
    notes.push({
      title: 'Stale collection',
      body: `No games in the last 90 days. This prep may not reflect the opponent's current repertoire.`,
      confidence: 'high',
    });
  }
  const topLine = lines.likelyLines[0];
  if (topLine && topLine.isReliable && topLine.frequency / total > 0.25) {
    const moveSan = topLine.sans.slice(0, 3).join(' ');
    const pct = (topLine.frequency / total * 100).toFixed(0);
    notes.push({
      title: 'Dominant line',
      body: `${pct}% of games follow ${moveSan}\u2026 \u2014 prepare this line deeply.`,
      confidence: topLine.frequency >= 20 ? 'high' : 'medium',
    });
  }
  return notes;
}

// ---------------------------------------------------------------------------
// Practice, Termination, Length
// ---------------------------------------------------------------------------

export interface PracticeMoveCandidate { uci: string; san: string; frequency: number; weight: number; }
export function buildPracticeCandidates(node: OpeningTreeNode | null): PracticeMoveCandidate[] {
  if (!node || node.children.length === 0) return [];
  const total = node.children.reduce((s, c) => s + c.total, 0);
  return node.children.map(c => ({ uci: c.uci, san: c.san, frequency: c.total, weight: c.total / (total || 1) }));
}

function pickWeightedMove(candidates: PracticeMoveCandidate[]): PracticeMoveCandidate | null {
  if (candidates.length === 0) return null;
  const r = Math.random();
  let acc = 0;
  for (const c of candidates) {
    acc += c.weight;
    if (r <= acc) return c;
  }
  return candidates[candidates.length - 1] ?? null;
}

function deriveConfidence(n: number): ConfidenceLevel {
  if (n >= 20) return 'high';
  if (n >= 10) return 'medium';
  if (n >= 5)  return 'low';
  return 'insufficient';
}

export type PracticeMoveOutcome = 'selected' | 'empty-handoff' | 'sparse-handoff';
export interface PracticeMoveResult {
  move: PracticeMoveCandidate | null;
  outcome: PracticeMoveOutcome;
  confidence: ConfidenceLevel;
  totalFrequency: number;
}
export type PracticeSelectionResult = PracticeMoveResult;

export function selectPracticeMove(node: OpeningTreeNode | null, minFreq = 2): PracticeMoveResult {
  const allCandidates = buildPracticeCandidates(node);
  const totalFrequency = allCandidates.reduce((sum, c) => sum + c.frequency, 0);
  const confidence = deriveConfidence(totalFrequency);
  if (allCandidates.length === 0) {
    return { move: null, outcome: 'empty-handoff', confidence: 'insufficient', totalFrequency: 0 };
  }
  const eligible = allCandidates.filter(c => c.frequency >= minFreq);
  if (eligible.length === 0) {
    return { move: null, outcome: 'sparse-handoff', confidence, totalFrequency };
  }
  const eligibleTotal = eligible.reduce((sum, c) => sum + c.frequency, 0);
  const normalized = eligible.map(c => ({ ...c, weight: c.frequency / eligibleTotal }));
  const move = pickWeightedMove(normalized);
  return { move, outcome: 'selected', confidence, totalFrequency };
}

export interface TerminationProfile { resignation: number; timeout: number; checkmate: number; drawAgreement: number; stalemate: number; other: number; total: number; }
export function computeTerminationProfile(games: readonly ResearchGame[], target: string): TerminationProfile {
  const tgt = target.toLowerCase(), res = { resignation: 0, timeout: 0, checkmate: 0, drawAgreement: 0, stalemate: 0, other: 0, total: 0 };
  for (const g of games) {
    if (g.white?.toLowerCase() !== tgt && g.black?.toLowerCase() !== tgt) continue;
    res.total++;
    const pgn = g.pgn.toLowerCase();
    if (pgn.includes('time forfeit')) res.timeout++;
    else if (pgn.includes('resign')) res.resignation++;
    else if (pgn.includes('checkmate')) res.checkmate++;
    else if (pgn.includes('draw')) res.drawAgreement++;
    else res.other++;
  }
  return res;
}

export interface GameLengthProfile { avgLength: number; avgWinLength: number; avgLossLength: number; shortGamePct: number; totalCounted: number; }
export function computeGameLengthProfile(games: readonly ResearchGame[], target: string): GameLengthProfile {
  const tgt = target.toLowerCase(), winL: number[] = [], lossL: number[] = [], allL: number[] = [];
  for (const g of games) {
    const isW = g.white?.toLowerCase() === tgt, isB = g.black?.toLowerCase() === tgt;
    if (!isW && !isB) continue;
    const moves = (g.pgn.match(/\d+\./g) || []).length;
    if (moves === 0) continue;
    allL.push(moves);
    if ((isW && g.result === '1-0') || (isB && g.result === '0-1')) winL.push(moves);
    else if ((isW && g.result === '0-1') || (isB && g.result === '1-0')) lossL.push(moves);
  }
  const avg = (a: number[]) => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0;
  return { avgLength: avg(allL), avgWinLength: avg(winL), avgLossLength: avg(lossL), shortGamePct: allL.length ? Math.round(allL.filter(l => l < 20).length / allL.length * 100) : 0, totalCounted: allL.length };
}
