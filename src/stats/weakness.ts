/**
 * Weakness aggregation engine.
 * Takes all GameSummary records and produces a ranked top-5 weakness list.
 *
 * Each detected weakness has:
 *  - severity + confidence (used for ranking and display)
 *  - description, recommendation, training action
 *  - sample size (for transparency)
 *
 * Minimum-sample gating: categories with insufficient data are omitted entirely
 * rather than shown with unreliable values.
 */

import type { GameSummary } from './types';

// ── Output types ──────────────────────────────────────────────────────────────

export type WeaknessSeverity   = 'critical' | 'significant' | 'moderate';
export type WeaknessConfidence = 'high' | 'medium' | 'low';

export interface WeaknessTrainingAction {
  type:    'puzzles' | 'retro' | 'openings' | 'review';
  target?: string;  // puzzle theme, opening name, etc.
  label:   string;  // "Train fork puzzles"
}

export interface DiagnosedWeakness {
  category:       string;
  severity:       WeaknessSeverity;
  confidence:     WeaknessConfidence;
  sampleSize:     number;
  description:    string;
  recommendation: string;
  trainingAction?: WeaknessTrainingAction;
}

// ── Severity ranking helpers ──────────────────────────────────────────────────

const SEVERITY_ORDER: Record<WeaknessSeverity, number>   = { critical: 0, significant: 1, moderate: 2 };
const CONFIDENCE_ORDER: Record<WeaknessConfidence, number> = { high: 0, medium: 1, low: 2 };

function severityFrom(value: number, thresholds: [number, number]): WeaknessSeverity {
  if (value >= thresholds[0]) return 'critical';
  if (value >= thresholds[1]) return 'significant';
  return 'moderate';
}

// ── Arithmetic helpers ────────────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

// ── Category detectors ────────────────────────────────────────────────────────

/**
 * High blunder rate: avg blunders/game > threshold (2.0 critical, 1.2 significant).
 * Minimum: 10 analyzed games.
 */
function detectHighBlunderRate(summaries: GameSummary[]): DiagnosedWeakness | null {
  if (summaries.length < 10) return null;
  const avg = mean(summaries.map(s => s.blunderCount));
  if (avg < 0.8) return null;
  const severity = severityFrom(avg, [2.0, 1.2]);
  const confidence: WeaknessConfidence = summaries.length >= 25 ? 'high' : summaries.length >= 15 ? 'medium' : 'low';
  return {
    category:       'High blunder rate',
    severity,
    confidence,
    sampleSize:     summaries.length,
    description:    `You blunder ${avg.toFixed(1)} times per game on average.`,
    recommendation: 'Slow down and double-check your moves before playing. Focus on tactics training.',
    trainingAction: { type: 'puzzles', target: 'hanging-piece', label: 'Train hanging pieces' },
  };
}

/**
 * Tactical blindness: avg missed moments/game > threshold.
 * Minimum: 10 games.
 */
function detectTacticalBlindness(summaries: GameSummary[]): DiagnosedWeakness | null {
  if (summaries.length < 10) return null;
  const avg = mean(summaries.map(s => s.missedMomentCount));
  if (avg < 1.0) return null;
  const severity = severityFrom(avg, [3.0, 1.8]);
  const confidence: WeaknessConfidence = summaries.length >= 25 ? 'high' : summaries.length >= 15 ? 'medium' : 'low';
  return {
    category:       'Tactical blindness',
    severity,
    confidence,
    sampleSize:     summaries.length,
    description:    `You miss ${avg.toFixed(1)} tactical opportunities per game on average.`,
    recommendation: 'Regular puzzle practice helps pattern recognition. Review games with "Learn from mistakes".',
    trainingAction: { type: 'retro', label: 'Review your mistakes' },
  };
}

/**
 * Conversion failure: win rate given a winning position < 60%.
 * Minimum: 5 games where hadWinningPosition was true.
 */
function detectConversionFailure(summaries: GameSummary[]): DiagnosedWeakness | null {
  const qualifying = summaries.filter(s => s.hadWinningPosition);
  if (qualifying.length < 5) return null;
  const convRate = rate(qualifying.filter(s => s.converted).length, qualifying.length);
  if (convRate >= 0.7) return null;
  const severity = severityFrom(1 - convRate, [0.6, 0.4]);
  const confidence: WeaknessConfidence = qualifying.length >= 15 ? 'high' : qualifying.length >= 8 ? 'medium' : 'low';
  return {
    category:       'Conversion failure',
    severity,
    confidence,
    sampleSize:     qualifying.length,
    description:    `You convert winning positions only ${Math.round(convRate * 100)}% of the time (${qualifying.length} chances).`,
    recommendation: 'Focus on technique when ahead. Study endgame fundamentals and avoid unnecessary complications.',
    trainingAction: { type: 'puzzles', target: 'endgame', label: 'Train endgame puzzles' },
  };
}

