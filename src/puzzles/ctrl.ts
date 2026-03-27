// ---------------------------------------------------------------------------
// Puzzle V1 — Route controller + round controller
// Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts (module + round pattern)
//
// This is the puzzle product's route owner. It manages page-level state for
// the puzzle library and individual puzzle round views.
//
// PuzzleRoundCtrl owns the solve-round lifecycle: status transitions,
// progress tracking, and per-move feedback. Move validation and persistence
// are deferred to later phases (CCP-156, CCP-157).
// ---------------------------------------------------------------------------

import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { makeFen, parseFen } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';
import { listPuzzleDefinitions, getPuzzleDefinition, saveAttempt, getAttempts, getMeta, saveMeta } from './puzzleDb';
import type { PuzzleDefinition, PuzzleAttempt, SolveResult, FailureReason, PuzzleSourceKind, PuzzleMoveQuality, PuzzleUserMeta, PuzzleSessionMode } from './types';
import {
  protocol as engineProtocol,
  engineEnabled as sharedEngineEnabled,
  engineReady as sharedEngineReady,
  currentEval as sharedCurrentEval,
  multiPv,
  analysisDepth,
  type PositionEval,
} from '../engine/ctrl';
import { evalWinChances, LOSS_THRESHOLDS } from '../engine/winchances';

// Alt-castle mappings — Lichess puzzles store castling as king-to-rook-square
// but chessground may emit king-to-destination. Both forms must be accepted.
// Adapted from lichess-org/lila: ui/puzzle/src/moveTest.ts
const altCastles: Record<string, string> = {
  e1a1: 'e1c1',
  e1h1: 'e1g1',
  e8a8: 'e8c8',
  e8h8: 'e8g8',
};

/**
 * Check if two UCI strings match, accounting for alternate castle notations.
 */
function uciMatches(played: string, expected: string): boolean {
  if (played === expected) return true;
  // Check both directions of alt-castle mapping
  if (altCastles[played] === expected) return true;
  if (altCastles[expected] === played) return true;
  return false;
}

/**
 * Replay a sequence of UCI moves from a FEN to obtain the resulting position.
 * Returns the Chess position after all moves, or undefined on error.
 */
function positionAfterMoves(fen: string, uciMoves: string[]): Chess | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return undefined;
  const chess = pos.value;
  for (const uci of uciMoves) {
    const move = parseUci(uci);
    if (!move) return undefined;
    chess.play(move);
  }
  return chess;
}

export type PuzzleView = 'library' | 'round';

export interface PuzzlePageState {
  view: PuzzleView;
  puzzleId?: string;
}

// ---------------------------------------------------------------------------
// Puzzle list browsing state
// Supports filtered, paginated browsing of puzzles by source kind.
// ---------------------------------------------------------------------------

export interface PuzzleListFilters {
  ratingMin?: number;
  ratingMax?: number;
  theme?: string;
}

export interface PuzzleListState {
  source: PuzzleSourceKind;
  /** All puzzles matching the source (before client-side filters). */
  allForSource: PuzzleDefinition[];
  /** Puzzles after applying filters. */
  filtered: PuzzleDefinition[];
  /** Currently visible page of puzzles. */
  visible: PuzzleDefinition[];
  filters: PuzzleListFilters;
  page: number;
  pageSize: number;
  /** All unique themes found in the source pool (for the theme dropdown). */
  availableThemes: string[];
  loading: boolean;
}

export interface LibraryCounts {
  imported: number;
  user: number;
}

export interface PuzzleRoundState {
  definition: PuzzleDefinition | null;
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

// ---------------------------------------------------------------------------
// PuzzleRoundCtrl — per-round solve state
// Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts (PuzzleCtrl class)
//
// Owns the lifecycle of a single puzzle solve attempt. The controller tracks
// progress through the solution line, transient per-move feedback, and
// accumulated failure reasons. Move validation is NOT handled here — it will
// be wired in CCP-156.
//
// Convention for solutionLine indices (matches our PuzzleDefinition model):
//   - solutionLine excludes the opponent trigger move
//   - even indices (0, 2, 4…) are user moves
//   - odd indices (1, 3, 5…) are opponent responses
// This follows from the Lichess puzzle CSV format where the trigger move is
// separate, and our adapter strips it before storing.
// ---------------------------------------------------------------------------

export type RoundStatus = 'playing' | 'solved' | 'failed' | 'viewing';
export type RoundFeedback = 'none' | 'good' | 'fail';

export class PuzzleRoundCtrl {
  readonly definition: PuzzleDefinition;
  readonly solutionLine: string[];
  status: RoundStatus;
  /** How many solution moves the user has correctly played (0-based). */
  progressPly: number;
  readonly startedAt: number;
  /** Transient per-move feedback — reset before each user move. */
  feedback: RoundFeedback;
  failureReasons: FailureReason[];
  usedHint: boolean;
  usedEngineReveal: boolean;
  revealedSolution: boolean;
  /** Ply (within solutionLine) where the first wrong move occurred, if any. */
  firstWrongPly: number | undefined;
  /** Whether an attempt record has already been persisted for this round. */
  private attemptRecorded: boolean;
  /** The color the solver plays. Opposite of who moves first at startFen. */
  pov: 'white' | 'black';
  private readonly redraw: () => void;

  // --- Puzzle engine assist layer ---
  // Engine eval is for VIEWING after a solve attempt completes, NOT for
  // determining correctness. The submitUserMove path never consults this.
  // Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts ceval integration
  /** Whether the post-solve engine assist is currently active for this round. */
  puzzleEngineEnabled: boolean;

  /**
   * Session mode for this round — always 'practice' for now.
   * When rated puzzle mode is implemented, this will be set to 'rated' and the
   * round will populate ratingBefore/ratingAfter on the PuzzleAttempt record.
   */
  currentSessionMode: PuzzleSessionMode;

  /**
   * Engine-based quality assessments for each user move played during the round.
   * Populated by evaluateMove() after each submitUserMove, regardless of correctness.
   * This is data collection only — the UI rendering layer reads this for contextual feedback.
   */
  moveQualities: PuzzleMoveQuality[];

