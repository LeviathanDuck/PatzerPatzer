


import type { SaveFlowGameDestination } from '../save/saveFlowCtrl';
import type { SrsSourceVersion } from './practice/srsTypes';

export type StudySource = 'analysis' | 'openings' | 'puzzles' | 'manual' | 'import';

export type OrpFlagScope = 'current-line' | 'mainline' | 'selected-variation';

export interface OrpSourceProvenance {
  source: 'study';
  originalStudyItemId: string;
  originalStudyTitle: string;
  scope: OrpFlagScope;
  stopPath?: string;
  sourcePath?: string;
  stopPly?: number;
  sourcePgn?: string;
}


















/**
 * Provenance-layer discriminator (§4.5 three separate layers). A locally-authored layer
 * ('my-analysis' / 'my-notes') is TYPED DISTINCTLY from source-imported material so a source stamp
 * can never claim/overwrite a user-authored layer (P2-ORP-18).
 */
export type ProvenanceLayer = 'source-imported' | 'my-analysis' | 'my-notes';

/**
 * Verified upstream source descriptor — purely DESCRIPTIVE provenance (§4.4 "verified source
 * identity"). Never an identity: the durable grouping key is the minted `sourceLineageId`, never the
 * URL and never a content hash.
 */
export interface VerifiedSourceDescriptor {
  readonly url?: string;
  readonly label?: string;
}

/**
 * Source-imported provenance layer — material linked to / imported from an EXTERNAL upstream
 * (linked, snapshot, or manual). Carries the minted `sourceLineageId`, the reused `SrsSourceVersion`
 * linkage state, and the descriptive verified-source descriptor. Distinct from the intra-Study
 * `OrpSourceProvenance`.
 */
export interface SourceImportedProvenance {
  readonly layer: 'source-imported';
  /** Minted local UUID grouping all decisions from one imported lineage (D3). NOT a URL, NOT a hash. */
  readonly sourceLineageId: string;
  /** Reused linkage union: {linked; sourceRevision} | {unlinked; origin?}. See srsTypes.ts:174-186. */
  readonly version: SrsSourceVersion;
  /** Descriptive verified-source identity/URL (not identity). */
  readonly source?: VerifiedSourceDescriptor;
  /** Last upstream snapshot revision, retained after Unlink from source to explain lineage (§14.4). */
  readonly lastLinkedRevision?: number;
  /** When the link/import was first stamped (metadata, not authority). */
  readonly linkedAt?: number;
}

/**
 * Locally-authored provenance layer — My analysis / My notes. NEVER overwritten by a source stamp
 * (P2-ORP-18 "never overwrite My notes"). Kept as a separate layer so D6's three-way merge has
 * separable owner-authored material to protect.
 */
export interface LocalAuthoredProvenance {
  readonly layer: 'my-analysis' | 'my-notes';
  /** When the owner authored this layer (metadata). */
  readonly authoredAt?: number;
}

/** Any single provenance layer (source-imported or locally-authored). */
export type ProvenanceLayerRecord = SourceImportedProvenance | LocalAuthoredProvenance;

// Folder entity — persisted to the 'folders' IDB store.
// Supports a two-level hierarchy: a folder may have one optional parent.
// Adapted from lichess-org/lila: ui/study/src/studyChapters.ts folder/chapter grouping concept.
export interface StudyFolder {
  id: string;         // generated UUID-like id
  name: string;       // user-editable display name
  parentId?: string;  // id of parent folder (undefined = top-level)
  createdAt: number;
  updatedAt: number;
}

// Core study item — persisted to the 'studies' IDB store.
export interface StudyItem {
  id: string;
  pgn: string;                     // full PGN (source of truth for move tree)
  title: string;                   // user-editable
  source: StudySource;             // where it came from
  sourceGameId?: string;           // if saved from an imported game
  sourcePath?: string;             // TreePath to the position where user saved
  white?: string;                  // player names from PGN headers
  black?: string;
  result?: string;
  eco?: string;
  opening?: string;
  tags: string[];
  folders: string[];                // StudyFolder.id membership (P2-LIB-11; name-based pre-2026-07-06 migration — see studyDb.ts planStudyFolderMigration)