/**
 * Opening weakness: find openings significantly below user average accuracy.
 * Minimum: 5 games per opening, 10 total games.
 */
function detectOpeningWeakness(summaries: GameSummary[]): DiagnosedWeakness | null {
  if (summaries.length < 10) return null;
  const globalAvgAccuracy = mean(summaries.map(s => s.accuracy));

  // Group by opening name (use eco if opening is absent)
  const byOpening = new Map<string, GameSummary[]>();
  for (const s of summaries) {
    const key = s.opening || s.eco || 'Unknown opening';
    const group = byOpening.get(key) ?? [];
    group.push(s);
    byOpening.set(key, group);
  }

  let worstGap = 0;
  let worstOpening = '';
  let worstSample = 0;
  let worstAvg = 0;

  for (const [name, group] of byOpening) {
    if (group.length < 5) continue;
    const openingAvg = mean(group.map(s => s.accuracy));
    const gap = globalAvgAccuracy - openingAvg;
    if (gap > worstGap) {
      worstGap     = gap;
      worstOpening = name;
      worstSample  = group.length;
      worstAvg     = openingAvg;
    }
  }

  if (worstGap < 5) return null; // < 5 point gap is not significant
  const severity = severityFrom(worstGap, [15, 8]);
  const confidence: WeaknessConfidence = worstSample >= 12 ? 'high' : worstSample >= 7 ? 'medium' : 'low';
  return {
    category:       'Opening weakness',
    severity,
    confidence,
    sampleSize:     worstSample,
    description:    `Your accuracy in ${worstOpening} averages ${Math.round(worstAvg)}%, about ${Math.round(worstGap)} points below your overall average.`,
    recommendation: `Study ${worstOpening} theory and common plans to avoid early mistakes.`,
    trainingAction: { type: 'openings', target: worstOpening, label: `Research ${worstOpening}` },
  };
}

/**
 * Color asymmetry: accuracy gap > 8 points between white and black games.
 * Minimum: 15 games per color.
 */
function detectColorAsymmetry(summaries: GameSummary[]): DiagnosedWeakness | null {
  const white = summaries.filter(s => s.playerColor === 'white');
  const black = summaries.filter(s => s.playerColor === 'black');
  if (white.length < 15 || black.length < 15) return null;
  const whiteAvg = mean(white.map(s => s.accuracy));
  const blackAvg = mean(black.map(s => s.accuracy));
  const gap = Math.abs(whiteAvg - blackAvg);
  if (gap < 8) return null;
  const weakColor = whiteAvg < blackAvg ? 'White' : 'Black';
  const weakAvg   = whiteAvg < blackAvg ? whiteAvg : blackAvg;
  const severity  = severityFrom(gap, [15, 10]);
  const confidence: WeaknessConfidence = (white.length >= 25 && black.length >= 25) ? 'high' : 'medium';
  return {
    category:       'Color asymmetry',
    severity,
    confidence,
    sampleSize:     Math.min(white.length, black.length),
    description:    `${weakColor} accuracy averages ${Math.round(weakAvg)}% — ${Math.round(gap)} points below your other color.`,
    recommendation: `Spend more time studying ${weakColor.toLowerCase()} openings and typical middlegame plans.`,
    trainingAction: { type: 'openings', target: weakColor.toLowerCase(), label: `Study ${weakColor} openings` },
  };
}

/**
 * Time trouble: > 30% of blunders occur when clock < 30s remaining.
 * Minimum: 10 games with clock data.
 */
