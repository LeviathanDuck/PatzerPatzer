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
 * 'rated' mode is reserved for a future rating progression feature.
 * Currently all sessions are 'practice'.
 */
export type PuzzleSessionMode = 'practice' | 'rated';

// --- Rating snapshot (future hook) ---

/**
 * Shape of a per-attempt rating snapshot for the future rated puzzle mode.
 * Not populated yet — defined here so the PuzzleAttempt schema is forward-compatible
 * and existing IDB records won't need migration when rating support lands.
 */
export interface PuzzleRatingSnapshot {
  /** Glicko-2 rating value. */
  rating: number;
  /** Glicko-2 rating deviation. */
  deviation: number;
  /** Epoch ms when this snapshot was recorded. */
  timestamp: number;
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
  /** Whether the user opened notes during the solve. */
  openedNotesDuringSolve: boolean;
  /** Whether the attempt ended via the skip action. */
  skipped: boolean;

  // --- Rated-mode hooks (future) ---
  // These fields are not populated yet. They exist so the PuzzleAttempt shape
  // is forward-compatible with a future rated puzzle mode. When the rating
  // algorithm is implemented, rated-mode attempts will populate ratingBefore
  // and ratingAfter; practice-mode attempts will leave them undefined.

  /** Whether this attempt was recorded in practice or rated mode. */
  sessionMode?: PuzzleSessionMode;
  /** User's puzzle rating snapshot immediately before this attempt. */
  ratingBefore?: PuzzleRatingSnapshot;
  /** User's puzzle rating snapshot immediately after this attempt. */
  ratingAfter?: PuzzleRatingSnapshot;
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
