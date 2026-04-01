// GameSummary extraction from analyzed game data.
// Called after batch analysis completes and for backfill of previously analyzed games.

import { classifyLoss, evalWinChances } from '../engine/winchances';
import { detectMissedMoments } from '../engine/tactics';
import type { MissedMoment } from '../engine/tactics';
import type { ImportedGame } from '../import/types';
import type { TreeNode } from '../tree/types';
import { pgnToTree } from '../tree/pgn';
import { mainlineNodeList } from '../tree/ops';
import {
  getGameSummary, listGameSummaries, loadAnalysisFromIdb, saveGameSummary,
} from '../idb/index';
import type { GameSummary } from './types';

// Structural subset of eval cache / StoredNodeEntry used here.
type EvalEntry = {
  cp?:    number;
  mate?:  number;
  loss?:  number;
  best?:  string;
  label?: 'inaccuracy' | 'mistake' | 'blunder';
};

/**
 * Extract a GameSummary from a completed analysis.
 *
 * @param game          - ImportedGame metadata (ratings, result, opening, etc.)
 * @param mainline      - ordered tree nodes from root to last move
 * @param getEval       - eval lookup by tree path; works for both live cache and StoredAnalysis.nodes
 * @param userColor     - player whose moves are analysed from (non-null required)
 * @param missedMoments - already-detected missed tactical moments for this game
 * @param depth         - analysis depth used by the engine
 */
export function extractGameSummary(
  game:          ImportedGame,
  mainline:      readonly TreeNode[],
  getEval:       (path: string) => EvalEntry | undefined,
  userColor:     'white' | 'black',
  missedMoments: MissedMoment[],
  depth:         number,
): GameSummary {
  const isWhitePlayer = userColor === 'white';

  let blunderCount    = 0;
  let mistakeCount    = 0;
  let inaccuracyCount = 0;
  let goodMoveCount   = 0;
  let totalMoves      = 0;
  let worstLoss       = 0;
  let worstLossPly    = 0;

  // Sustained win-chance tracking (3+ consecutive user moves)
  let consecutiveAbove70 = 0;
  let hadWinningPosition = false;
  let consecutiveBelow30 = 0;
  let hadLosingPosition  = false;

  // Per-move accuracy accumulator (mirrors evalView.ts computeAnalysisSummary)
  const accs: number[] = [];

  // Clock data
  const clockValues: number[] = []; // centiseconds remaining at each user move
  let prevClockCs: number | undefined;
  let totalTimeCs = 0;
  let timeTroubleMoves = 0;

  let path = '';
  for (let i = 1; i < mainline.length; i++) {
    const node       = mainline[i]!;
    path            += node.id;
    const parentPath = path.slice(0, -2);

    const isWhiteMove = node.ply % 2 === 1;
    const isUserMove  = isWhitePlayer ? isWhiteMove : !isWhiteMove;

    if (!isUserMove) {
      // Reset streaks on opponent moves
      consecutiveAbove70 = 0;
      consecutiveBelow30 = 0;
      prevClockCs = undefined;
      continue;
    }

    totalMoves++;

    const nodeEval   = getEval(path);
    const parentEval = getEval(parentPath);

    // ── Move classification ───────────────────────────────────────────────
    if (nodeEval && parentEval) {
      const playedBest = node.uci !== undefined && node.uci === parentEval.best;
      if (!playedBest) {
        const label = nodeEval.label ?? (nodeEval.loss !== undefined ? classifyLoss(nodeEval.loss) : null);
        if (label === 'blunder')    { blunderCount++;    }
        else if (label === 'mistake')    { mistakeCount++;    }
        else if (label === 'inaccuracy') { inaccuracyCount++; }
        else                             { goodMoveCount++;   }

        // Worst loss tracking
        if (nodeEval.loss !== undefined && nodeEval.loss > worstLoss) {
          worstLoss    = nodeEval.loss;
          worstLossPly = node.ply;
        }
      } else {
        goodMoveCount++;
      }

      // ── Per-move accuracy ─────────────────────────────────────────────
      const nodeWc   = evalWinChances(nodeEval);
      const parentWc = evalWinChances(parentEval);
      if (nodeWc !== undefined && parentWc !== undefined) {
        const nodeWp   = (nodeWc   + 1) / 2 * 100;
        const parentWp = (parentWc + 1) / 2 * 100;
        // White: loses advantage when nodeWp < parentWp; black: when nodeWp > parentWp
        const diff = isWhiteMove ? (parentWp - nodeWp) : (nodeWp - parentWp);
        const raw  = 103.1668100711649 * Math.exp(-0.04354415386753951 * diff) + -3.166924740191411;
        accs.push(Math.max(0, Math.min(100, raw + 1)));

        // ── Win/loss position detection ───────────────────────────────
        // win probability from the user's perspective [0, 1]
        const userWp = isWhitePlayer ? (nodeWc + 1) / 2 : (-nodeWc + 1) / 2;
        if (userWp > 0.7) {
          consecutiveAbove70++;
          if (consecutiveAbove70 >= 3) hadWinningPosition = true;
        } else {
          consecutiveAbove70 = 0;
        }
        if (userWp < 0.3) {
          consecutiveBelow30++;
          if (consecutiveBelow30 >= 3) hadLosingPosition = true;
        } else {
          consecutiveBelow30 = 0;
        }
      }
    }

    // ── Clock data ────────────────────────────────────────────────────────
    if (node.clock !== undefined) {
      const clockCs = node.clock; // centiseconds remaining
      clockValues.push(clockCs);
      if (prevClockCs !== undefined && prevClockCs > clockCs) {
        totalTimeCs += prevClockCs - clockCs;
      }
      if (clockCs < 3000) timeTroubleMoves++;
      prevClockCs = clockCs;
    }
  }

  // ── Aggregate accuracy ────────────────────────────────────────────────
  function aggregateAccuracy(a: number[]): number {
    const n = a.length;
    if (n < 2) return 50;
    const window    = Math.max(2, Math.min(8, Math.floor(n / 10)));
    const weights: number[] = [];
    for (let s = 0; s + window <= n; s++) {
      const sl   = a.slice(s, s + window);
      const mean = sl.reduce((x, y) => x + y, 0) / sl.length;
      const vari = sl.reduce((x, y) => x + (y - mean) ** 2, 0) / sl.length;
      weights.push(Math.max(0.5, Math.min(12, Math.sqrt(vari))));
    }
    const pairLen = weights.length;
    let wSum = 0, wTot = 0;
    for (let i = 0; i < pairLen; i++) { wSum += a[i]! * weights[i]!; wTot += weights[i]!; }
    const wMean  = wTot > 0 ? wSum / wTot : 0;
    const hMean  = n / a.reduce((acc, x) => acc + 1 / Math.max(x, 0.001), 0);
    return Math.max(0, Math.min(100, (wMean + hMean) / 2));
  }

  // ── Result interpretation ─────────────────────────────────────────────
  const resultStr = game.result ?? '*';
  const playerWon = isWhitePlayer ? resultStr === '1-0' : resultStr === '0-1';
  const playerDrew = resultStr === '1/2-1/2';

  // ── Summary assembly ──────────────────────────────────────────────────
  const hasClockData  = clockValues.length > 1;
  const avgTimePerMoveCs = hasClockData ? totalTimeCs / clockValues.length : undefined;
  const avgTimePerMoveSecs = avgTimePerMoveCs !== undefined ? avgTimePerMoveCs / 100 : undefined;

  return {
    gameId:              game.id,
    date:                game.date ?? '',
    analyzedAt:          new Date().toISOString(),
    source:              (game.source as 'lichess' | 'chesscom') ?? 'pgn',
    timeClass:           game.timeClass ?? 'classical',
    playerColor:         userColor,
    playerRating:        (isWhitePlayer ? game.whiteRating : game.blackRating) ?? 0,
    opponentRating:      (isWhitePlayer ? game.blackRating : game.whiteRating) ?? 0,
    result:              resultStr,
    accuracy:            Math.round(aggregateAccuracy(accs)),
    blunderCount,
    mistakeCount,
    inaccuracyCount,
    goodMoveCount,
    totalMoves,
    missedMomentCount:   missedMoments.length,
    worstLoss,
    worstLossPly,
    opening:             game.opening ?? game.eco ?? '',
    eco:                 game.eco ?? '',
    hadWinningPosition,
    converted:           hadWinningPosition && playerWon,
    hadLosingPosition,
    survived:            hadLosingPosition && (playerWon || playerDrew),
    retroCandidateCount: missedMoments.length,
    hasClockData,
    ...(avgTimePerMoveSecs !== undefined ? { avgTimePerMove: Math.round(avgTimePerMoveSecs * 10) / 10 } : {}),
    ...(hasClockData ? { timeTroubleMoves } : {}),
    analysisDepth:       depth,
    swingCount:          missedMoments.filter(m => m.kind === 'swing').length,
    missedMateCount:     missedMoments.filter(m => m.kind === 'missed-mate').length,
    collapseCount:       missedMoments.filter(m => m.kind === 'collapse').length,
  };
}