function detectTimeTrouble(summaries: GameSummary[]): DiagnosedWeakness | null {
  const withClock = summaries.filter(s => s.hasClockData && s.timeTroubleMoves !== undefined);
  if (withClock.length < 10) return null;
  const totalBlunders       = withClock.reduce((a, s) => a + s.blunderCount, 0);
  const totalTimeTrouble    = withClock.reduce((a, s) => a + (s.timeTroubleMoves ?? 0), 0);
  const totalMoves          = withClock.reduce((a, s) => a + s.totalMoves, 0);
  if (totalBlunders === 0 || totalTimeTrouble === 0) return null;
  const ttMoveFraction = rate(totalTimeTrouble, totalMoves);
  if (ttMoveFraction < 0.05) return null; // < 5% time-trouble moves, not a significant issue
  const severity  = severityFrom(ttMoveFraction, [0.20, 0.10]);
  const confidence: WeaknessConfidence = withClock.length >= 25 ? 'high' : withClock.length >= 15 ? 'medium' : 'low';
  return {
    category:       'Time trouble',
    severity,
    confidence,
    sampleSize:     withClock.length,
    description:    `${Math.round(ttMoveFraction * 100)}% of your moves are played with under 30 seconds remaining.`,
    recommendation: 'Manage your clock better in the middlegame. Avoid spending too long on single moves.',
    trainingAction: { type: 'puzzles', label: 'Speed puzzles for pattern recognition' },
  };
}

/**
 * Endgame collapse: games that reach move 30+ where late-game blunders are high.
 * Proxy: games where worstLossPly > 60 (move 30+) and worstLoss > 0.25.
 * Minimum: 10 games reaching move 30+.
 */
function detectEndgameCollapse(summaries: GameSummary[]): DiagnosedWeakness | null {
  const longGames = summaries.filter(s => s.totalMoves >= 30);
  if (longGames.length < 10) return null;
  const lateBlunders = longGames.filter(s => s.worstLossPly > 60 && s.worstLoss > 0.25);
  const rate_ = rate(lateBlunders.length, longGames.length);
  if (rate_ < 0.3) return null;
  const severity  = severityFrom(rate_, [0.6, 0.4]);
  const confidence: WeaknessConfidence = longGames.length >= 20 ? 'high' : longGames.length >= 12 ? 'medium' : 'low';
  return {
    category:       'Endgame collapse',
    severity,
    confidence,
    sampleSize:     longGames.length,
    description:    `${Math.round(rate_ * 100)}% of your long games contain a major error after move 30.`,
    recommendation: 'Practice endgame technique and stay alert in long games. Fatigue-induced errors are common here.',
    trainingAction: { type: 'puzzles', target: 'endgame', label: 'Train endgame puzzles' },
  };
}

/**
 * Early-game errors: blunders occurring predominantly in moves 1–15.
 * Proxy: avgAccuracy in games with low firstMovesAccuracy estimate.
 * Use: games where worstLossPly < 30 and worstLoss > 0.2.
 * Minimum: 10 games.
 */
function detectEarlyGameErrors(summaries: GameSummary[]): DiagnosedWeakness | null {
  if (summaries.length < 10) return null;
  const earlyMistakes = summaries.filter(s => s.worstLossPly > 0 && s.worstLossPly <= 30 && s.worstLoss > 0.2);
  const rate_ = rate(earlyMistakes.length, summaries.length);
  if (rate_ < 0.3) return null;
  const severity  = severityFrom(rate_, [0.5, 0.35]);
  const confidence: WeaknessConfidence = summaries.length >= 25 ? 'high' : summaries.length >= 15 ? 'medium' : 'low';
  return {
    category:       'Early-game errors',
    severity,
    confidence,
    sampleSize:     summaries.length,
    description:    `${Math.round(rate_ * 100)}% of your games contain a significant error in the first 15 moves.`,
    recommendation: 'Improve your opening preparation and understanding of common early-game patterns.',
    trainingAction: { type: 'openings', label: 'Research your openings' },
  };
}

// ── Main aggregation ──────────────────────────────────────────────────────────

/**
 * Run all weakness detectors against the provided summaries and return the
 * top 5 diagnosed weaknesses sorted by severity then confidence.
 *
 * Returns an empty list if fewer than 10 games are available.
 */
export function diagnoseWeaknesses(summaries: GameSummary[]): DiagnosedWeakness[] {
  if (summaries.length < 10) return [];

  const candidates: DiagnosedWeakness[] = [
    detectHighBlunderRate(summaries),
    detectTacticalBlindness(summaries),
    detectConversionFailure(summaries),
    detectOpeningWeakness(summaries),
    detectColorAsymmetry(summaries),
    detectTimeTrouble(summaries),
    detectEndgameCollapse(summaries),
    detectEarlyGameErrors(summaries),
  ].filter((w): w is DiagnosedWeakness => w !== null);

  // Sort: severity first (critical < significant < moderate), then confidence (high < medium < low)
  candidates.sort((a, b) => {
    const sv = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sv !== 0) return sv;
    return CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
  });

  return candidates.slice(0, 5);
}
