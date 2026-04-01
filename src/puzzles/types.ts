// ---------------------------------------------------------------------------
// Puzzle V1 — Canonical domain types
// Adapted from lichess-org/lila: ui/puzzle/src/interfaces.ts
// and the Puzzle V1 plan (docs/PUZZLE_V1_PLAN.md).
//
// These types define the richer puzzle model that supersedes the analysis-side
// PuzzleCandidate for the standalone puzzle product. The legacy PuzzleCandidate
// in src/tree/types.ts is intentionally preserved — it continues to serve the
// analysis-side candidate extraction workflow.
// ---------------------------------------------------------------------------

// --- Puzzle source distinction ---

/** Top-level puzzle origin. Discriminates the two V1 puzzle families. */
export type PuzzleSourceKind = 'imported-lichess' | 'user-library';

// --- Puzzle definition (discriminated union) ---

/** Fields shared by every puzzle definition regardless of source. */
interface PuzzleDefinitionBase {
  /** Stable unique id within the puzzle library. */
  id: string;
  sourceKind: PuzzleSourceKind;
  /** FEN of the position where the puzzle begins (before the solution move). */
  startFen: string;
  /**
   * The opponent's last move before the puzzle begins (UCI notation).
   * For imported Lichess puzzles this is moves[0] from the CSV.
   * Applied on the board before the solver gets control.
   */
  triggerMove?: string;
  /**
   * Full solution line in UCI notation.
   * For imported Lichess puzzles this is the solver's moves (trigger excluded).
   * For user-library puzzles this is the engine best-line or manually chosen line.
   * Even indices (0, 2, 4...) = user moves. Odd indices (1, 3, 5...) = opponent replies.
   */
  solutionLine: string[];
  /**
   * The single strict first move the solver must find.
   * Always solutionLine[0], but stored explicitly for clarity and indexing.
   */
  strictSolutionMove: string;
  /** When the puzzle was created or imported. */
  createdAt: number; // epoch ms
  /** When the record was last written to IDB. Used for differential sync. */
  updatedAt?: number; // epoch ms
}

/** A puzzle sourced from the downloaded Lichess puzzle database. */
export interface ImportedLichessPuzzleDefinition extends PuzzleDefinitionBase {
  sourceKind: 'imported-lichess';
  /** Original Lichess puzzle id (e.g. "00sHx"). */
  lichessPuzzleId: string;
  rating: number;
  ratingDeviation?: number;
  popularity?: number;
  plays?: number;
  themes: string[];
  openingTags: string[];
  gameUrl?: string;
}

/** A puzzle created by the user from a Patzer review workflow. */
export interface UserLibraryPuzzleDefinition extends PuzzleDefinitionBase {
  sourceKind: 'user-library';
  /** Source game id if created from a reviewed game. */
  sourceGameId?: string;
  /** TreePath to the source position in the game's move tree. */
  sourcePath?: string;
  /**
   * Why this puzzle was created — e.g. the detection family that surfaced it.
   * Examples: 'swing', 'missed-mate', 'collapse', 'defensive-resource',
   * 'punish-the-blunder', 'manual'.
   */
  sourceReason?: string;
  title?: string;
  notes?: string;
  tags?: string[];
  /** Full PGN of the source game, when available. */
  sourcePgn?: string;
}

/**
 * Canonical puzzle definition — discriminated union by `sourceKind`.
 * This is the V1 puzzle model used by the puzzle product, persistence,
 * and solve runtime.
 */
export type PuzzleDefinition =
  | ImportedLichessPuzzleDefinition
  | UserLibraryPuzzleDefinition;

// --- Session mode ---

/**
 * Whether a puzzle session is practice (default) or rated.
 * 'rated' mode applies only to imported-lichess puzzles.
 * User-library puzzles are always practice-only.
 */
export type PuzzleSessionMode = 'practice' | 'rated';

// ---------------------------------------------------------------------------
// User puzzle performance (rating) types
// Adapted from lichess-org/lila: modules/rating/src/main/Perf.scala
// and modules/rating/src/main/Glicko.scala
//
// Intentional Patzer divergence: imported puzzle ratings stay fixed.
// Only the user's own puzzle rating is updated on rated solves.
// ---------------------------------------------------------------------------