/**
 * Resolve player color from importedUsername stored on the game at import time.
 * Used by the backfill path which runs without adapter username state.
 */
function getUserColorFromGame(game: ImportedGame): 'white' | 'black' | null {
  if (!game.importedUsername) return null;
  const name = game.importedUsername.toLowerCase();
  if (game.white?.toLowerCase() === name) return 'white';
  if (game.black?.toLowerCase() === name) return 'black';
  return null;
}

/**
 * Backfill missing GameSummary records for games that have stored analysis but no summary.
 * Runs on app startup; safe to call on every load since it skips games that already
 * have a summary.  Does not re-run engine analysis.
 *
 * @param games  - all imported games from the game library
 * @returns number of summaries written
 */
export async function backfillGameSummaries(games: ImportedGame[]): Promise<number> {
  if (games.length === 0) return 0;

  // Determine which gameIds already have summaries.
  const existing = await listGameSummaries();
  const existingIds = new Set(existing.map(s => s.gameId));

  let count = 0;
  for (const game of games) {
    if (existingIds.has(game.id)) continue; // already has a summary — skip

    const stored = await loadAnalysisFromIdb(game.id);
    if (!stored || stored.status === 'idle') continue; // no analysis data — skip
    if (stored.analysisVersion < 2) continue; // path-keyed format required

    // Re-check: another concurrent tab may have written the summary by now.
    const alreadyWritten = await getGameSummary(game.id);
    if (alreadyWritten) { existingIds.add(game.id); continue; }

    const userColor = getUserColorFromGame(game);
    if (!userColor) continue; // cannot determine player side without username

    let mainline: TreeNode[];
    try {
      const root = pgnToTree(game.pgn);
      mainline = mainlineNodeList(root);
    } catch {
      continue; // unparseable PGN — skip silently
    }

    const getEval = (path: string) => stored.nodes[path];
    const moments = detectMissedMoments(mainline, new Map(Object.entries(stored.nodes)), userColor);

    const summary = extractGameSummary(game, mainline, getEval, userColor, moments, stored.analysisDepth);
    await saveGameSummary(summary);
    existingIds.add(game.id);
    count++;
  }
  return count;
}
