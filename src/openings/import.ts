/**
 * Openings opponent-research import pipeline.
 *
 * Fetches games from Lichess/Chess.com/PGN for research purposes.
 * Stores results in the separate openings DB, never in the analysis library.
 *
 * Adapts fetch patterns from src/import/lichess.ts and src/import/chesscom.ts
 * but produces ResearchGame[] instead of ImportedGame[].
 */

import type { ResearchGame, ResearchSource, ResearchCollection, ResearchSettings, ResearchProvenance } from './types';
import { parsePgnHeader, parseRating, timeClassFromTimeControl } from '../import/types';
import { pgnToTree } from '../tree/pgn';
import { saveCollection } from './db';
import { classifyOpening } from './eco';
import {
  importSource, importUsername, importColor,
  importSpeeds, importDateRange, importCustomFrom, importCustomTo,
  importRated, importMaxGames,
  setImportStep, setImportError, setImportProgress, setImportMonth, setImportAbort,
  setIsFetching, setOpeningsPage,
  setLastCreatedCollection, addCollection, openCollection,
} from './ctrl';
import type { ImportDateRange } from '../import/filters';

let _researchIdCounter = 0;
function nextResearchId(): string {
  return `research-${++_researchIdCounter}`;
}

function nextCollectionId(): string {
  return `col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- PGN parsing into ResearchGame ---

function pgnToResearchGame(pgn: string, source: ResearchSource): ResearchGame | null {
  let tree;
  try {
    tree = pgnToTree(pgn); // validate and parse
  } catch {
    return null;
  }

  // Extract per-move clock data from the parsed tree mainline
  const clocks: number[] = [];
  let node = tree.children[0];
  while (node) {
    if (node.clock !== undefined) clocks.push(node.clock);
    node = node.children?.[0];
  }

  const date = (parsePgnHeader(pgn, 'UTCDate') ?? parsePgnHeader(pgn, 'Date'))?.replace(/\./g, '-');
  const white = parsePgnHeader(pgn, 'White');
  const black = parsePgnHeader(pgn, 'Black');
  const result = parsePgnHeader(pgn, 'Result');
  const timeClass = timeClassFromTimeControl(parsePgnHeader(pgn, 'TimeControl'));
  let opening = parsePgnHeader(pgn, 'Opening');
  let eco = parsePgnHeader(pgn, 'ECO');
  if (!opening || !eco) {
    const classified = classifyOpening(pgn);
    if (classified) {
      if (!opening) opening = classified.name;
      if (!eco) eco = classified.eco;
    }
  }
  const whiteRating = parseRating(parsePgnHeader(pgn, 'WhiteElo'));
  const blackRating = parseRating(parsePgnHeader(pgn, 'BlackElo'));

  const game: ResearchGame = { id: nextResearchId(), pgn, source };
  if (white !== undefined) game.white = white;
  if (black !== undefined) game.black = black;
  if (result !== undefined) game.result = result;
  if (date !== undefined) game.date = date;
  if (timeClass !== undefined) game.timeClass = timeClass;
  if (opening !== undefined) game.opening = opening;
  if (eco !== undefined) game.eco = eco;
  if (whiteRating !== undefined) game.whiteRating = whiteRating;
  if (blackRating !== undefined) game.blackRating = blackRating;
  if (clocks.length > 0) game.clocks = clocks;
  return game;
}

/**
 * Pure date-range filter for research games.
 * Does not read or mutate shared importFilters state.
 */
function filterResearchGamesByDate<T extends { date?: string }>(
  games: T[], dateRange: ImportDateRange, customFrom: string, customTo: string,
): T[] {
  if (dateRange === 'all') return games;
  if (dateRange === 'custom') {
    return games.filter(g => {
      const d = g.date?.slice(0, 10);
      if (!d) return true;
      if (customFrom && d < customFrom) return false;
      if (customTo && d > customTo) return false;
      return true;
    });
  }
  const now = new Date();
  let cutoff: Date;
  switch (dateRange) {
    case '24h':     cutoff = new Date(now.getTime() - 86_400_000);          break;
    case '1week':   cutoff = new Date(now.getTime() - 7 * 86_400_000);     break;
    case '1month':  cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1);   break;
    case '3months': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3);   break;
    case '1year':   cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    default: return games;
  }
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return games.filter(g => !g.date || g.date.slice(0, 10) >= cutoffStr);
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function formatArchiveMonth(archiveUrl: string): string | undefined {
  const parts = archiveUrl.split('/');
  const year  = parts[parts.length - 2];
  const month = parseInt(parts[parts.length - 1] ?? '', 10);
  if (!year || isNaN(month) || month < 1 || month > 12) return undefined;
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function splitPgnText(text: string): string[] {
  return text.trim().split(/\n\n(?=\[Event )/).filter(s => s.trim());
}

// --- Lichess fetch ---

async function fetchLichessResearch(username: string, signal: AbortSignal): Promise<ResearchGame[]> {
  const max = importMaxGames();
  const speeds = importSpeeds();
  const rated = importRated();
  const params = new URLSearchParams();
  if (isFinite(max)) params.set('max', String(max));
  if (rated) params.set('rated', 'true');
  if (speeds.size > 0) params.set('perfType', [...speeds].join(','));
  params.set('clocks', 'true');
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: 'application/x-chess-pgn' }, signal });
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Lichess: user not found' : `Lichess API error ${res.status}`);
  }
  const text = await res.text();
  if (!text.trim()) return [];
  const games: ResearchGame[] = [];
  for (const pgn of splitPgnText(text)) {
    const g = pgnToResearchGame(pgn, 'lichess');
    if (g) games.push(g);
  }
  return games;
}

// --- Chess.com fetch ---

async function fetchChesscomResearch(
  username: string, signal: AbortSignal, onProgress: (n: number, month?: string) => void,
): Promise<ResearchGame[]> {
  const base = 'https://api.chess.com/pub/player';
  const archivesRes = await fetch(`${base}/${username.toLowerCase()}/games/archives`, { signal });
  if (!archivesRes.ok) {
    throw new Error(archivesRes.status === 404 ? 'Chess.com: user not found' : `Chess.com API error ${archivesRes.status}`);
  }
  const archivesData = await archivesRes.json() as { archives?: string[] };
  const archives = archivesData.archives ?? [];
  if (archives.length === 0) return [];

  const max = importMaxGames();
  const speeds = importSpeeds();
  const rated = importRated();

  // Select archive months based on date range filter
  const dateRange = importDateRange();
  let relevantArchives: string[];
  if (dateRange === 'all') {
    relevantArchives = archives;
  } else {
    // Determine cutoff month
    const now = new Date();
    let cutoff: Date;
    switch (dateRange) {
      case '24h':     cutoff = new Date(now.getTime() - 86_400_000);                          break;
      case '1week':   cutoff = new Date(now.getTime() - 7 * 86_400_000);                     break;
      case '1month':  cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1);         break;
      case '3months': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3);         break;
      case '1year':   cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1);   break;
      case 'custom':
        cutoff = importCustomFrom() ? new Date(importCustomFrom()) : new Date(0);
        break;
      default:
        cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1);
    }
    const cutoffMonth = cutoff.toISOString().slice(0, 7);
    relevantArchives = archives.filter(url => {
      const parts = url.split('/');
      const year  = parts[parts.length - 2];
      const month = parts[parts.length - 1];
      if (!year || !month) return false;
      return `${year}-${month.padStart(2, '0')}` >= cutoffMonth;
    });
  }
  if (relevantArchives.length === 0) return [];

  const games: ResearchGame[] = [];
  for (let i = 0; i < relevantArchives.length; i++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (games.length >= max) break;
    const archiveUrl = relevantArchives[i]!;
    const month = formatArchiveMonth(archiveUrl);
    onProgress(games.length, month);
    const res = await fetch(archiveUrl, { signal });
    if (!res.ok) continue;
    const data = await res.json() as { games?: any[] };
    for (const raw of (data.games ?? []).reverse()) {
      if (games.length >= max) break;
      if (raw.rules !== 'chess' || raw.time_class === 'daily') continue;
      if (rated && !raw.rated) continue;
      if (speeds.size > 0 && !speeds.has(raw.time_class)) continue;
      const pgn: string = raw.pgn ?? '';
      if (!pgn) continue;
      const g = pgnToResearchGame(pgn, 'chesscom');
      if (g) games.push(g);
    }
    onProgress(games.length, month);
  }
  return games;
}

// --- PGN paste/upload ---

function parsePgnResearch(pgnText: string): ResearchGame[] {
  const games: ResearchGame[] = [];
  for (const pgn of splitPgnText(pgnText)) {
    const g = pgnToResearchGame(pgn, 'pgn');
    if (g) games.push(g);
  }
  return games;
}

// --- Main import entry point ---

export async function executeResearchImport(redraw: () => void): Promise<void> {
  const source = importSource();
  const username = importUsername().trim();
  const color = importColor();

  if (source !== 'pgn' && !username) {
    setImportError('Username is required.');
    redraw();
    return;
  }

  const abort = new AbortController();
  setImportAbort(abort);
  setIsFetching(true);
  setOpeningsPage('session');
  setImportStep('idle');
  setImportError(null);
  setImportProgress(0);
  setImportMonth(null);
  redraw();

  try {
    let games: ResearchGame[];

    const progressCb = (n: number, month?: string) => {
      setImportProgress(n);
      if (month !== undefined) setImportMonth(month);
      redraw();
    };

    switch (source) {
      case 'lichess':
        games = await fetchLichessResearch(username, abort.signal);
        break;
      case 'chesscom':
        games = await fetchChesscomResearch(username, abort.signal, progressCb);
        break;
      case 'pgn':
        games = parsePgnResearch(username); // username field holds PGN text for paste
        break;
      default:
        games = [];
    }

    if (abort.signal.aborted) return;

    const fetchedCount = games.length;

    // Apply date filtering post-fetch using openings-local pure filter.
    // Does not touch the shared importFilters state used by the header import.
    if (source !== 'pgn') {
      games = filterResearchGamesByDate(games, importDateRange(), importCustomFrom(), importCustomTo());
    }

    setImportProgress(games.length);

    if (games.length === 0) {
      setIsFetching(false);
      setOpeningsPage('library');
      setImportStep('details');
      setImportError('No games found.');
      setImportAbort(null);
      redraw();
      return;
    }

    // Filter by color perspective if applicable
    if (color !== 'both' && source !== 'pgn') {
      const target = username.toLowerCase();
      games = games.filter(g => {
        const isWhite = g.white?.toLowerCase() === target;
        const isBlack = g.black?.toLowerCase() === target;
        return color === 'white' ? isWhite : isBlack;
      });
      if (games.length === 0) {
        setIsFetching(false);
        setOpeningsPage('library');
        setImportStep('details');
        setImportError(`No games found where ${username} plays as ${color}.`);
        setImportAbort(null);
        redraw();
        return;
      }
    }

    // Build settings snapshot and provenance
    const settings: ResearchSettings = {
      speeds: [...importSpeeds()],
      dateRange: importDateRange(),
      rated: importRated(),
      maxGames: importMaxGames(),
    };
    if (settings.dateRange === 'custom') {
      settings.customFrom = importCustomFrom();
      settings.customTo = importCustomTo();
    }
    const provenance: ResearchProvenance = {
      fetchedCount,
      filteredCount: games.length,
      importedAt: Date.now(),
    };

    // Create and save collection
    const label = source === 'pgn' ? `PGN Upload ${new Date().toLocaleDateString()}` : username;
    const collection: ResearchCollection = {
      id: nextCollectionId(),
      name: label,
      source,
      target: source === 'pgn' ? 'PGN' : username,
      perspective: color,
      games,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings,
      provenance,
    };

    await saveCollection(collection);
    addCollection(collection);
    setLastCreatedCollection(collection);
    setImportAbort(null);
    setIsFetching(false);
    openCollection(collection, redraw);
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return; // user cancelled — cancelImport() already cleaned up
    setIsFetching(false);
    setOpeningsPage('library');
    setImportStep('details');
    setImportError(err instanceof Error ? err.message : 'Import failed.');
    setImportAbort(null);
    redraw();
  }
}
