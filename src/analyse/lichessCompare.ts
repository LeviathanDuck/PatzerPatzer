








import { parseComment, parsePgn } from 'chessops/pgn';
import type { ChildNode, PgnNodeData } from 'chessops/pgn';
import { isMate as isChessopsMateEvaluation } from 'chessops/pgn';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops';

import { pgnToTree } from '../tree/pgn';
import { mainlineNodeList } from '../tree/ops';
import { evalWinChances } from '../engine/winchances';
import type { AuditSnapshot, AuditSnapshotRow, AuditSnapshotScore } from './auditSnapshot';

// ─────────────────────────────────────────────────────────────────────────────
// Castling UCI normalization
// ─────────────────────────────────────────────────────────────────────────────
//
// Empirically verified (not assumed) against this module's own fixture:
// `pgnToTree(scripts/fixtures/lichess-compare/nrmBGiQF.pgn)` produces `node.uci === 'e1h1'` and
// `'e8h8'` for the two `O-O` moves at ply 9/10 -- NOT the standard two-square king destination
// (`e1g1`/`e8g8`). Root cause: chessops' `parseSan` (chessops/src/san.ts) represents every castling
// move as `{ from: kingSquare, to: rookSquare }` (the Chess960 "king takes own rook" convention)
// regardless of variant, and `makeUci` echoes `from`+`to` verbatim. `tree/pgn.ts` builds every
// mainline node's `uci` via this exact path, so `AuditSnapshot.gameIdentity.uciSequence` (built by
// `auditSnapshot.ts` via the same `pgnToTree`) carries this same non-standard form. This module's
// own Lichess-side replay (`normalizeLichessJsonExport`/`normalizeLichessPgnExport`) goes through the
// same `pgnToTree` helper, so both sides need identical normalization before an identity/UCI
// comparison is meaningful -- comparing raw would still "work" (both sides consistently non-standard)
// but any `bestUci`/`variation` replay values sourced independently (Lichess `best` field, or this
// module's own SAN-from-FEN replay for the soft best-move check) use the ordinary standard-UCI
// convention, so those DO need normalizing into the same space.
//
// This is a different concern from `src/engine/positionContext.ts`'s `STOCKFISH_CASTLING_UCI` table
// (that one normalizes live Stockfish engine UCI output, a separate code path) -- duplicated here in
// miniature because this module must not import runtime code from `src/engine/`.
const CASTLING_UCI_ALIASES: Readonly<Record<string, string>> = {
  e1a1: 'e1c1',
  e1h1: 'e1g1',
  e8a8: 'e8c8',
  e8h8: 'e8g8',
};

