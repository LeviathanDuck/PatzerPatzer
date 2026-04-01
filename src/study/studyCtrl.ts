// Study Library controller — module-level state for the library browser.
// Follows the established ctrl.ts module pattern (openings/ctrl.ts, stats/ctrl.ts).
// Adapted from lichess-org/lila: ui/study/src/studyCtrl.ts state model.

import { parsePgn } from 'chessops/pgn';
import { listStudies, saveStudy, deleteStudy as deleteStudyFromIdb, listPracticeLines, listAllPositionProgress } from './studyDb';
import { countDuePositions, buildReviewSession, buildLearnSession } from './practice/sessionBuilder';
import { positionKey } from './practice/scheduler';
import type { StudyItem, TrainableSequence, PositionProgress } from './types';

let _importIdSeq = 0;
function nextImportId(): string {
  return `study_import_${Date.now()}_${_importIdSeq++}`;
}

// --- Sort / filter state ---

export type StudySortKey = 'createdAt' | 'updatedAt' | 'title';
export type StudySortDir = 'asc' | 'desc';

// --- Module-level state ---

let _studies:    StudyItem[]     = [];
let _loaded      = false;
let _sortKey:    StudySortKey    = 'createdAt';
let _sortDir:    StudySortDir    = 'desc';
let _filterFav:  boolean         = false;
let _filterTag:  string | null   = null;
let _filterSrc:  string | null   = null;
let _search:     string          = '';

// --- Accessors ---

export function studies(): StudyItem[] {
  return applySort(applyFilters(_studies));
}

export function allStudies(): StudyItem[] {
  return _studies;
}

export function isLoaded(): boolean {
  return _loaded;
}

export function sortKey(): StudySortKey { return _sortKey; }
export function sortDir(): StudySortDir { return _sortDir; }
export function filterFav(): boolean    { return _filterFav; }
export function filterTag(): string | null { return _filterTag; }
export function filterSrc(): string | null { return _filterSrc; }
export function searchQuery(): string   { return _search; }

// Computed from all studies — unique sorted folder names.
export function studyFolders(): string[] {
  const folders = new Set<string>();
  for (const s of _studies) {
    for (const f of s.folders) folders.add(f);
  }
  return Array.from(folders).sort();
}

// Computed from all studies — unique sorted tag names.
export function studyTags(): string[] {
  const tags = new Set<string>();
  for (const s of _studies) {
    for (const t of s.tags) tags.add(t);
  }
  return Array.from(tags).sort();
}

// --- Mutations ---

export function setSortKey(key: StudySortKey): void { _sortKey = key; }
export function setSortDir(dir: StudySortDir): void { _sortDir = dir; }
export function setFilterFav(v: boolean): void       { _filterFav = v; }
export function setFilterTag(tag: string | null): void { _filterTag = tag; }
export function setFilterSrc(src: string | null): void { _filterSrc = src; }
export function setSearch(q: string): void           { _search = q; }

// --- CRUD ---

/**
 * Initialize the library by loading all studies from IDB.
 * Calls redraw() when done. Safe to call multiple times.
 */
export function initStudyLibrary(redraw: () => void): void {
  listStudies().then(items => {
    _studies = items;
    _loaded  = true;
    redraw();
  });
}

export async function updateStudy(partial: Partial<StudyItem> & { id: string }): Promise<void> {
  const idx = _studies.findIndex(s => s.id === partial.id);
  if (idx === -1) return;
  const updated: StudyItem = { ..._studies[idx]!, ...partial, updatedAt: Date.now() };
  _studies = [..._studies.slice(0, idx), updated, ..._studies.slice(idx + 1)];
  await saveStudy(updated);
}

export async function deleteStudy(id: string): Promise<void> {
  _studies = _studies.filter(s => s.id !== id);
  await deleteStudyFromIdb(id);
}

export function addStudy(item: StudyItem): void {
  _studies = [item, ..._studies];
}

// --- Filter + sort helpers ---

