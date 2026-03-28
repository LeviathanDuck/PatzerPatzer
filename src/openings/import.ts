/**
 * Openings opponent-research import pipeline.
 *
 * Fetches games from Lichess/Chess.com/PGN for research purposes.
 * Stores results in the separate openings DB, never in the analysis library.
 *
 * Adapts fetch patterns from src/import/lichess.ts and src/import/chesscom.ts
 * but produces ResearchGame[] instead of ImportedGame[].
 */

import type { ResearchGame, ResearchSource, ResearchCollection } from './types';
import { parsePgnHeader, parseRating, timeClassFromTimeControl } from '../import/types';
import { pgnToTree } from '../tree/pgn';
import { saveCollection } from './db';
import {
  importSource, importUsername, importColor,
  importSpeeds, importDateRange, importCustomFrom, importCustomTo,
  importRated, importMaxGames,
  setImportStep, setImportError, setImportProgress, setImportAbort,
  setLastCreatedCollection, addCollection,
} from './ctrl';
import { filterGamesByDate, importFilters } from '../import/filters';

let _researchIdCounter = 0;
function nextResearchId(): string {
  return `research-${++_researchIdCounter}`;
}

function nextCollectionId(): string {
  return `col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- PGN parsing into ResearchGame ---

function pgnToResearchGame(pgn: string, source: ResearchSource): ResearchGame | null {
  try {
    pgnToTree(pgn); // validate
  } catch {
    return null;
  }
  const date = (parsePgnHeader(pgn, 'UTCDate') ?? parsePgnHeader(pgn, 'Date'))?.replace(/\./g, '-');
  return {
    id: nextResearchId(),
    pgn,
    source,
    white: parsePgnHeader(pgn, 'White'),
    black: parsePgnHeader(pgn, 'Black'),
    result: parsePgnHeader(pgn, 'Result'),
    date,
    timeClass: timeClassFromTimeControl(parsePgnHeader(pgn, 'TimeControl')),
    opening: parsePgnHeader(pgn, 'Opening'),
    eco: parsePgnHeader(pgn, 'ECO'),
    whiteRating: parseRating(parsePgnHeader(pgn, 'WhiteElo')),
    blackRating: parseRating(parsePgnHeader(pgn, 'BlackElo')),
  };
}

function splitPgnText(text: string): string[] {
  return text.trim().split(/\n\n(?=\[Event )/).filter(s => s.trim());
}

// --- Lichess fetch ---

async function fetchLichessResearch(username: string, signal: AbortSignal): Promise<ResearchGame[]> {
  const max = importMaxGames();
  const speeds = importSpeeds();
  const rated = importRated();
  const params = new URLSearchParams({ max: String(max) });
  if (rated) params.set('rated', 'true');
  if (speeds.size > 0) params.set('perfType', [...speeds].join(','));
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
  username: string, signal: AbortSignal, onProgress: (n: number) => void,
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
    const res = await fetch(relevantArchives[i]!, { signal });
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
    onProgress(games.length);
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
  setImportStep('importing');
  setImportError(null);
  setImportProgress(0);
  redraw();

  try {
    let games: ResearchGame[];

    const progressCb = (n: number) => {
      setImportProgress(n);
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

    // Apply date filtering post-fetch (Lichess API doesn't support date range params).
    // Temporarily swap the shared importFilters to match the openings filter state,
    // then restore. This reuses the existing filterGamesByDate logic.
    if (source !== 'pgn') {
      const savedDateRange = importFilters.dateRange;
      const savedCustomFrom = importFilters.customFrom;
      const savedCustomTo = importFilters.customTo;
      importFilters.dateRange = importDateRange();
      importFilters.customFrom = importCustomFrom();
      importFilters.customTo = importCustomTo();
      games = filterGamesByDate(games);
      importFilters.dateRange = savedDateRange;
      importFilters.customFrom = savedCustomFrom;
      importFilters.customTo = savedCustomTo;
    }

    setImportProgress(games.length);

    if (games.length === 0) {
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
        setImportStep('details');
        setImportError(`No games found where ${username} plays as ${color}.`);
        setImportAbort(null);
        redraw();
        return;
      }
    }

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
    };

    await saveCollection(collection);
    addCollection(collection);
    setLastCreatedCollection(collection);
    setImportAbort(null);
    setImportStep('done');
    redraw();
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return; // user cancelled
    setImportStep('details');
    setImportError(err instanceof Error ? err.message : 'Import failed.');
    setImportAbort(null);
    redraw();
  }
}