  constructor(definition: PuzzleDefinition, redraw: () => void) {
    this.definition = definition;
    this.solutionLine = definition.solutionLine;
    this.status = 'playing';
    this.progressPly = 0;
    this.startedAt = Date.now();
    this.feedback = 'none';
    this.failureReasons = [];
    this.usedHint = false;
    this.usedEngineReveal = false;
    this.revealedSolution = false;
    this.firstWrongPly = undefined;
    this.attemptRecorded = false;
    this.redraw = redraw;
    this.puzzleEngineEnabled = false;
    this.currentSessionMode = 'practice';
    this.moveQualities = [];

    // Determine solver's color.
    // startFen has the opponent to move (they play the trigger move).
    // The solver plays the opposite color.
    const setup = parseFen(definition.startFen);
    this.pov = setup.isOk
      ? (setup.value.turn === 'white' ? 'black' : 'white')
      : 'white'; // fallback
  }

  /**
   * Returns the next expected user move from the solution line,
   * or undefined if the puzzle is complete or out of bounds.
   */
  currentExpectedMove(): string | undefined {
    if (this.progressPly >= this.solutionLine.length) return undefined;
    return this.solutionLine[this.progressPly];
  }

  /**
   * Evaluate the quality of a played move relative to the expected solution move.
   * Uses engine win-chance evaluation to classify the move independently of
   * whether it matched the strict solution line.
   *
   * This is the shared concept used by both the puzzle product and Learn From
   * Your Mistakes to provide contextual "how good was your move" feedback.
   *
   * Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts
   * povDiff threshold model and ui/lib/src/ceval/winningChances.ts.
   *
   * @param playedUci   - the UCI move the user actually played
   * @param expectedUci - the UCI move the solution line expected
   * @param matched     - whether playedUci matched expectedUci (from strict check)
   * @param fenBefore   - FEN of the position before the move was played
   */
  evaluateMove(
    playedUci: string,
    expectedUci: string,
    matched: boolean,
    fenBefore: string,
  ): PuzzleMoveQuality {
    // If matched, classify as 'best' immediately — no engine eval needed.
    if (matched) {
      const quality: PuzzleMoveQuality = {
        playedUci,
        expectedUci,
        matched: true,
        quality: 'best',
      };
      this.moveQualities.push(quality);
      return quality;
    }

    // Compute positions before and after the played move to get evals.
    // "Before" = fenBefore. "After" = position after applying playedUci.
    const setupBefore = parseFen(fenBefore);
    if (setupBefore.isErr) {
      const quality: PuzzleMoveQuality = {
        playedUci,
        expectedUci,
        matched: false,
        quality: 'blunder', // cannot evaluate — assume worst
      };
      this.moveQualities.push(quality);
      return quality;
    }

    const posBefore = Chess.fromSetup(setupBefore.value);
    if (posBefore.isErr) {
      const quality: PuzzleMoveQuality = {
        playedUci,
        expectedUci,
        matched: false,
        quality: 'blunder',
      };
      this.moveQualities.push(quality);
      return quality;
    }

    // Derive the position after the played move
    const posAfterPlayed = posBefore.value.clone();
    const move = parseUci(playedUci);
    if (!move) {
      const quality: PuzzleMoveQuality = {
        playedUci,
        expectedUci,
        matched: false,
        quality: 'blunder',
      };
      this.moveQualities.push(quality);
      return quality;
    }
    posAfterPlayed.play(move);

    // Also derive position after the expected (solution) move for comparison
    const posAfterExpected = posBefore.value.clone();
    const expectedMove = parseUci(expectedUci);
    if (expectedMove) {
      posAfterExpected.play(expectedMove);
    }

    // Get static evaluation via shared engine eval if available.
    // Note: full engine eval requires async analysis — for the synchronous path
    // we record the structure and leave evalBefore/evalAfter undefined.
    // The engine assist layer (enablePuzzleEngine) can fill these in later.
    // For now, if the shared engine has a cached eval, use it.
    const currentEngineEval = this.puzzleEngineEnabled ? sharedCurrentEval : {};
    const evalBefore = (currentEngineEval.cp !== undefined || currentEngineEval.mate !== undefined)
      ? { cp: currentEngineEval.cp, mate: currentEngineEval.mate }
      : undefined;

    // Without eval data, we can't compute precise loss — classify by match only.
    // The quality will be refined when engine eval becomes available (CCP-163+).
    if (!evalBefore) {
      const quality: PuzzleMoveQuality = {
        playedUci,
        expectedUci,
        matched: false,
        quality: 'mistake', // default classification without eval data
      };
      this.moveQualities.push(quality);
      return quality;
    }

    // Compute win chances from the solver's perspective.
    // evalBefore is white-perspective. Convert to solver's POV.
    const povSign = this.pov === 'white' ? 1 : -1;
    // Build evalBefore without explicit undefined keys.
    const eb: { cp?: number; mate?: number } = {};
    if (evalBefore.cp !== undefined) eb.cp = evalBefore.cp;
    if (evalBefore.mate !== undefined) eb.mate = evalBefore.mate;

    const wcBefore = evalWinChances(eb);

    if (wcBefore === undefined) {
      const quality: PuzzleMoveQuality = {
        playedUci,
        expectedUci,
        matched: false,
        evalBefore: eb,
        quality: 'mistake',
      };
      this.moveQualities.push(quality);
      return quality;
    }

    // Win-chance loss = (wcBefore_pov - wcAfter_pov) / 2
    // Mirrors retroCtrl.ts povDiff: (parentWc - nodeWc) / 2 from mover's perspective.
    // Without eval for the position after the played move, we approximate:
    // The solution move should maintain the position; the played move may not.
    // For now, record what we have and classify conservatively.
    const wcBeforePov = wcBefore * povSign;

    // Build the quality record with available data
    const quality: PuzzleMoveQuality = {
      playedUci,
      expectedUci,
      matched: false,
      evalBefore: eb,
      // evalAfter will be populated when async engine eval is available
      quality: 'mistake', // will be refined below if we have enough data
    };

    this.moveQualities.push(quality);
    return quality;
  }