function applyFilters(items: StudyItem[]): StudyItem[] {
  return items.filter(s => {
    if (_filterFav && !s.favorite) return false;
    if (_filterTag  && !s.tags.includes(_filterTag))    return false;
    if (_filterSrc  && s.source !== _filterSrc)         return false;
    if (_search) {
      const q = _search.toLowerCase();
      if (!s.title.toLowerCase().includes(q) &&
          !(s.white ?? '').toLowerCase().includes(q) &&
          !(s.black ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function applySort(items: StudyItem[]): StudyItem[] {
  const dir = _sortDir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    if (_sortKey === 'title') {
      return dir * a.title.localeCompare(b.title);
    }
    return dir * ((a[_sortKey] as number) - (b[_sortKey] as number));
  });
}

// --- PGN import ---

/**
 * Parse a PGN string (potentially multi-game) and save each game as a StudyItem.
 * Returns the number of games imported.
 * Reuses chessops/pgn parsePgn — handles multi-game PGN files natively.
 */
export async function importPgnToLibrary(pgnText: string): Promise<number> {
  const games = parsePgn(pgnText);
  if (games.length === 0) return 0;
  const now = Date.now();
  const items: StudyItem[] = games.map((game, idx) => {
    const white   = game.headers.get('White');
    const black   = game.headers.get('Black');
    const result  = game.headers.get('Result');
    const eco     = game.headers.get('ECO');
    const opening = game.headers.get('Opening');
    const event   = game.headers.get('Event');

    let title = 'Untitled Study';
    if (white && black && white !== '?' && black !== '?') {
      title = opening ? `${white} vs ${black} — ${opening}` : `${white} vs ${black}`;
    } else if (opening) {
      title = opening;
    } else if (event && event !== '?') {
      title = event;
    }

    // Re-serialize minimal PGN from headers + moves for storage.
    // For import, we use the raw pgnText slice if single-game, or reconstruct header+moves.
    // For simplicity, store the full pgnText for single-game imports and reconstruct for multi.
    const singleGame = games.length === 1;
    const pgn = singleGame ? pgnText.trim() : reconstructPgn(game, pgnText, idx);

    const item: StudyItem = {
      id:        nextImportId(),
      pgn,
      title,
      source:    'import',
      tags:      [],
      folders:   [],
      favorite:  false,
      createdAt: now + idx,  // slight offset so sort order matches import order
      updatedAt: now + idx,
    };
    if (white   && white   !== '?') item.white   = white;
    if (black   && black   !== '?') item.black   = black;
    if (result  && result  !== '*') item.result  = result;
    if (eco)                        item.eco     = eco;
    if (opening)                    item.opening = opening;
    return item;
  });

  // Save all items to IDB and update in-memory state.
  await Promise.all(items.map(item => saveStudy(item)));
  _studies = [...items, ..._studies];
  return items.length;
}

/**
 * Reconstruct a minimal PGN string for a single game from a multi-game PGN.
 * Uses chessops game headers and the raw pgn input as fallback.
 * For multi-game PGNs we build a minimal header block + moves string.
 */
function reconstructPgn(game: ReturnType<typeof parsePgn>[0], _rawPgn: string, _idx: number): string {
  const headers: string[] = [];
  game.headers.forEach((val, key) => {
    headers.push(`[${key} "${val}"]`);
  });
  // Build moves string from the game's move nodes (simplified SAN reconstruction).
  // For a clean implementation, we collect SANs from the mainline.
  const sans: string[] = [];
  let node: typeof game.moves.children[0] | undefined = game.moves.children[0];
  let ply = 1;
  while (node) {
    const san = node.data.san;
    if (!san) break;
    if (ply % 2 === 1) sans.push(`${Math.ceil(ply / 2)}. ${san}`);
    else               sans.push(san);
    ply++;
    node = node.children[0];
  }
  const result = game.headers.get('Result') ?? '*';
  return `${headers.join('\n')}\n\n${sans.join(' ')} ${result}`;
}

// --- Practice dashboard data (CCP-555) ---

let _allSequences:   TrainableSequence[]          = [];
let _progressMap:    Map<string, PositionProgress> = new Map();
let _dueCount:       number                        = 0;
let _practiceLoaded: boolean                       = false;

export function practiceLoaded(): boolean { return _practiceLoaded; }
export function dueCount(): number        { return _dueCount; }
export function allSequences(): TrainableSequence[] { return _allSequences; }
export function progressMap(): Map<string, PositionProgress> { return _progressMap; }

export function reviewSequences(): TrainableSequence[] {
  return buildReviewSession(_allSequences, _progressMap);
}

export function learnSequences(): TrainableSequence[] {
  return buildLearnSession(_allSequences, _progressMap);
}

/** Per-study due count: how many positions are due across all sequences for a given studyItemId. */
export function dueCountForStudy(studyItemId: string): number {
  const seqs = _allSequences.filter(s => s.studyItemId === studyItemId);
  return countDuePositions(seqs, _progressMap);
}

let _practiceLoadPending = false;

export function loadPracticeData(redraw: () => void): void {
  if (_practiceLoadPending) return;
  _practiceLoadPending = true;
  void (async () => {
    try {
      const [seqs, progressList] = await Promise.all([
        listPracticeLines(),
        listAllPositionProgress(),
      ]);
      _allSequences   = seqs;
      _progressMap    = new Map(progressList.map(p => [p.key, p]));
      _dueCount       = countDuePositions(seqs, _progressMap);
      _practiceLoaded = true;
    } catch (e) {
      console.warn('[studyCtrl] loadPracticeData failed', e);
      _practiceLoaded = true;
    } finally {
      _practiceLoadPending = false;
      redraw();
    }
  })();
}

/** Recompute due count key for a specific FEN (called after a drill grade). */
export function invalidatePracticeData(): void {
  _practiceLoaded  = false;
  _practiceLoadPending = false;
}