/**
 * Glicko-2 parameters for the user's puzzle rating.
 * Adapted from chess.rating.glicko.Glicko in the Lichess source.
 *
 * Defaults (from Glicko.scala):
 *   rating = 1500, deviation = 500, volatility = 0.09
 *
 * Hard caps (from Glicko.scala and GlickoExt.cap):
 *   minRating = 400, maxRating = 4000
 *   minDeviation = 45, maxDeviation = 500
 *   maxVolatility = 0.1
 */
export interface PuzzleGlicko {
  rating: number;
  deviation: number;
  volatility: number;
}

/** Lichess Glicko-2 constants for puzzle rating. Source-confirmed from Glicko.scala. */
export const PUZZLE_GLICKO_DEFAULTS: PuzzleGlicko = {
  rating: 1500,
  deviation: 500,
  volatility: 0.09,
};

export const PUZZLE_GLICKO_CAPS = {
  minRating: 400,
  maxRating: 4000,
  minDeviation: 45,
  maxDeviation: 500,
  maxVolatility: 0.1,
  /** Maximum rating gain or loss from a single rated solve. Source-confirmed: Glicko.maxRatingDelta = 700. */
  maxRatingDelta: 700,
} as const;

/**
 * User's current puzzle performance rating.
 * Analogous to Lichess Perf wrapping Glicko + metadata.
 * Stored as a single record in IDB under key 'puzzle'.
 *
 * `nb` = total rated puzzles completed (not practice attempts).
 * `recent` = last 12 integer ratings (for mini-chart, matches Perf.recentMaxSize = 12).
 */
export interface UserPuzzlePerf {
  glicko: PuzzleGlicko;
  /** Total rated attempts that updated the rating. */
  nb: number;
  /** Last up to 12 integer ratings (most recent first). */
  recent: number[];
  /** Epoch ms of last rated attempt. */
  latest: number | null;
}

/** Default starting UserPuzzlePerf — matches Lichess Perf.default. */
export const DEFAULT_USER_PUZZLE_PERF: UserPuzzlePerf = {
  glicko: { ...PUZZLE_GLICKO_DEFAULTS },
  nb: 0,
  recent: [],
  latest: null,
};

// --- Rating snapshot ---

/**
 * Per-attempt rating snapshot — the user's Glicko state immediately before
 * or after a rated solve. Stored on PuzzleAttempt for per-round attribution.
 */
export interface PuzzleRatingSnapshot {
  /** Glicko-2 rating value. */
  rating: number;
  /** Glicko-2 rating deviation. */
  deviation: number;
  /** Epoch ms when this snapshot was recorded. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Rating history and round delta types
// Adapted from lichess-org/lila: modules/history/src/main/HistoryApi.scala
// and modules/puzzle/src/main/JsonView.scala
// ---------------------------------------------------------------------------

/**
 * A single entry in the user's puzzle rating history.
 * Written on each rated puzzle completion.
 * Analogous to Lichess history points stored by HistoryApi.addPuzzle.
 */
export interface PuzzleRatingHistoryEntry {
  /** Epoch ms when this entry was recorded. */
  timestamp: number;
  /** User rating after this rated solve. Integer. */
  rating: number;
  /** Rating deviation after this solve. */
  deviation: number;
}

/**
 * Rating delta for a single rated round — the gain or loss attributed to one solve.
 * Stored on PuzzleAttempt for UI display (e.g. "+8" or "-12").
 * Mirrors the IntRatingDiff emitted by PuzzleFinisher.batch in Lichess.
 */
export interface PuzzleRatingDelta {
  /** Integer rating points gained (positive) or lost (negative). */
  delta: number;
  /** User rating before this solve. */
  ratingBefore: number;
  /** User rating after this solve. */
  ratingAfter: number;
}

// --- Solve result model ---

/**
 * Terminal outcome of a puzzle attempt.
 * Adapted from Puzzle V1 plan solve states.
 */
export type SolveResult =
  | 'clean-solve'       // correct on first try, no assistance
  | 'recovered-solve'   // got a wrong move but eventually found the solution
  | 'assisted-solve'    // used hints, engine reveal, or notes during solve
  | 'failed'            // gave up or exhausted attempts without solving
  | 'skipped';          // explicitly skipped

/**
 * Reason a solve attempt was not clean.
 * Multiple reasons may apply to a single attempt.
 */
export type FailureReason =
  | 'wrong-first-move'
  | 'wrong-later-move'
  | 'hint-used'
  | 'engine-arrows-shown'
  | 'engine-lines-shown'
  | 'notes-opened'
  | 'solution-revealed'
  | 'skip-pressed';

// --- Puzzle attempt (append-only history) ---

/**
 * A single solve attempt for a puzzle.
 * Append-only — every attempt is preserved for repetition scheduling
 * and library sorting.
 */
export interface PuzzleAttempt {
  /** References PuzzleDefinition.id. */
  puzzleId: string;
  startedAt: number;   // epoch ms
  completedAt: number; // epoch ms
  result: SolveResult;
  /** All reasons the solve was not clean. Empty array for clean solves. */
  failureReasons: FailureReason[];
  /** Ply (within the solution line) where the first wrong move occurred. */
  firstWrongPly?: number;
  /** Whether the user explicitly used a hint action. */
  usedHint: boolean;
  /** Whether the user triggered an engine reveal action. */
  usedEngineReveal: boolean;
  /** Whether the user revealed the stored solution. */
  revealedSolution: boolean;
  /** When the record was last written to IDB. Used for differential sync. */
  updatedAt?: number; // epoch ms
  /** Whether the user opened notes during the solve. */
  openedNotesDuringSolve: boolean;
  /** Whether the attempt ended via the skip action. */
  skipped: boolean;