  /**
   * Synchronously classify a move quality from pre-computed win-chance loss.
   * Uses the same thresholds as game analysis (LOSS_THRESHOLDS from winchances.ts).
   *
   * @param wcLoss - win-chance loss from solver's perspective (0–0.5 scale)
   * @returns quality classification
   */
  static classifyMoveQuality(wcLoss: number): PuzzleMoveQuality['quality'] {
    if (wcLoss <= 0) return 'good';
    if (wcLoss < LOSS_THRESHOLDS.inaccuracy) return 'good';
    if (wcLoss < LOSS_THRESHOLDS.mistake) return 'inaccuracy';
    if (wcLoss < LOSS_THRESHOLDS.blunder) return 'mistake';
    return 'blunder';
  }

  /**
   * Refine a previously recorded move quality with engine evaluation data.
   * Called when async engine eval becomes available for the position.
   * This allows the initial evaluateMove() call to be synchronous while
   * still providing accurate quality data once the engine finishes.
   */
  refineMoveQuality(
    index: number,
    evalBefore: { cp?: number; mate?: number },
    evalAfter: { cp?: number; mate?: number },
  ): void {
    const mq = this.moveQualities[index];
    if (!mq || mq.matched) return; // don't refine correct moves

    mq.evalBefore = evalBefore;
    mq.evalAfter = evalAfter;

    const povSign = this.pov === 'white' ? 1 : -1;
    const wcBefore = evalWinChances(evalBefore);
    const wcAfter = evalWinChances(evalAfter);

    if (wcBefore !== undefined && wcAfter !== undefined) {
      // Win-chance loss from solver's perspective.
      // Mirrors retroCtrl.ts povDiff: (parentWc - nodeWc) / 2
      const wcBeforePov = wcBefore * povSign;
      const wcAfterPov = wcAfter * povSign;
      const loss = (wcBeforePov - wcAfterPov) / 2;
      mq.wcLoss = Math.max(0, loss);
      mq.quality = PuzzleRoundCtrl.classifyMoveQuality(mq.wcLoss);
    }

    if (evalBefore.cp !== undefined && evalAfter.cp !== undefined) {
      // Centipawn loss from solver's perspective (positive = worse).
      const cpBeforePov = evalBefore.cp * povSign;
      const cpAfterPov = evalAfter.cp * povSign;
      mq.cpLoss = Math.max(0, cpBeforePov - cpAfterPov);
    }
  }

  /**
   * Whether the current position is the user's turn to move.
   * Even progressPly indices (0, 2, 4…) are user moves in our convention.
   */
  isUserTurn(): boolean {
    return this.progressPly % 2 === 0;
  }

  /**
   * Validate a user move against the stored solution line.
   * Adapted from lichess-org/lila: ui/puzzle/src/moveTest.ts
   *
   * On correct move: advances progressPly, sets feedback='good',
   * checks for solve completion.
   * On wrong move: sets status='failed', records failure reason.
   */
  submitUserMove(uci: string): { accepted: boolean } {
    if (this.status !== 'playing') return { accepted: false };

    const expected = this.currentExpectedMove();
    if (!expected) return { accepted: false };

    // Compute the FEN before this move for quality evaluation.
    // Position = startFen + solution moves played so far (up to progressPly).
    const movesPlayed = this.solutionLine.slice(0, this.progressPly);
    const posBefore = positionAfterMoves(this.definition.startFen, movesPlayed);
    const fenBefore = posBefore ? makeFen(posBefore.toSetup()) : this.definition.startFen;

    const matched = uciMatches(uci, expected);

    // Record move quality — this is data collection only, separate from correctness.
    // evaluateMove never influences the accepted/rejected decision.
    this.evaluateMove(uci, expected, matched, fenBefore);

    if (matched) {
      this.feedback = 'good';
      this.progressPly++;

      // Check if puzzle is solved (all solution moves played)
      if (this.progressPly >= this.solutionLine.length) {
        this.status = 'solved';
        this.recordAttempt();
      }
      this.redraw();
      return { accepted: true };
    }

    // Wrong move — track first wrong ply
    if (this.firstWrongPly === undefined) {
      this.firstWrongPly = this.progressPly;
    }
    this.feedback = 'fail';
    const reason: FailureReason = this.progressPly === 0
      ? 'wrong-first-move'
      : 'wrong-later-move';
    if (!this.failureReasons.includes(reason)) {
      this.failureReasons.push(reason);
    }
    this.status = 'failed';
    this.recordAttempt();
    this.redraw();
    return { accepted: false };
  }

  /**
   * After a correct user move, play the opponent's scripted reply from the
   * solution line on the Chessground board.
   * Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts playUci / sendMoveAt
   *
   * Does nothing if:
   * - puzzle is already solved/failed
   * - it's the user's turn (no opponent reply pending)
   * - there's no next move in the solution line
   */
  playOpponentReply(): void {
    if (this.status !== 'playing') return;
    if (this.isUserTurn()) return; // opponent moves are at odd indices

    const opponentUci = this.currentExpectedMove();
    if (!opponentUci) return;

    const cg = getPuzzleCg();
    if (!cg) return;

    // Apply the opponent move on Chessground
    const orig = opponentUci.slice(0, 2) as Key;
    const dest = opponentUci.slice(2, 4) as Key;
    cg.move(orig, dest);

    // Handle promotion piece in UCI (e.g. "e7e8q")
    // Chessground move() handles the visual; the position update below handles logic.

    // Advance progress past the opponent move
    this.progressPly++;

    // Check if puzzle is solved after opponent reply (shouldn't happen normally,
    // but handle edge case where solution ends on opponent move)
    if (this.progressPly >= this.solutionLine.length) {
      this.status = 'solved';
      this.recordAttempt();
      this.redraw();
      return;
    }

    // Update board state: recompute position, set legal dests for user's next move
    const movesPlayed = this.solutionLine.slice(0, this.progressPly);
    const pos = positionAfterMoves(this.definition.startFen, movesPlayed);
    if (pos) {
      const dests = chessgroundDests(pos) as Map<Key, Key[]>;
      const turn: 'white' | 'black' = pos.turn;
      cg.set({
        turnColor: turn,
        movable: {
          color: this.pov,
          dests,
        },
      });
    }

    this.feedback = 'none';
    this.redraw();
  }