export function normalizeCastlingUci(uci: string): string {
  return CASTLING_UCI_ALIASES[uci] ?? uci;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lichess normalized input types
// ─────────────────────────────────────────────────────────────────────────────

export type LichessScore = { cp: number } | { mate: number } | null;

export interface LichessRow {
  ply: number;
  score: LichessScore;
  bestUci?: string;
  variationSans?: string;
  judgmentName?: string;
}

export interface LichessNormalizedGame {
  uciSequence: string[];
  sanSequence: string[];
  rows: LichessRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Ply alignment (empirically derived -- see fixture evidence below)
// ─────────────────────────────────────────────────────────────────────────────
//
// Fixture: scripts/fixtures/lichess-compare/nrmBGiQF.{json,pgn} (49-ply game, ends in checkmate).
//
// Both Lichess export forms attach an eval (and, for JSON, an optional best/variation/judgment) to
// describe the position immediately AFTER a given move, and to critique the move actually played to
// reach it:
//   - JSON `analysis` is a 0-indexed array; `analysis[i]` corresponds to 1-indexed ply `i + 1`.
//   - PGN `[%eval ...]` comments are attached as trailing comments on the move token that produced
//     the evaluated position, i.e. the move at ply `p` carries the eval for the position after `p`.
//
// Evidence -- the mate-finish tail settles this conclusively. The JSON `analysis` array has exactly
// 48 entries for a 49-ply game:
//   analysis[45] (=> ply 46, SAN "Kh7")  = { mate: 6 }  <-> PGN "46... Kh7  { [%eval #6] }"
//   analysis[46] (=> ply 47, SAN "Qc2+") = { mate: 5 }  <-> PGN "47. Qc2+   { [%eval #5] }"
//   analysis[47] (=> ply 48, SAN "Kg8")  = { mate: 1 }  <-> PGN "47... Kg8  { [%eval #1] }"
// Ply 49 (SAN "Rf8#", the actual mate-delivering move) has NO analysis entry and NO `[%eval]`
// comment in either export form -- the PGN's final move token carries only `[%clk]`. This is
// consistent and unambiguous: the position immediately after the mating move needs no further
// evaluation, so both export forms stop one entry short of the full move list. This also rules out
// the alternative off-by-one reading (`analysis[i]` describing the position BEFORE ply `i + 1`),
// which would require a 49th entry to exist for the final mating move -- it does not.
//
// Consequence for this module: a Lichess row's `ply` is always `index + 1` for the JSON array, and
// the PGN walk below assigns `ply = index + 1` for the same reason (index 0 = ply 1's move token).
// Some games (like this fixture) will have exactly `plyCount - 1` Lichess rows; a snapshot ply with
// no matching Lichess row is reported as a missing-Lichess-eval coverage gap, not fabricated.

// ─────────────────────────────────────────────────────────────────────────────
// normalizeLichessJsonExport
// ─────────────────────────────────────────────────────────────────────────────

interface LichessJsonAnalysisEntry {
  eval?: number;
  mate?: number;
  best?: string;
  variation?: string;
  judgment?: { name?: string };
}

export function normalizeLichessJsonExport(data: unknown): LichessNormalizedGame {
  if (typeof data !== 'object' || data === null) {
    throw new Error('normalizeLichessJsonExport: expected a Lichess game export JSON object.');
  }
  const record = data as Record<string, unknown>;

  const moves = record.moves;
  if (typeof moves !== 'string' || moves.trim().length === 0) {
    throw new Error('normalizeLichessJsonExport: export JSON is missing a "moves" SAN movelist.');
  }

  const variant = record.variant;
  if (variant !== undefined && variant !== 'standard') {
    throw new Error(
      `normalizeLichessJsonExport: unsupported variant "${String(variant)}" (only "standard" is handled).`,
    );
  }

  const analysisRaw = record.analysis;
  const analysis: unknown[] = Array.isArray(analysisRaw) ? analysisRaw : [];





  const resultTag = deriveJsonResultTag(record);
  const syntheticPgn = `[Result "${resultTag}"]\n\n${moves} ${resultTag}`;

  const { uciSequence, sanSequence } = replayMainlineUciAndSan(syntheticPgn, 'normalizeLichessJsonExport');

  const rows: LichessRow[] = analysis.map((rawEntry, index) => {
    const entry: LichessJsonAnalysisEntry = typeof rawEntry === 'object' && rawEntry !== null ? rawEntry : {};
    const ply = index + 1;
    const score = jsonEntryScore(entry);
    const judgmentName =
      entry.judgment && typeof entry.judgment.name === 'string' ? entry.judgment.name : undefined;
    return {
      ply,
      score,
      ...(typeof entry.best === 'string' ? { bestUci: normalizeCastlingUci(entry.best) } : {}),
      ...(typeof entry.variation === 'string' ? { variationSans: entry.variation } : {}),
      ...(judgmentName !== undefined ? { judgmentName } : {}),
    };
  });

  return { uciSequence, sanSequence, rows };
}

function jsonEntryScore(entry: LichessJsonAnalysisEntry): LichessScore {
  if (typeof entry.mate === 'number') return { mate: entry.mate };
  if (typeof entry.eval === 'number') return { cp: entry.eval };
  return null;
}

function deriveJsonResultTag(record: Record<string, unknown>): string {
  if (record.winner === 'white') return '1-0';
  if (record.winner === 'black') return '0-1';
  if (record.status === 'draw') return '1/2-1/2';
  return '*';
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeLichessPgnExport
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeLichessPgnExport(pgn: string): LichessNormalizedGame {
  const { uciSequence, sanSequence } = replayMainlineUciAndSan(pgn, 'normalizeLichessPgnExport');

  const plyScores = extractPgnPlyEvals(pgn);
  if (plyScores.length !== uciSequence.length) {
    throw new Error(
      `normalizeLichessPgnExport: mainline replay produced ${uciSequence.length} plies but the raw ` +
        `PGN comment walk produced ${plyScores.length} -- move/comment structure diverged unexpectedly.`,
    );
  }

  const rows: LichessRow[] = [];
  plyScores.forEach((score, index) => {
    if (score === null) return; // no [%eval] comment for this ply -- omit, never fabricate.
    rows.push({ ply: index + 1, score });
  });

  return { uciSequence, sanSequence, rows };
}

// tree/pgn.ts's own `parseTreeComments` strips `[%eval ...]` out of a node's comment text (it only
// keeps %clk/%emt plus free text -- see parseComment usage there), so eval data is not reachable
// through `pgnToTree`'s `TreeNode` output. chessops/pgn's own `parseComment` DOES parse `[%eval]`
// into an `evaluation` field; this walks the same `parsePgn()` mainline chain (`Node.mainlineNodes()`,
// the same children[0]-first convention `pgnGameToTree` uses) purely to recover that per-move
// evaluation. This reuses chessops `parsePgn`/`parseComment` directly -- the same library tree/pgn.ts
// is built on -- rather than writing a new PGN parser.
function extractPgnPlyEvals(pgn: string): LichessScore[] {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error('normalizeLichessPgnExport: no game found in PGN.');

  const evals: LichessScore[] = [];
  for (const child of game.moves.mainlineNodes()) {
    evals.push(pgnNodeEval(child));
  }
  return evals;
}

function pgnNodeEval(child: ChildNode<PgnNodeData>): LichessScore {
  const comments = [...(child.data.startingComments ?? []), ...(child.data.comments ?? [])];
  for (const raw of comments) {
    const { evaluation } = parseComment(raw);
    if (!evaluation) continue;
    return isChessopsMateEvaluation(evaluation) ? { mate: evaluation.mate } : { cp: Math.round(evaluation.pawns * 100) };
  }
  return null;
}

function replayMainlineUciAndSan(pgn: string, callerLabel: string): { uciSequence: string[]; sanSequence: string[] } {
  const root = pgnToTree(pgn);
  const mainline = mainlineNodeList(root);
  const uciSequence: string[] = [];
  const sanSequence: string[] = [];
  for (let index = 1; index < mainline.length; index++) {
    const node = mainline[index]!;
    if (!node.san || !node.uci) {
      throw new Error(`${callerLabel}: mainline node at ply ${node.ply} is missing SAN or UCI.`);
    }
    uciSequence.push(normalizeCastlingUci(node.uci));
    sanSequence.push(node.san);
  }
  return { uciSequence, sanSequence };
}

// Replays up to `maxTokens` SAN moves of a Lichess `variation` string from a given FEN, returning
// their UCI (castling-normalized). Used only for the "soft" best-move heuristic below. Reuses
// chessops SAN/FEN modules directly (the same primitives tree/pgn.ts is built on) for a short,
// out-of-tree replay -- not a new PGN parser, and not reachable via pgnToTree (which expects a full
// PGN document, not a loose SAN fragment starting from an arbitrary FEN).
function variationUciCandidates(fenBefore: string, variationSans: string | undefined, maxTokens: number): string[] {
  if (!variationSans) return [];
  const tokens = variationSans.trim().split(/\s+/).filter(Boolean).slice(0, maxTokens);
  if (tokens.length === 0) return [];

  const setup = parseFen(fenBefore);
  if (!setup.isOk) return [];
  const positionResult = Chess.fromSetup(setup.value);
  if (!positionResult.isOk) return [];
  const pos = positionResult.value;

  const candidates: string[] = [];
  for (const token of tokens) {
    const move = parseSan(pos, token);
    if (!move) break;
    candidates.push(normalizeCastlingUci(makeUci(move)));
    pos.play(move);
  }
  return candidates;
}

// ─────────────────────────────────────────────────────────────────────────────
// Named, tunable threshold constants (Honesty invariant: no magic numbers)
// ─────────────────────────────────────────────────────────────────────────────

/** A cp-vs-cp row counts as a "direction disagreement" only when both sides exceed this magnitude. */
export const DIRECTION_DISAGREEMENT_MIN_ABS_CP = 50;

/** "Soft" best-move agreement checks the Patzer best against this many leading Lichess variation plies. */
export const SOFT_BEST_MOVE_VARIATION_WINDOW = 2;

/**
 * One-ply offset detection (BUG-2026-06-29-019 detector): a shifted alignment must beat the
 * 0-shift mean |Δwin%| by more than this many percentage points (0-100 scale) before the report
 * flags `offset-suspected`.
 */
export const OFFSET_DETECTION_MARGIN_WIN_PCT = 3;

/** Minimum overlapping ply pairs required before a shift's alignment score is considered meaningful. */
export const OFFSET_DETECTION_MIN_OVERLAP_ROWS = 5;

/** Below this fraction of plies having both a Patzer and a Lichess eval, the verdict is `insufficient-data`. */
export const INSUFFICIENT_DATA_MIN_COVERAGE_RATIO = 0.5;

/** Above this median |Δwin%| (percentage points), and with no offset suspected, the verdict is `diverged`. */
export const DIVERGED_MEDIAN_ABS_DELTA_WIN_PCT = 8;

/** Default cap on the number of rows included in the report's top-divergent-rows list. */
export const TOP_DIVERGENT_ROWS_LIMIT = 10;

// ─────────────────────────────────────────────────────────────────────────────
// ComparisonReport
// ─────────────────────────────────────────────────────────────────────────────

export type ComparisonVerdict =
  | 'aligned'
  | 'diverged'
  | 'offset-suspected'
  | 'identity-mismatch'
  | 'insufficient-data';

export interface ComparisonReport {
  verdict: ComparisonVerdict;
  gameId: string;
  identity: {
    matches: boolean;
    firstDivergentPly?: number;
  };
  coverage: {
    totalPlies: number;
    rowsWithBothEvals: number;
    rowsMissingPatzerEval: number;
    rowsMissingLichessEval: number;
    coverageRatio: number;
  };
  evalAgreement: {
    cpVsCpRowCount: number;
    medianAbsDeltaCp?: number;
    p90AbsDeltaCp?: number;
    winChanceRowCount: number;
    medianAbsDeltaWinPct?: number;
  };
  directionDisagreement: {
    count: number;
    plies: number[];
  };
  mateAgreement: {
    mateVsMateTotal: number;
    mateVsMateAgree: number;
    mateVsCpConflicts: number;
  };
  bestMoveAgreement: {
    consideredRowCount: number;
    exactMatches: number;
    softMatches: number;
    exactRate?: number;
    softRate?: number;
  };
  judgmentAgreement: {
    matrix: Record<string, Record<string, number>>;
  };
  offsetDetection: {
    shiftScores: Array<{ shift: -1 | 0 | 1; meanAbsDeltaWinPct: number | null; overlapCount: number }>;
    bestShift: -1 | 0 | 1;
    suspected: boolean;
  };
  topDivergentRows: Array<{
    ply: number;
    san: string;
    patzerScore: PatzerScore;
    lichessScore: LichessScore;
    patzerBest?: string;
    lichessBest?: string;
    patzerLabel?: string;
    lichessJudgment?: string;
    absDeltaWinPct?: number;
  }>;
  evidence: {
    patzerUciSequenceSha256: string;
    patzerFenAfterSequenceSha256: string;
    lichessRowsSha256: string;
  };
  confidence: {
    patzerEngineName?: string;
    patzerEngineModel?: string;
    patzerReviewDepth?: number;
    lichessEngine: string;
    exactComparison: string[];
    heuristicComparison: string[];
  };
}

export interface CompareOptions {
  topDivergentRowLimit?: number;
}

type PatzerScore = { cp: number } | { mate: number } | null;

function patzerScoreForRow(row: AuditSnapshotRow): PatzerScore {
  return scoreFromAuditSnapshotScore(row.patzer.evalAfter);
}

function scoreFromAuditSnapshotScore(score: AuditSnapshotScore | undefined): PatzerScore {
  if (!score) return null;
  if (score.kind === 'cp') return { cp: score.cp };
  if (score.kind === 'mate') return { mate: score.mate };
  return null;
}

function scoreCp(score: PatzerScore | LichessScore): number | undefined {
  return score && 'cp' in score ? score.cp : undefined;
}

function scoreMate(score: PatzerScore | LichessScore): number | undefined {
  return score && 'mate' in score ? score.mate : undefined;
}

function scoreWinChance(score: PatzerScore | LichessScore): number | undefined {
  if (!score) return undefined;
  return evalWinChances('cp' in score ? { cp: score.cp } : { mate: score.mate });
}

/** Win chance (native -1..1 scale from evalWinChances) rendered as 0-100 percentage points. */
function winPct(score: PatzerScore | LichessScore): number | undefined {
  const chance = scoreWinChance(score);
  return chance === undefined ? undefined : chance * 100;
}

export async function compareSnapshotToLichess(
  snapshot: AuditSnapshot,
  lichess: LichessNormalizedGame,
  options?: CompareOptions,
): Promise<ComparisonReport> {
  const topDivergentRowLimit = options?.topDivergentRowLimit ?? TOP_DIVERGENT_ROWS_LIMIT;

  const patzerUci = snapshot.gameIdentity.uciSequence.map(normalizeCastlingUci);
  const lichessUci = lichess.uciSequence;
  const identity = compareIdentity(patzerUci, lichessUci);

  const lichessRowByPly = new Map<number, LichessRow>();
  for (const row of lichess.rows) lichessRowByPly.set(row.ply, row);

  const totalPlies = snapshot.gameIdentity.plyCount;
  let rowsWithBothEvals = 0;
  let rowsMissingPatzerEval = 0;
  let rowsMissingLichessEval = 0;

  const cpDeltas: number[] = [];
  const winPctDeltas: number[] = [];
  const directionPlies: number[] = [];
  let mateVsMateTotal = 0;
  let mateVsMateAgree = 0;
  let mateVsCpConflicts = 0;

  let bestConsideredRowCount = 0;
  let bestExactMatches = 0;
  let bestSoftMatches = 0;

  const judgmentMatrix: Record<string, Record<string, number>> = {};

  const patzerWinPctByPly = new Map<number, number>();
  const lichessWinPctByPly = new Map<number, number>();

  const divergentCandidates: ComparisonReport['topDivergentRows'] = [];

  for (const row of snapshot.rows) {
    const ply = row.ply;
    const patzerScore = patzerScoreForRow(row);
    const lichessRow = lichessRowByPly.get(ply);
    const lichessScore: LichessScore = lichessRow ? lichessRow.score : null;

    const hasPatzer = patzerScore !== null;
    const hasLichess = lichessScore !== null;

    if (hasPatzer && hasLichess) rowsWithBothEvals++;
    else if (!hasPatzer && hasLichess) rowsMissingPatzerEval++;
    else if (hasPatzer && !hasLichess) rowsMissingLichessEval++;

    const patzerWc = winPct(patzerScore);
    const lichessWc = winPct(lichessScore);
    if (patzerWc !== undefined) patzerWinPctByPly.set(ply, patzerWc);
    if (lichessWc !== undefined) lichessWinPctByPly.set(ply, lichessWc);

    let absDeltaWinPct: number | undefined;
    if (hasPatzer && hasLichess) {
      const patzerCp = scoreCp(patzerScore);
      const lichessCp = scoreCp(lichessScore);
      const patzerMate = scoreMate(patzerScore);
      const lichessMate = scoreMate(lichessScore);

      if (patzerCp !== undefined && lichessCp !== undefined) {
        cpDeltas.push(Math.abs(patzerCp - lichessCp));
        if (
          Math.sign(patzerCp) !== Math.sign(lichessCp) &&
          Math.abs(patzerCp) > DIRECTION_DISAGREEMENT_MIN_ABS_CP &&
          Math.abs(lichessCp) > DIRECTION_DISAGREEMENT_MIN_ABS_CP
        ) {
          directionPlies.push(ply);
        }
      } else if (patzerMate !== undefined && lichessMate !== undefined) {
        mateVsMateTotal++;
        if (Math.sign(patzerMate) === Math.sign(lichessMate)) mateVsMateAgree++;
      } else {
        // exactly one side is mate, the other cp -- categorical conflict, not a numeric delta.
        mateVsCpConflicts++;
      }

      if (patzerWc !== undefined && lichessWc !== undefined) {
        absDeltaWinPct = Math.abs(patzerWc - lichessWc);
        winPctDeltas.push(absDeltaWinPct);
      }
    }

    // Best-move agreement: only rows where both sides supply a best move.
    const patzerBest = row.patzer.raw?.best;
    const lichessBest = lichessRow?.bestUci;
    if (patzerBest && lichessBest) {
      bestConsideredRowCount++;
      const normalizedPatzerBest = normalizeCastlingUci(patzerBest);
      const candidates = variationUciCandidates(row.fenBefore, lichessRow?.variationSans, SOFT_BEST_MOVE_VARIATION_WINDOW);
      if (candidates[0] === normalizedPatzerBest) bestExactMatches++;
      if (candidates.includes(normalizedPatzerBest)) bestSoftMatches++;
    }

    // Judgment agreement: only rows where Patzer has a determinate stored label AND Lichess has a
    // row (i.e. Lichess actually scored this ply, so "none" is a meaningful judgment outcome there).
    if (row.patzer.hasStoredNode && row.patzer.label && row.patzer.label !== 'unknown' && lichessRow) {
      const lichessJudgment = (lichessRow.judgmentName ?? 'none').toLowerCase();
      const patzerLabel = row.patzer.label;
      judgmentMatrix[lichessJudgment] ??= {};
      judgmentMatrix[lichessJudgment]![patzerLabel] = (judgmentMatrix[lichessJudgment]![patzerLabel] ?? 0) + 1;
    }

    divergentCandidates.push({
      ply,
      san: row.san,
      patzerScore,
      lichessScore,
      ...(patzerBest !== undefined ? { patzerBest } : {}),
      ...(lichessBest !== undefined ? { lichessBest } : {}),
      ...(row.patzer.label !== undefined ? { patzerLabel: row.patzer.label } : {}),
      ...(lichessRow?.judgmentName !== undefined ? { lichessJudgment: lichessRow.judgmentName } : {}),
      ...(absDeltaWinPct !== undefined ? { absDeltaWinPct } : {}),
    });
  }

  const topDivergentRows = divergentCandidates
    .filter(row => row.absDeltaWinPct !== undefined)
    .sort((a, b) => (b.absDeltaWinPct ?? 0) - (a.absDeltaWinPct ?? 0))
    .slice(0, topDivergentRowLimit);

  const offsetDetection = detectOnePlyOffset(patzerWinPctByPly, lichessWinPctByPly);

  const coverageRatio = totalPlies > 0 ? rowsWithBothEvals / totalPlies : 0;

  const evalAgreement: ComparisonReport['evalAgreement'] = {
    cpVsCpRowCount: cpDeltas.length,
    winChanceRowCount: winPctDeltas.length,
    ...(cpDeltas.length > 0
      ? { medianAbsDeltaCp: median(cpDeltas), p90AbsDeltaCp: percentile(cpDeltas, 0.9) }
      : {}),
    ...(winPctDeltas.length > 0 ? { medianAbsDeltaWinPct: median(winPctDeltas) } : {}),
  };

  const bestMoveAgreement: ComparisonReport['bestMoveAgreement'] = {
    consideredRowCount: bestConsideredRowCount,
    exactMatches: bestExactMatches,
    softMatches: bestSoftMatches,
    ...(bestConsideredRowCount > 0
      ? {
          exactRate: bestExactMatches / bestConsideredRowCount,
          softRate: bestSoftMatches / bestConsideredRowCount,
        }
      : {}),
  };

  // Verdict priority (documented decision -- the prompt mandates offset-suspected must override
  // aligned/diverged, but does not fix its priority relative to insufficient-data; this module
  // treats a confident insufficient-data signal as taking precedence, since a shift-alignment score
  // computed over too little overlapping data is not trustworthy either):
  //   identity-mismatch > insufficient-data > offset-suspected > diverged > aligned
  let verdict: ComparisonVerdict;
  if (!identity.matches) {
    verdict = 'identity-mismatch';
  } else if (coverageRatio < INSUFFICIENT_DATA_MIN_COVERAGE_RATIO) {
    verdict = 'insufficient-data';
  } else if (offsetDetection.suspected) {
    verdict = 'offset-suspected';
  } else if (
    evalAgreement.medianAbsDeltaWinPct !== undefined &&
    evalAgreement.medianAbsDeltaWinPct > DIVERGED_MEDIAN_ABS_DELTA_WIN_PCT
  ) {
    verdict = 'diverged';
  } else {
    verdict = 'aligned';
  }

  const lichessRowsSha256 = await sha256Hex(JSON.stringify(lichess.rows));

  return {
    verdict,
    gameId: snapshot.gameId,
    identity,
    coverage: {
      totalPlies,
      rowsWithBothEvals,
      rowsMissingPatzerEval,
      rowsMissingLichessEval,
      coverageRatio,
    },
    evalAgreement,
    directionDisagreement: {
      count: directionPlies.length,
      plies: directionPlies,
    },
    mateAgreement: {
      mateVsMateTotal,
      mateVsMateAgree,
      mateVsCpConflicts,
    },
    bestMoveAgreement,
    judgmentAgreement: { matrix: judgmentMatrix },
    offsetDetection,
    topDivergentRows,
    evidence: {
      patzerUciSequenceSha256: snapshot.gameIdentity.uciSequenceSha256,
      patzerFenAfterSequenceSha256: snapshot.gameIdentity.fenAfterSequenceSha256,
      lichessRowsSha256,
    },
    confidence: {
      ...(snapshot.review?.engineName !== undefined ? { patzerEngineName: snapshot.review.engineName } : {}),
      ...(snapshot.review?.engineModel !== undefined ? { patzerEngineModel: snapshot.review.engineModel } : {}),
      ...(snapshot.review?.reviewDepth !== undefined ? { patzerReviewDepth: snapshot.review.reviewDepth } : {}),
      lichessEngine: 'Lichess server analysis (fishnet Stockfish; depth/nodes not exported)',
      exactComparison: [
        'movelist identity (castling-normalized UCI sequence)',
        'row/ply alignment',
        'score orientation (white-perspective, no side-to-move flip)',
        'mate-vs-cp classification',
        'best-move exact UCI equality',
        'one-ply offset detection',
      ],
      heuristicComparison: [
        'eval magnitude agreement (|Δcp|, |Δwin%|) -- engine version/depth/movetime differ on both sides',
        'best-move soft agreement window',
        'judgment/label boundary agreement -- classification thresholds differ from Lichess internals',
        'accuracy/summary-level comparisons, if ever added -- not computed by this module',
      ],
    },
  };
}

function compareIdentity(
  patzerUci: readonly string[],
  lichessUci: readonly string[],
): ComparisonReport['identity'] {
  const len = Math.min(patzerUci.length, lichessUci.length);
  for (let i = 0; i < len; i++) {
    if (patzerUci[i] !== lichessUci[i]) {
      return { matches: false, firstDivergentPly: i + 1 };
    }
  }
  if (patzerUci.length !== lichessUci.length) {
    return { matches: false, firstDivergentPly: len + 1 };
  }
  return { matches: true };
}

function detectOnePlyOffset(
  patzerWinPctByPly: Map<number, number>,
  lichessWinPctByPly: Map<number, number>,
): ComparisonReport['offsetDetection'] {
  const shifts: Array<-1 | 0 | 1> = [-1, 0, 1];
  const shiftScores = shifts.map(shift => {
    let sum = 0;
    let n = 0;
    for (const [ply, patzerValue] of patzerWinPctByPly) {
      const lichessValue = lichessWinPctByPly.get(ply + shift);
      if (lichessValue === undefined) continue;
      sum += Math.abs(patzerValue - lichessValue);
      n++;
    }
    const meanAbsDeltaWinPct = n >= OFFSET_DETECTION_MIN_OVERLAP_ROWS ? sum / n : null;
    return { shift, meanAbsDeltaWinPct, overlapCount: n };
  });

  const zero = shiftScores.find(s => s.shift === 0)!;
  let best = zero;
  for (const candidate of shiftScores) {
    if (candidate.meanAbsDeltaWinPct === null) continue;
    if (best.meanAbsDeltaWinPct === null || candidate.meanAbsDeltaWinPct < best.meanAbsDeltaWinPct) {
      best = candidate;
    }
  }

  const suspected =
    best.shift !== 0 &&
    best.meanAbsDeltaWinPct !== null &&
    zero.meanAbsDeltaWinPct !== null &&
    zero.meanAbsDeltaWinPct - best.meanAbsDeltaWinPct > OFFSET_DETECTION_MARGIN_WIN_PCT;

  return { shiftScores, bestShift: best.shift, suspected };
}

function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[index]!;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown rendering
// ─────────────────────────────────────────────────────────────────────────────

export function renderComparisonReportMarkdown(report: ComparisonReport): string {
  const lines: string[] = [];
  lines.push(`# Lichess comparison report -- ${report.gameId}`);
  lines.push('');
  lines.push(`**Verdict: ${report.verdict}**`);
  lines.push('');

  lines.push('## Identity');
  lines.push(`- movelist match: ${report.identity.matches ? 'yes' : 'NO'}`);
  if (report.identity.firstDivergentPly !== undefined) {
    lines.push(`- first divergent ply: ${report.identity.firstDivergentPly}`);
  }
  lines.push('');

  lines.push('## Coverage');
  lines.push(`- total plies: ${report.coverage.totalPlies}`);
  lines.push(`- rows with both evals: ${report.coverage.rowsWithBothEvals}`);
  lines.push(`- rows missing Patzer eval: ${report.coverage.rowsMissingPatzerEval}`);
  lines.push(`- rows missing Lichess eval: ${report.coverage.rowsMissingLichessEval}`);
  lines.push(`- coverage ratio: ${report.coverage.coverageRatio.toFixed(3)}`);
  lines.push('');

  lines.push('## Eval agreement');
  lines.push(`- cp-vs-cp rows: ${report.evalAgreement.cpVsCpRowCount}`);
  if (report.evalAgreement.medianAbsDeltaCp !== undefined) {
    lines.push(`- median |Δcp|: ${report.evalAgreement.medianAbsDeltaCp}`);
    lines.push(`- p90 |Δcp|: ${report.evalAgreement.p90AbsDeltaCp}`);
  }
  if (report.evalAgreement.medianAbsDeltaWinPct !== undefined) {
    lines.push(`- median |Δwin%|: ${report.evalAgreement.medianAbsDeltaWinPct.toFixed(2)}`);
  }
  lines.push('');

  lines.push('## Direction disagreements');
  lines.push(`- count: ${report.directionDisagreement.count}`);
  if (report.directionDisagreement.plies.length > 0) {
    lines.push(`- plies: ${report.directionDisagreement.plies.join(', ')}`);
  }
  lines.push('');

  lines.push('## Mate agreement');
  lines.push(`- mate-vs-mate agree: ${report.mateAgreement.mateVsMateAgree} / ${report.mateAgreement.mateVsMateTotal}`);
  lines.push(`- mate-vs-cp conflicts: ${report.mateAgreement.mateVsCpConflicts}`);
  lines.push('');

  lines.push('## Best-move agreement');
  lines.push(`- considered rows: ${report.bestMoveAgreement.consideredRowCount}`);
  if (report.bestMoveAgreement.exactRate !== undefined) {
    lines.push(`- exact rate: ${(report.bestMoveAgreement.exactRate * 100).toFixed(1)}%`);
    lines.push(`- soft rate: ${(report.bestMoveAgreement.softRate! * 100).toFixed(1)}%`);
  }
  lines.push('');

  lines.push('## Judgment agreement (Lichess judgment -> Patzer label counts)');
  const judgmentKeys = Object.keys(report.judgmentAgreement.matrix);
  if (judgmentKeys.length === 0) {
    lines.push('- no comparable rows');
  } else {
    for (const lichessJudgment of judgmentKeys) {
      const row = report.judgmentAgreement.matrix[lichessJudgment]!;
      const parts = Object.entries(row).map(([label, count]) => `${label}: ${count}`);
      lines.push(`- ${lichessJudgment} -> ${parts.join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## One-ply offset detection');
  for (const s of report.offsetDetection.shiftScores) {
    lines.push(
      `- shift ${s.shift}: mean |Δwin%| = ${s.meanAbsDeltaWinPct === null ? 'n/a' : s.meanAbsDeltaWinPct.toFixed(2)} (n=${s.overlapCount})`,
    );
  }
  lines.push(`- best shift: ${report.offsetDetection.bestShift}`);
  lines.push(`- offset suspected: ${report.offsetDetection.suspected ? 'YES' : 'no'}`);
  lines.push('');

  lines.push('## Top divergent rows');
  if (report.topDivergentRows.length === 0) {
    lines.push('- none');
  } else {
    for (const row of report.topDivergentRows) {
      lines.push(
        `- ply ${row.ply} (${row.san}): patzer=${formatScore(row.patzerScore)} lichess=${formatScore(row.lichessScore)} ` +
          `|Δwin%|=${row.absDeltaWinPct?.toFixed(2) ?? 'n/a'} patzerBest=${row.patzerBest ?? '-'} ` +
          `lichessBest=${row.lichessBest ?? '-'} patzerLabel=${row.patzerLabel ?? '-'} lichessJudgment=${row.lichessJudgment ?? '-'}`,
      );
    }
  }
  lines.push('');

  lines.push('## Evidence');
  lines.push(`- Patzer UCI sequence SHA-256: ${report.evidence.patzerUciSequenceSha256}`);
  lines.push(`- Patzer FEN-after sequence SHA-256: ${report.evidence.patzerFenAfterSequenceSha256}`);
  lines.push(`- Lichess rows SHA-256: ${report.evidence.lichessRowsSha256}`);
  lines.push('');

  lines.push('## Confidence disclosure');
  lines.push(`- Patzer engine: ${report.confidence.patzerEngineName ?? 'unknown'} (${report.confidence.patzerEngineModel ?? 'unknown'})`);
  lines.push(`- Patzer review depth: ${report.confidence.patzerReviewDepth ?? 'unknown'}`);
  lines.push(`- Lichess engine: ${report.confidence.lichessEngine}`);
  lines.push('- exact comparisons: ' + report.confidence.exactComparison.join('; '));
  lines.push('- heuristic comparisons (never claim exact parity): ' + report.confidence.heuristicComparison.join('; '));
  lines.push('');

  return lines.join('\n');
}

function formatScore(score: PatzerScore | LichessScore): string {
  if (!score) return 'none';
  if ('mate' in score) return `#${score.mate}`;
  return `${score.cp}cp`;
}
