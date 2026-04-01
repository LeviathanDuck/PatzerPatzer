// Save-to-Library action — captures current game context and persists a StudyItem.
// Adapted from the save pattern in lichess-org/lila: ui/study/src/study.ts persist()

import { parsePgn } from 'chessops/pgn';
import { saveStudy } from './studyDb';
import type { StudyItem, StudySource } from './types';

let _nextId = 0;
function generateStudyId(): string {
  return `study_${Date.now()}_${_nextId++}`;
}

/**
 * Extract a human-readable title from PGN headers.
 * Mirrors the Lichess study naming convention: "White vs Black" from PGN tags.
 */
function extractTitle(pgn: string): string {
  try {
    const game = parsePgn(pgn)[0];
    if (!game) return 'Untitled Study';
    const white   = game.headers.get('White');
    const black   = game.headers.get('Black');
    const opening = game.headers.get('Opening');
    if (white && black && white !== '?' && black !== '?') {
      return opening ? `${white} vs ${black} — ${opening}` : `${white} vs ${black}`;
    }
    if (opening) return opening;
  } catch {
    // ignore parse errors — fall through to default
  }
  return 'Untitled Study';
}

/**
 * Extract game metadata from PGN headers.
 */
function extractMetadata(pgn: string): Pick<StudyItem, 'white' | 'black' | 'result' | 'eco' | 'opening'> {
  try {
    const game = parsePgn(pgn)[0];
    if (!game) return {};
    const meta: Pick<StudyItem, 'white' | 'black' | 'result' | 'eco' | 'opening'> = {};
    const white   = game.headers.get('White');
    const black   = game.headers.get('Black');
    const result  = game.headers.get('Result');
    const eco     = game.headers.get('ECO');
    const opening = game.headers.get('Opening');
    if (white   && white   !== '?') meta.white   = white;
    if (black   && black   !== '?') meta.black   = black;
    if (result  && result  !== '*') meta.result  = result;
    if (eco)                        meta.eco     = eco;
    if (opening)                    meta.opening = opening;
    return meta;
  } catch {
    return {};
  }
}

/**
 * Save the current game to the Study Library.
 * @param pgn - Full PGN string of the game to save.
 * @param metadata - Optional overrides (source, sourceGameId, sourcePath, title, etc.).
 * @returns The newly created StudyItem.
 */
export async function saveCurrentToLibrary(
  pgn: string,
  metadata: Partial<Omit<StudyItem, 'id' | 'pgn' | 'createdAt' | 'updatedAt'>> = {},
): Promise<StudyItem> {
  const now  = Date.now();
  const auto = extractMetadata(pgn);

  const item: StudyItem = {
    // Auto-extracted fields first (lowest priority).
    ...auto,
    // Caller-provided overrides (medium priority).
    ...metadata,
    // Fixed fields that cannot be overridden (highest priority).
    id:        generateStudyId(),
    pgn,
    title:     metadata.title ?? extractTitle(pgn),
    source:    metadata.source ?? ('manual' as StudySource),
    tags:      metadata.tags     ?? [],
    folders:   metadata.folders  ?? [],
    favorite:  metadata.favorite ?? false,
    createdAt: now,
    updatedAt: now,
  };

  await saveStudy(item);
  return item;
}