  /**
   * Build a PuzzleAttempt from the current round state and persist it to IDB.
   * Idempotent — only records once per round lifecycle.
   */
  recordAttempt(): PuzzleAttempt | undefined {
    if (this.attemptRecorded) return undefined;
    if (this.status !== 'solved' && this.status !== 'failed') return undefined;
    this.attemptRecorded = true;

    const result = this.computeSolveResult();
    const attempt: PuzzleAttempt = {
      puzzleId: this.definition.id,
      startedAt: this.startedAt,
      completedAt: Date.now(),
      result,
      failureReasons: [...this.failureReasons],
      usedHint: this.usedHint,
      usedEngineReveal: this.usedEngineReveal,
      revealedSolution: this.revealedSolution,
      openedNotesDuringSolve: false, // not implemented yet
      skipped: false,
      sessionMode: this.currentSessionMode,
      // ratingBefore / ratingAfter: populated by the future rating algorithm
      // when currentSessionMode === 'rated'. Left undefined for practice mode.
    };
    if (this.firstWrongPly !== undefined) attempt.firstWrongPly = this.firstWrongPly;

    // Fire-and-forget persistence — append-only semantics.
    // After saving the attempt, update the puzzle's due-again metadata.
    saveAttempt(attempt)
      .then(() => getAttempts(this.definition.id))
      .then(allAttempts => updateDueMeta(this.definition.id, allAttempts))
      .catch(e => console.warn('[puzzle-round] attempt save / due-meta update failed', e));

    return attempt;
  }

  /**
   * Determine the SolveResult from the current round state.
   * Priority: skipped > failed > assisted-solve > recovered-solve > clean-solve
   */
  private computeSolveResult(): SolveResult {
    if (this.status === 'failed') return 'failed';

    // Solved — determine quality
    if (this.usedHint || this.usedEngineReveal || this.revealedSolution) {
      return 'assisted-solve';
    }
    if (this.failureReasons.length > 0 || this.firstWrongPly !== undefined) {
      return 'recovered-solve';
    }
    return 'clean-solve';
  }

  /**
   * Skip the current puzzle — marks as failed with 'skipped' result.
   * Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts skip action
   */
  skipPuzzle(): void {
    if (this.status !== 'playing') return;
    if (!this.failureReasons.includes('skip-pressed')) {
      this.failureReasons.push('skip-pressed');
    }
    this.status = 'failed';
    this.feedback = 'fail';

    // Record with skipped flag — bypass normal recordAttempt to set skipped=true
    if (!this.attemptRecorded) {
      this.attemptRecorded = true;
      const attempt: PuzzleAttempt = {
        puzzleId: this.definition.id,
        startedAt: this.startedAt,
        completedAt: Date.now(),
        result: 'skipped',
        failureReasons: [...this.failureReasons],
        usedHint: this.usedHint,
        usedEngineReveal: this.usedEngineReveal,
        revealedSolution: this.revealedSolution,
        openedNotesDuringSolve: false,
        skipped: true,
        sessionMode: this.currentSessionMode,
      };
      if (this.firstWrongPly !== undefined) attempt.firstWrongPly = this.firstWrongPly;
      saveAttempt(attempt)
        .then(() => getAttempts(this.definition.id))
        .then(allAttempts => updateDueMeta(this.definition.id, allAttempts))
        .catch(e => console.warn('[puzzle-round] skip attempt save / due-meta update failed', e));
    }

    this.redraw();
  }

  // --- Assist action methods ---
  // These methods log assist actions (hint, engine reveal, solution reveal)
  // so the attempt record captures WHY a solve was assisted. Each sets the
  // relevant boolean flag and appends a FailureReason if not already present.
  // Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts hint / ceval / solution

  /**
   * Mark that the user requested a hint.
   * Sets usedHint flag and records 'hint-used' failure reason.
   * The actual hint display is a future UI task — this just marks the flag.
   */
  useHint(redraw: () => void): void {
    if (this.status !== 'playing') return;
    this.usedHint = true;
    if (!this.failureReasons.includes('hint-used')) {
      this.failureReasons.push('hint-used');
    }
    redraw();
  }

  /**
   * Mark that the user revealed the solution.
   * Sets revealedSolution flag and records 'solution-revealed' failure reason.
   * Available during play or after failure.
   */
  revealSolution(redraw: () => void): void {
    if (this.status !== 'playing' && this.status !== 'failed') return;
    this.revealedSolution = true;
    if (!this.failureReasons.includes('solution-revealed')) {
      this.failureReasons.push('solution-revealed');
    }
    redraw();
  }

  /**
   * Mark that the user requested engine lines and activate the engine.
   * Sets usedEngineReveal flag and records 'engine-lines-shown' failure reason.
   * Only available after solve/fail (post-round viewing).
   */
  showEngineLines(redraw: () => void): void {
    if (this.status !== 'solved' && this.status !== 'failed') return;
    this.usedEngineReveal = true;
    if (!this.failureReasons.includes('engine-lines-shown')) {
      this.failureReasons.push('engine-lines-shown');
    }
    this.enablePuzzleEngine(redraw);
  }

  /**
   * Mark that the user requested engine arrows on the board.
   * Sets usedEngineReveal flag and records 'engine-arrows-shown' failure reason.
   * Only available after solve/fail (post-round viewing).
   */
  showEngineArrows(redraw: () => void): void {
    if (this.status !== 'solved' && this.status !== 'failed') return;
    this.usedEngineReveal = true;
    if (!this.failureReasons.includes('engine-arrows-shown')) {
      this.failureReasons.push('engine-arrows-shown');
    }
    redraw();
  }

  // --- Post-solve engine assist ---
  // These methods provide a seam for requesting/stopping engine evaluation of
  // the current puzzle position AFTER a solve attempt completes. The engine
  // eval is purely for viewing — it never influences submitUserMove or the
  // strict solutionLine correctness model.
  // Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts cevalEnabled / doStartCeval

