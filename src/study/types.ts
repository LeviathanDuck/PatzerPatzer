


import type { SaveFlowGameDestination } from '../save/saveFlowCtrl';

export type StudySource = 'analysis' | 'openings' | 'puzzles' | 'manual' | 'import';

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
  favorite: boolean;
  notes?: string;                  // game-level free-text notes
  bookmarks?: string[];            // TreePath strings for bookmarked positions
  createdAt: number;
  updatedAt: number;










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
