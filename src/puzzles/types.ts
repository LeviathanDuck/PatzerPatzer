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
   * Full solution line in UCI notation.
   * For imported Lichess puzzles this is the full moves array from the CSV
   * (opponent trigger move excluded — that belongs in round setup, not here).
   * For user-library puzzles this is the engine best-line or manually chosen line.
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
}

// --- Per-puzzle user metadata ---

/**
 * Mutable user-owned metadata attached to a puzzle definition.
 * Separated from solve-attempt state per the V1 plan.
 */
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
}