  /**
   * Activate engine evaluation for the current puzzle position.
   * Only permitted after the round has ended (solved or failed).
   * Uses the shared Stockfish protocol to evaluate the puzzle board's
   * current FEN — does NOT go through the analysis board's evalCurrentPosition.
   */
  enablePuzzleEngine(redraw: () => void): void {
    if (this.status !== 'solved' && this.status !== 'failed') return;
    if (this.puzzleEngineEnabled) return;
    if (!sharedEngineReady) {
      console.warn('[puzzle-engine] shared engine not ready — cannot enable puzzle eval');
      return;
    }

    this.puzzleEngineEnabled = true;
    this.usedEngineReveal = true;

    // Compute the current position FEN from startFen + moves played so far.
    // progressPly tracks how far through the solution line we got.
    const movesPlayed = this.solutionLine.slice(0, this.progressPly);
    const pos = positionAfterMoves(this.definition.startFen, movesPlayed);
    if (!pos) {
      console.warn('[puzzle-engine] cannot derive position for engine eval');
      this.puzzleEngineEnabled = false;
      return;
    }

    const fenStr = makeFen(pos.toSetup());

    // Send position to the shared Stockfish protocol.
    // This deliberately bypasses evalCurrentPosition() to avoid coupling
    // with the analysis board controller's state (node, path, cache, arrows).
    engineProtocol.setPosition(fenStr);
    engineProtocol.go(analysisDepth, multiPv);

    redraw();
  }

  /**
   * Stop engine evaluation for the puzzle position.
   */
  disablePuzzleEngine(): void {
    if (!this.puzzleEngineEnabled) return;
    this.puzzleEngineEnabled = false;
    engineProtocol.stop();
  }

  /**
   * Returns the current engine eval from the shared engine state.
   * Only meaningful when puzzleEngineEnabled is true — otherwise returns
   * an empty eval. The caller should check puzzleEngineEnabled before
   * using the result for display.
   */
  getPuzzleEval(): PositionEval {
    if (!this.puzzleEngineEnabled) return {};
    return sharedCurrentEval;
  }
}

// ---------------------------------------------------------------------------
// Round ctrl singleton + factory
// ---------------------------------------------------------------------------

let activeRoundCtrl: PuzzleRoundCtrl | null = null;

/**
 * Create and activate a new round controller for the given puzzle definition.
 * Sets up the board at startFen with the solver's orientation.
 *
 * Note: the opponent's trigger move is not stored in our PuzzleDefinition
 * (it was stripped during import). The startFen is the position before the
 * trigger, but our board shows it as-is. A future phase may animate the
 * trigger move if the original move is recoverable.
 */
export function startPuzzleRound(
  definition: PuzzleDefinition,
  redraw: () => void,
): PuzzleRoundCtrl {
  activeRoundCtrl = new PuzzleRoundCtrl(definition, redraw);
  return activeRoundCtrl;
}

export function getActiveRoundCtrl(): PuzzleRoundCtrl | null {
  return activeRoundCtrl;
}

let state: PuzzlePageState = { view: 'library' };
let libraryCounts: LibraryCounts | undefined;
let roundState: PuzzleRoundState | null = null;

export function initPuzzlePage(view: PuzzleView, puzzleId?: string): void {
  const s: PuzzlePageState = { view };
  if (puzzleId !== undefined) s.puzzleId = puzzleId;
  state = s;
}

export function getPuzzlePageState(): PuzzlePageState {
  return state;
}

export function getLibraryCounts(): LibraryCounts | undefined {
  return libraryCounts;
}

// --- Puzzle round ---

export function getPuzzleRoundState(): PuzzleRoundState | null {
  return roundState;
}

/**
 * Load a puzzle definition from IDB and transition to the round view.
 * Calls redraw once the definition is loaded (or on error).
 * Idempotent — skips if already loading/loaded for the same puzzle id.
 */
export async function openPuzzleRound(id: string, redraw: () => void): Promise<void> {
  // Avoid re-fetching if we already have the right puzzle loaded or loading
  if (roundState && state.puzzleId === id && roundState.status !== 'error') return;

  state = { view: 'round', puzzleId: id };
  roundState = { definition: null, status: 'loading' };
  redraw();

  try {
    const def = await getPuzzleDefinition(id);
    if (!def) {
      roundState = { definition: null, status: 'error', error: `Puzzle "${id}" not found` };
    } else {
      roundState = { definition: def, status: 'ready' };
      startPuzzleRound(def, redraw);
      // Pre-load user metadata for the editing surface
      loadPuzzleMeta(id).then(() => redraw());
    }
  } catch (e) {
    roundState = {
      definition: null,
      status: 'error',
      error: e instanceof Error ? e.message : 'Failed to load puzzle',
    };
  }
  redraw();
}

// --- Puzzle board ---
// Puzzle-local Chessground instance. Kept separate from the analysis board's
// cgInstance so the two products don't interfere when only one is active.
// Mirrors lichess-org/lila: ui/puzzle/src/view/chessground.ts (per-puzzle CG lifecycle)

let puzzleCg: CgApi | undefined;
let puzzleOrientation: 'white' | 'black' = 'white';

export function getPuzzleCg(): CgApi | undefined { return puzzleCg; }
export function getPuzzleOrientation(): 'white' | 'black' { return puzzleOrientation; }

/**
 * Initialize (or reinitialize) the Chessground board for the current puzzle.
 * Call this from a Snabbdom insert hook once the DOM element is available.
 * Mirrors lichess-org/lila: ui/puzzle/src/view/chessground.ts makeConfig
 */
export function mountPuzzleBoard(el: HTMLElement, redraw: () => void): void {
  const def = roundState?.definition;
  if (!def) return;

  // Determine orientation from round controller's pov (solver's color).
  // In our model startFen has the opponent to move (trigger move side).
  // The solver plays the opposite color.
  // Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts makeCgOpts + initiate
  const rc = getActiveRoundCtrl();
  const setup = parseFen(def.startFen);
  if (setup.isErr) {
    console.error('[puzzle-ctrl] invalid startFen', def.startFen);
    return;
  }
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) {
    console.error('[puzzle-ctrl] invalid position from startFen', def.startFen);
    return;
  }
  const turn: 'white' | 'black' = pos.value.turn;
  // Use round ctrl pov if available; otherwise derive from FEN
  puzzleOrientation = rc ? rc.pov : (turn === 'white' ? 'black' : 'white');

  // The solver's color for movable config — solver moves after the trigger
  const solverColor = puzzleOrientation;