  homeFolderId?: string | null;
  favorite: boolean;
  notes?: string;                  // game-level free-text notes
  bookmarks?: string[];            // TreePath strings for bookmarked positions
  createdAt: number;
  updatedAt: number;
  orpSourceProvenance?: OrpSourceProvenance;



  /**
   * External-source provenance for material linked to / imported from an upstream source. DISTINCT
   * from `orpSourceProvenance` (intra-Study). Stamped by saveAction on a link/snapshot import; a
   * source stamp populates ONLY this layer and never overwrites the locally-authored layers below.
   */
  linkedSourceProvenance?: SourceImportedProvenance;
  /**
   * Locally-authored provenance layers (My analysis / My notes) kept SEPARATE from source-imported
   * material and protected from source overwrite (P2-ORP-18 §4.5). Carried forward verbatim on a
   * source re-stamp.
   */
  localProvenanceLayers?: readonly LocalAuthoredProvenance[];










  /**
   * Study destination section chosen at save time (P2-LIB-2's four sections). Absent for
   * quick saves — see `uncategorized`.
   */
  destination?: SaveFlowGameDestination;






  purpose?: string;
  /**
   * True when this record was saved via the save-flow modal's Quick save escape
   * (P2-SAVE-2) — filed into the shared Unsorted/General bucket instead of being given a
   * `destination`.
   */
  uncategorized?: boolean;
}

// Trainable sequence for repetition practice — persisted to the 'practice-lines' IDB store.
export interface TrainableSequence {
  id: string;
  studyItemId: string;
  label: string;
  moves: string[];                 // UCI notation
  sans: string[];                  // SAN notation
  fens: string[];                  // FEN after each move (pre-computed on save)
  trainAs: 'white' | 'black';
  startPly: number;                // 0 = from beginning
  status: 'active' | 'paused';
  createdAt: number;
  updatedAt: number;
  orpSourceProvenance?: OrpSourceProvenance;



  linkedSourceProvenance?: SourceImportedProvenance;
  localProvenanceLayers?: readonly LocalAuthoredProvenance[];
}

// Per-position mastery (the scheduling unit) — persisted to the 'position-progress' IDB store.
export interface PositionProgress {
  key: string;                     // normalized FEN (board + side + castling + ep)
  level: number;                   // 0–6
  nextDueAt: number;               // epoch ms; 0 = not yet learned
  attempts: number;
  correct: number;
  incorrect: number;
  streak: number;                  // consecutive correct
  lastAttemptAt: number;
  sequenceIds: string[];           // which sequences contain this position
}

// Single drill attempt record — persisted to the 'drill-attempts' IDB store.
export interface DrillAttempt {
  positionKey: string;
  sequenceId: string;
  timestamp: number;
  result: 'correct' | 'incorrect';
  userMove?: string;               // SAN of what user played (if incorrect)
  expectedMove: string;            // SAN of correct move
  attemptsBeforeCorrect: number;
}








export type {
  SrsScheduleStatus,
  SrsReviewKind,
  SrsFirstAttemptResult,
  SrsTraversalMode,
  SrsAssistanceType,
  SrsScheduleRecordBase,
  SrsActiveScheduleRecord,
  SrsInactiveScheduleRecord,
  SrsScheduleRecord,
  SrsScheduledSnapshot,
  SrsSourceVersion,
  SrsDisplaySnapshot,
  SrsAttemptRecord,
  SrsCompletedTargetResult,
  SrsPresentationGroup,
  SrsGraduationPolicy,
  SrsLadderConfig,
  SrsValidatedLadderConfig,
  SrsTransitionOutcome,
  SrsTransitionApplied,
  SrsTransitionDuplicate,
  SrsTransitionStale,
  SrsTransitionInactive,
  SrsTransitionInvalid,
  SrsTransitionResult,
  SrsTransitionFn,
  SrsDueQuery,
  SrsPresentationGroupRef,
  SrsFrozenScheduleSnapshot,
  SrsDuePriorityInputs,
  SrsDueTarget,
  SrsTraversalPlanEntry,
  SrsTraversalPlan,
} from './practice/srsTypes';
