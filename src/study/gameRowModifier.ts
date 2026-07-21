



















import type { ImportedGame } from '../import/types';
import type { StudyItem } from './types';
import { rowSides, type RowSides } from '../games/rowTruths';

/** Owned here rather than in the view so this module never imports a renderer; itemListView.ts
 *  re-exports it as `ItemListDensity` for its existing (no-touch) shell call site. */
export type StudyRowDensity = 'compact' | 'full';















export function studyItemAsGameRow(item: StudyItem): ImportedGame {
  return {
    id: item.id,
    pgn: item.pgn,
    ...(item.white !== undefined ? { white: item.white } : {}),
    ...(item.black !== undefined ? { black: item.black } : {}),
    ...(item.result !== undefined ? { result: item.result } : {}),
    ...(item.opening !== undefined ? { opening: item.opening } : {}),
    ...(item.eco !== undefined ? { eco: item.eco } : {}),
  };
}

/** Title line above the player names (P2-LIB-10's first named Study customization), with the
 *  untitled affordance the view renders in a quieter treatment. */
export interface StudyRowTitle {
  text: string;
  /** True when the item has no user-authored title and `text` is the placeholder. */
  untitled: boolean;
}

export const UNTITLED_STUDY_TITLE = 'Untitled';

export function studyRowTitle(item: StudyItem): StudyRowTitle {
  const trimmed = item.title?.trim();
  return trimmed ? { text: trimmed, untitled: false } : { text: UNTITLED_STUDY_TITLE, untitled: true };
}










export interface StudyRowSignals {
  /** Item came from / is linked to ORP material (`orpSourceProvenance`). */
  orp: boolean;
  /** Game-level free-text notes exist. */
  hasNotes: boolean;
  tagCount: number;
  folderCount: number;
}

export function studyRowSignals(item: StudyItem): StudyRowSignals {
  return {
    orp: item.orpSourceProvenance !== undefined,
    hasNotes: (item.notes?.trim().length ?? 0) > 0,
    tagCount: item.tags.length,
    folderCount: item.folders.length,
  };
}

/**
 * Expandable right-side action rail (P2-LIB-10's second named Study customization, and its one named
 * interaction divergence from a hover-only quick-actions panel — persistent + toggleable, collapsed
 * by default, expandable per row).
 *
 * STRUCTURE/AFFORDANCE ONLY: every action renders disabled. Wiring behavior is separate work — this
 * slice unifies row ownership and must not grow into it.
 *
 * The slate is the manager-decided set under the owner's design grant: the chess-domain actions a
 * Study row needs to function. It replaces the earlier placeholder slate (Add tag · Favorites · ORP ·
 * Open in new tab · Export PGN); Favorites, tagging and Move/alias all already exist as real,
 * working bulk/context-menu actions, so spending rail slots on disabled copies of them was the worse
 * option. Deviation from the manager's list: "Folders/aliases" is named "Move / alias…" to match the
 * verb the shipped dialog already uses.
 */
export interface StudyRowRailAction {
  key: string;
  glyph: string;
  title: string;
  description: string;
}

export const STUDY_ROW_RAIL_ACTIONS: readonly StudyRowRailAction[] = [
  { key: 'manual-review', glyph: '✓', title: 'Manual Review', description: 'Opens this game with the manual review study tools active.' },
  { key: 'questionnaire', glyph: '?', title: 'Post Game Review Questions', description: 'Answers the post-game review questions for this game.' },
  { key: 'send-to-orp', glyph: '▶', title: 'Send to ORP', description: 'Sends this game to the Opening Repertoire Practice queue.' },
  { key: 'move-alias', glyph: '⌂', title: 'Move / alias…', description: 'Moves this game to another folder, or adds an alias to one.' },
  { key: 'notes', glyph: '✎', title: 'Notes', description: 'Opens this game’s notes.' },
  { key: 're-analyze', glyph: '↻', title: 'Re-analyze', description: 'Runs the engine analysis for this game again.' },
];

/**
 * The whole Study modifier for one row: the shared truths, plus the Study-only slots. The view maps
 * this onto markup; it derives no facts of its own.
 */
export interface StudyRowModifier {
  game: ImportedGame;
  sides: RowSides;
  title: StudyRowTitle;
  signals: StudyRowSignals;
  rail: readonly StudyRowRailAction[];
  density: StudyRowDensity;
}

export function studyRowModifier(item: StudyItem, density: StudyRowDensity): StudyRowModifier {
  const game = studyItemAsGameRow(item);
  return {
    game,
    sides: rowSides(game),
    title: studyRowTitle(item),
    signals: studyRowSignals(item),
    rail: STUDY_ROW_RAIL_ACTIONS,
    density,
  };
}