  // Compute legal destinations for the starting position
  const dests = chessgroundDests(pos.value) as Map<Key, Key[]>;

  // Destroy previous instance if any
  puzzleCg?.destroy();

  // The board starts at startFen showing the solver's orientation.
  // Moves are validated against the stored solution line via PuzzleRoundCtrl.
  // Adapted from lichess-org/lila: ui/puzzle/src/view/chessground.ts
  puzzleCg = makeChessground(el, {
    orientation: puzzleOrientation,
    fen: def.startFen,
    turnColor: turn,
    viewOnly: false,
    movable: {
      free: false,
      color: solverColor,
      dests,
      showDests: true,
    },
    drawable: { enabled: true },
    animation: { enabled: true, duration: 200 },
    events: {
      move: (orig, dest, _capturedPiece) => {
        if (!rc || rc.status !== 'playing') return;

        // Build UCI string from the move (promotion not yet handled)
        const uci = `${orig}${dest}`;
        const result = rc.submitUserMove(uci);

        if (result.accepted) {
          if ((rc as PuzzleRoundCtrl).status === 'solved') {
            // Puzzle complete — redraw shows solved state
            redraw();
            return;
          }
          // Correct move but puzzle continues — schedule opponent reply
          // Short delay (~300ms) before opponent auto-reply, matching Lichess feel
          setTimeout(() => {
            rc.playOpponentReply();
          }, 300);
        } else {
          // Wrong move — fail state. The board shows the piece where it landed
          // but the puzzle is over. A future phase may add snap-back / retry.
          redraw();
        }
      },
    },
  });
}

/**
 * Tear down the puzzle Chessground instance. Called from Snabbdom destroy hook.
 */
export function destroyPuzzleBoard(): void {
  puzzleCg?.destroy();
  puzzleCg = undefined;
}

// --- User metadata (favorites, notes, tags, folders) ---
// Thin cache layer over PuzzleUserMeta IDB records.
// Loaded once per round open; mutated by the metadata editing UI and saved back.

let metaCache: Map<string, PuzzleUserMeta> = new Map();

function defaultMeta(puzzleId: string): PuzzleUserMeta {
  return { puzzleId, folders: [], favorite: false, updatedAt: Date.now() };
}

export function getCachedMeta(puzzleId: string): PuzzleUserMeta | undefined {
  return metaCache.get(puzzleId);
}

export async function loadPuzzleMeta(puzzleId: string): Promise<PuzzleUserMeta | undefined> {
  try {
    const meta = await getMeta(puzzleId);
    if (meta) metaCache.set(puzzleId, meta);
    return meta;
  } catch (e) {
    console.warn('[puzzle-meta] loadPuzzleMeta failed', e);
    return undefined;
  }
}

export async function savePuzzleMeta(meta: PuzzleUserMeta): Promise<void> {
  meta.updatedAt = Date.now();
  metaCache.set(meta.puzzleId, meta);
  try {
    await saveMeta(meta);
  } catch (e) {
    console.warn('[puzzle-meta] savePuzzleMeta failed', e);
  }
}

export async function toggleFavorite(puzzleId: string, redraw: () => void): Promise<void> {
  let meta = metaCache.get(puzzleId) ?? (await getMeta(puzzleId)) ?? defaultMeta(puzzleId);
  meta = { ...meta, favorite: !meta.favorite };
  await savePuzzleMeta(meta);
  redraw();
}

/**
 * Get or create a PuzzleUserMeta for editing. Ensures the cache always has a
 * record for the given puzzleId so the editing UI can bind to it directly.
 */
export function getOrCreateMeta(puzzleId: string): PuzzleUserMeta {
  let meta = metaCache.get(puzzleId);
  if (!meta) {
    meta = defaultMeta(puzzleId);
    metaCache.set(puzzleId, meta);
  }
  return meta;
}

// --- Library counts ---

/**
 * Load puzzle counts from IndexedDB, grouped by sourceKind.
 * Calls redraw when complete so the view reflects the loaded data.
 */
export async function loadLibraryCounts(redraw: () => void): Promise<void> {
  try {
    const all = await listPuzzleDefinitions();
    let imported = 0;
    let user = 0;
    for (const p of all) {
      if (p.sourceKind === 'imported-lichess') imported++;
      else if (p.sourceKind === 'user-library') user++;
    }
    libraryCounts = { imported, user };
  } catch (e) {
    console.warn('[puzzle-ctrl] loadLibraryCounts failed', e);
    libraryCounts = { imported: 0, user: 0 };
  }
  redraw();
}

// ---------------------------------------------------------------------------
// Puzzle list browsing
// ---------------------------------------------------------------------------

const LIST_PAGE_SIZE = 50;
let puzzleListState: PuzzleListState | null = null;

export function getPuzzleListState(): PuzzleListState | null {
  return puzzleListState;
}

/**
 * Close the puzzle list view and return to the library.
 */
export function closePuzzleList(redraw: () => void): void {
  puzzleListState = null;
  redraw();
}

/**
 * Apply client-side filters to the loaded puzzle pool.
 * Resets visible page to 1.
 */
function applyListFilters(ls: PuzzleListState): void {
  let filtered = ls.allForSource;

  if (ls.filters.ratingMin !== undefined) {
    filtered = filtered.filter(p =>
      p.sourceKind === 'imported-lichess' ? p.rating >= ls.filters.ratingMin! : true,
    );
  }
  if (ls.filters.ratingMax !== undefined) {
    filtered = filtered.filter(p =>
      p.sourceKind === 'imported-lichess' ? p.rating <= ls.filters.ratingMax! : true,
    );
  }
  if (ls.filters.theme) {
    const theme = ls.filters.theme;
    filtered = filtered.filter(p =>
      p.sourceKind === 'imported-lichess' ? p.themes.includes(theme) : false,
    );
  }

  ls.filtered = filtered;
  ls.page = 1;
  ls.visible = filtered.slice(0, ls.pageSize);
}

/**
 * Open the puzzle list view for a given source kind.
 * Loads all definitions of that source from IDB and sets up list state.
 */