  // --- Rated-mode fields ---
  // Populated on rated-eligible solves. Practice attempts leave these undefined.
  // ratingBefore/ratingAfter store the user's Glicko snapshot for per-round attribution.
  // ratedOutcome records which branch was taken so the UI and sync can read it cleanly.

  /** Whether this attempt was recorded in practice or rated mode. */
  sessionMode?: PuzzleSessionMode;
  /**
   * Scored outcome for this attempt in rated mode.
   * 'not-rated' when the round was ineligible or session was practice.
   * Undefined on legacy attempts (written before this field was added).
   */
  ratedOutcome?: RatedScoringOutcome;
  /** Why the attempt was not rated. Populated when ratedOutcome = 'not-rated'. */
  nonRatedReason?: NonRatedReason;
  /** User's puzzle rating snapshot immediately before this attempt. */
  ratingBefore?: PuzzleRatingSnapshot;
  /** User's puzzle rating snapshot immediately after this attempt. */
  ratingAfter?: PuzzleRatingSnapshot;
  /** Rating delta attributed to this solve. Populated on rated-success and rated-failure. */
  ratingDelta?: PuzzleRatingDelta;
}

// --- Move quality evaluation (engine assist layer) ---

/**
 * Engine-based quality assessment of a move played during a puzzle solve.
 * This is SEPARATE from strict solution-line correctness — a move can be
 * wrong (didn't match the solution) but still be objectively good, or right
 * (matched the solution) but only marginally better than alternatives.
 *
 * Used by the UI to show contextual feedback like "your move was actually
 * fine" or "your move lost 2 pawns". Reusable by both the puzzle product
 * and Learn From Your Mistakes.
 *
 * Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts post-solve ceval concepts
 * and ui/analyse/src/retrospect/retroCtrl.ts povDiff threshold model.
 */
export interface PuzzleMoveQuality {
  /** The UCI move that was actually played. */
  playedUci: string;
  /** The UCI move the solution line expected. */
  expectedUci: string;
  /** Whether the played move matched the solution (from strict check). */
  matched: boolean;
  /** FEN of the position before this move was played (for SAN conversion). */
  fenBefore?: string;
  /** Engine eval of the position before the move (white-perspective cp). */
  evalBefore?: { cp?: number; mate?: number };
  /** Engine eval of the position after the move (white-perspective cp). */
  evalAfter?: { cp?: number; mate?: number };
  /** Centipawn loss from the solver's perspective (positive = worse). */
  cpLoss?: number;
  /** Win-chance loss from the solver's perspective (0–0.5 scale, positive = worse). */
  wcLoss?: number;
  /**
   * Quality classification of the move.
   * 'best' — matched the solution line (or engine best).
   * 'good' — did not match but within inaccuracy threshold.
   * 'inaccuracy' / 'mistake' / 'blunder' — classified by win-chance loss thresholds
   * from src/engine/winchances.ts (LOSS_THRESHOLDS).
   */
  quality: 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
}

// ---------------------------------------------------------------------------
// Difficulty offset types and constants
// Adapted from lichess-org/lila: modules/puzzle/src/main/PuzzleDifficulty.scala
// Source-confirmed offsets: Easiest=-600, Easier=-300, Normal=0, Harder=+300, Hardest=+600
// ---------------------------------------------------------------------------

/**
 * Named difficulty levels for rated puzzle selection.
 * Mirrors PuzzleDifficulty enum from Lichess.
 */
export type PuzzleDifficulty = 'easiest' | 'easier' | 'normal' | 'harder' | 'hardest';

/**
 * Rating offset applied to the user's current puzzle rating to pick a target
 * puzzle rating for selection. Source-confirmed from PuzzleDifficulty.scala.
 */
export const PUZZLE_DIFFICULTY_OFFSETS: Record<PuzzleDifficulty, number> = {
  easiest: -600,
  easier:  -300,
  normal:    0,
  harder:  +300,
  hardest: +600,
} as const;

export const DEFAULT_PUZZLE_DIFFICULTY: PuzzleDifficulty = 'normal';

// ---------------------------------------------------------------------------
// Rated eligibility, outcome, and non-rated treatment reason types
// Adapted from lichess-org/lila: modules/puzzle/src/main/PuzzleFinisher.scala
// ---------------------------------------------------------------------------

/**
 * Why a puzzle round is not eligible to count as a rated solve.
 * Used by the completion path to decide which branch to take
 * and to record the reason on the attempt for debugging/display.
 *
 * Source mapping:
 * - 'source-not-rated': user-library puzzle; only imported-lichess puzzles are rateable
 * - 'session-practice': the user explicitly chose practice mode for this session
 * - 'already-solved': puzzle was previously correctly solved (solves[0] = clean); cannot score rated again
 * - 'recent-failure-cooldown': puzzle was failed within the last 7 days; excluded from rated queue
 * - 'assistance-switch-to-casual': user invoked a restricted tool and chose "switch to casual"
 */
export type NonRatedReason =
  | 'source-not-rated'
  | 'session-practice'
  | 'already-solved'
  | 'recent-failure-cooldown'
  | 'assistance-switch-to-casual';

/**
 * Whether a particular puzzle round is eligible for rated scoring, and why not if not.
 */
export type RatedEligibility =
  | { eligible: true }
  | { eligible: false; reason: NonRatedReason };

/**
 * The outcome of a rated-eligible solve for rating math purposes.
 * Mirrors the PuzzleWin / win field in Lichess PuzzleFinisher:
 * - 'rated-success': user found the correct solution without triggering immediate-fail
 * - 'rated-failure': user failed (wrong move, gave up, or chose stay-rated after assistance)
 * - 'rated-immediate-fail': user invoked a restricted tool and chose "stay rated" — recorded as fail
 * - 'not-rated': the round was not eligible; no rating math applied
 */
export type RatedScoringOutcome =
  | 'rated-success'
  | 'rated-failure'
  | 'rated-immediate-fail'
  | 'not-rated';

// --- Per-puzzle user metadata ---

export interface PuzzleUserMeta {
  /** References PuzzleDefinition.id. */
  puzzleId: string;
  /** Flat collection memberships (folder names). */
  folders: string[];
  notes?: string;
  tags?: string[];
  favorite: boolean;
  /** Timestamp of last metadata edit. */
  updatedAt: number; // epoch ms

  // --- Simple review-interval metadata ---
  // These fields support a lightweight "due for review" concept based on
  // fixed intervals per result type. This is NOT spaced repetition — just a
  // simple interval heuristic so the library can surface puzzles that are
  // due for another attempt.

  /** Epoch ms when the puzzle should next be retried. Absent = no schedule. */
  dueAt?: number;
  /** Cached result from the most recent attempt, for quick filtering. */
  lastAttemptResult?: SolveResult;
}