export async function openPuzzleList(
  source: PuzzleSourceKind,
  redraw: () => void,
): Promise<void> {
  puzzleListState = {
    source,
    allForSource: [],
    filtered: [],
    visible: [],
    filters: {},
    page: 1,
    pageSize: LIST_PAGE_SIZE,
    availableThemes: [],
    loading: true,
  };
  redraw();

  try {
    const all = await listPuzzleDefinitions();
    const forSource = all.filter(p => p.sourceKind === source);

    // Sort imported puzzles by rating ascending; user puzzles by createdAt descending
    if (source === 'imported-lichess') {
      forSource.sort((a, b) => {
        const ra = a.sourceKind === 'imported-lichess' ? a.rating : 0;
        const rb = b.sourceKind === 'imported-lichess' ? b.rating : 0;
        return ra - rb;
      });
    } else {
      forSource.sort((a, b) => b.createdAt - a.createdAt);
    }

    // Collect unique themes for the filter dropdown
    const themeSet = new Set<string>();
    for (const p of forSource) {
      if (p.sourceKind === 'imported-lichess') {
        for (const t of p.themes) themeSet.add(t);
      }
    }
    const themes = Array.from(themeSet).sort();

    puzzleListState!.allForSource = forSource;
    puzzleListState!.availableThemes = themes;
    puzzleListState!.loading = false;
    applyListFilters(puzzleListState!);
  } catch (e) {
    console.warn('[puzzle-ctrl] openPuzzleList failed', e);
    if (puzzleListState) {
      puzzleListState.loading = false;
    }
  }
  redraw();
}

/**
 * Update filters on the active puzzle list and re-apply.
 */
export function filterPuzzleList(
  filters: PuzzleListFilters,
  redraw: () => void,
): void {
  if (!puzzleListState) return;
  puzzleListState.filters = filters;
  applyListFilters(puzzleListState);
  redraw();
}

/**
 * Load the next page of puzzles into the visible list.
 */
export function loadMorePuzzles(redraw: () => void): void {
  if (!puzzleListState) return;
  const ls = puzzleListState;
  const nextEnd = (ls.page + 1) * ls.pageSize;
  ls.page++;
  ls.visible = ls.filtered.slice(0, nextEnd);
  redraw();
}

/**
 * Select a puzzle from the list and open it for solving.
 */
export async function selectPuzzleFromList(
  id: string,
  redraw: () => void,
): Promise<void> {
  // Keep the list state so user can return to it
  roundState = null;
  activeRoundCtrl = null;
  await openPuzzleRound(id, redraw);
}

// --- Session navigation ---
// Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts nextPuzzle / reload

/**
 * Load a random next puzzle from the same sourceKind as the current puzzle.
 * Picks randomly from the available pool, excluding the current puzzle.
 * If no puzzles remain, stays on the current result screen.
 */
export async function nextPuzzle(redraw: () => void): Promise<void> {
  const currentDef = roundState?.definition;
  if (!currentDef) return;

  const sourceKind: PuzzleSourceKind = currentDef.sourceKind;
  try {
    const all = await listPuzzleDefinitions();
    const candidates = all.filter(
      p => p.sourceKind === sourceKind && p.id !== currentDef.id,
    );
    if (candidates.length === 0) {
      console.warn('[puzzle-ctrl] no more puzzles of kind', sourceKind);
      return;
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)]!;

    // Reset round state and open the new puzzle
    roundState = null;
    activeRoundCtrl = null;
    await openPuzzleRound(pick.id, redraw);
  } catch (e) {
    console.warn('[puzzle-ctrl] nextPuzzle failed', e);
  }
}

/**
 * Retry the current puzzle — resets the round controller and remounts the board.
 */
export async function retryPuzzle(redraw: () => void): Promise<void> {
  const currentDef = roundState?.definition;
  if (!currentDef) return;

  // Reset and re-open the same puzzle
  const id = currentDef.id;
  roundState = null;
  activeRoundCtrl = null;
  await openPuzzleRound(id, redraw);
}

// ---------------------------------------------------------------------------
// Retry Failed queue — repetition-oriented session
// Surfaces puzzles where the most recent attempt was failed, skipped,
// assisted-solve, or where no attempt exists yet (never tried).
// Adapted from the Lichess retry/repeat concept — simple queue, no SRS yet.
// ---------------------------------------------------------------------------

/** Attempt results that qualify a puzzle for the retry queue. */
const RETRY_RESULTS: Set<SolveResult> = new Set([
  'failed',
  'skipped',
  'assisted-solve',
]);

let retryQueue: PuzzleDefinition[] = [];
let retryIndex: number = -1;
let retrySessionActive: boolean = false;
/** Cached count of puzzles needing retry, loaded alongside library counts. */
let retryCount: number | undefined;

export function getRetryQueue(): readonly PuzzleDefinition[] { return retryQueue; }
export function getRetryIndex(): number { return retryIndex; }
export function isRetrySessionActive(): boolean { return retrySessionActive; }
export function getRetryCount(): number | undefined { return retryCount; }

/**
 * Build the retry queue: puzzles whose most recent attempt was not a clean
 * or recovered solve, plus puzzles that have never been attempted.
 */
export async function buildRetryQueue(): Promise<PuzzleDefinition[]> {
  const allDefs = await listPuzzleDefinitions();
  const queue: PuzzleDefinition[] = [];

  for (const def of allDefs) {
    const attempts = await getAttempts(def.id);
    if (attempts.length === 0) {
      // Never attempted — include in retry queue
      queue.push(def);
      continue;
    }
    // Find the most recent attempt by completedAt
    let latest = attempts[0]!;
    for (let i = 1; i < attempts.length; i++) {
      if (attempts[i]!.completedAt > latest.completedAt) {
        latest = attempts[i]!;
      }
    }
    if (RETRY_RESULTS.has(latest.result)) {
      queue.push(def);
    }
  }

  return queue;
}

/**
 * Load the retry count for display in the library view.
 * Called alongside loadLibraryCounts.
 */
export async function loadRetryCount(redraw: () => void): Promise<void> {
  try {
    const queue = await buildRetryQueue();
    retryCount = queue.length;
  } catch (e) {
    console.warn('[puzzle-ctrl] loadRetryCount failed', e);
    retryCount = 0;
  }
  redraw();
}

/**
 * Start a retry session: build the queue and open the first puzzle.
 */
export async function startRetrySession(redraw: () => void): Promise<void> {
  try {
    const queue = await buildRetryQueue();
    if (queue.length === 0) {
      console.warn('[puzzle-ctrl] no puzzles need retry');
      return;
    }
    retryQueue = queue;
    retryIndex = 0;
    retrySessionActive = true;

    // Open the first puzzle in the queue
    const first = retryQueue[0]!;
    roundState = null;
    activeRoundCtrl = null;
    await openPuzzleRound(first.id, redraw);
  } catch (e) {
    console.warn('[puzzle-ctrl] startRetrySession failed', e);
    retrySessionActive = false;
  }
}

/**
 * Advance to the next puzzle in the retry queue.
 * If the queue is exhausted, deactivates the session and returns to library.
 */
export async function nextRetryPuzzle(redraw: () => void): Promise<void> {
  if (!retrySessionActive || retryQueue.length === 0) {
    // Fallback to regular next puzzle
    return nextPuzzle(redraw);
  }

  retryIndex++;
  if (retryIndex >= retryQueue.length) {
    // Queue exhausted
    retrySessionActive = false;
    retryQueue = [];
    retryIndex = -1;
    // Refresh retry count to reflect any newly-solved puzzles
    loadRetryCount(redraw);
    console.log('[puzzle-ctrl] retry queue complete');
    return;
  }

  const next = retryQueue[retryIndex]!;
  roundState = null;
  activeRoundCtrl = null;
  await openPuzzleRound(next.id, redraw);
}

// ---------------------------------------------------------------------------
// Due-for-review — simple interval heuristic
// This is NOT spaced repetition. It uses fixed intervals based on the most
// recent attempt result to surface puzzles that are due for another try.
//
// Intervals:
//   clean-solve      → 7 days
//   recovered-solve  → 3 days
//   assisted-solve   → 1 day
//   failed / skipped → 1 day
//   no attempts      → due immediately (epoch 0)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** Interval map: result → milliseconds until the puzzle is due again. */
const DUE_INTERVALS: Record<SolveResult, number> = {
  'clean-solve':     7 * DAY_MS,
  'recovered-solve': 3 * DAY_MS,
  'assisted-solve':  1 * DAY_MS,
  'failed':          1 * DAY_MS,
  'skipped':         1 * DAY_MS,
};

/**
 * Compute the epoch-ms timestamp when a puzzle should next be retried,
 * based on its attempt history. Returns undefined only if the attempt
 * list is somehow malformed (should not happen in practice).
 *
 * Simple interval heuristic — not spaced repetition.
 */
export function computeDueDate(attempts: PuzzleAttempt[]): number | undefined {
  if (attempts.length === 0) return 0; // never tried → due immediately

  // Find most recent attempt by completedAt
  let latest = attempts[0]!;
  for (let i = 1; i < attempts.length; i++) {
    if (attempts[i]!.completedAt > latest.completedAt) {
      latest = attempts[i]!;
    }
  }

  const interval = DUE_INTERVALS[latest.result];
  if (interval === undefined) return undefined;
  return latest.completedAt + interval;
}

/**
 * After recording an attempt, update the puzzle's PuzzleUserMeta with
 * dueAt and lastAttemptResult so that filtering can use metadata alone
 * without re-scanning the attempts store.
 */
async function updateDueMeta(puzzleId: string, attempts: PuzzleAttempt[]): Promise<void> {
  const dueAt = computeDueDate(attempts);
  if (dueAt === undefined) return;

  // Find latest result
  let latest = attempts[0]!;
  for (let i = 1; i < attempts.length; i++) {
    if (attempts[i]!.completedAt > latest.completedAt) {
      latest = attempts[i]!;
    }
  }

  const existing = metaCache.get(puzzleId) ?? (await getMeta(puzzleId)) ?? defaultMeta(puzzleId);
  const updated: PuzzleUserMeta = {
    ...existing,
    dueAt,
    lastAttemptResult: latest.result,
  };
  await savePuzzleMeta(updated);
}

/** Cached count of puzzles due for review. */
let dueCount: number | undefined;

export function getDueCount(): number | undefined { return dueCount; }

/**
 * List all puzzle definitions that are currently due for review.
 * A puzzle is due when its meta.dueAt <= Date.now(), or when it has
 * never been attempted (no meta or dueAt absent → check attempts).
 */
export async function getDuePuzzles(): Promise<PuzzleDefinition[]> {
  const allDefs = await listPuzzleDefinitions();
  const now = Date.now();
  const due: PuzzleDefinition[] = [];

  for (const def of allDefs) {
    const meta = metaCache.get(def.id) ?? (await getMeta(def.id));

    if (meta && meta.dueAt !== undefined) {
      // Has due metadata — check if due
      if (meta.dueAt <= now) due.push(def);
    } else {
      // No due metadata — fall back to attempt check
      const attempts = await getAttempts(def.id);
      if (attempts.length === 0) {
        // Never attempted → due immediately
        due.push(def);
      } else {
        // Has attempts but no dueAt cached — compute and check
        const dueAt = computeDueDate(attempts);
        if (dueAt !== undefined && dueAt <= now) due.push(def);
      }
    }
  }

  return due;
}

/**
 * Load the due-for-review count for display in the library view.
 */
export async function loadDueCount(redraw: () => void): Promise<void> {
  try {
    const duePuzzles = await getDuePuzzles();
    dueCount = duePuzzles.length;
  } catch (e) {
    console.warn('[puzzle-ctrl] loadDueCount failed', e);
    dueCount = 0;
  }
  redraw();
}

/**
 * Start a review-due session: build the due queue and open the first puzzle.
 */
export async function startDueSession(redraw: () => void): Promise<void> {
  try {
    const queue = await getDuePuzzles();
    if (queue.length === 0) {
      console.warn('[puzzle-ctrl] no puzzles due for review');
      return;
    }
    retryQueue = queue;
    retryIndex = 0;
    retrySessionActive = true;

    const first = retryQueue[0]!;
    roundState = null;
    activeRoundCtrl = null;
    await openPuzzleRound(first.id, redraw);
  } catch (e) {
    console.warn('[puzzle-ctrl] startDueSession failed', e);
    retrySessionActive = false;
  }
}
