import type { ImportedGame } from '../import/types';
import { inferOwnerColorFromImportedGame, type RepertoireScanOwnerColor } from './scan';
import { OpeningTreeBuilder, type OpeningTreeBuildEdgeSnapshot } from '../openings/tree';
import type { ResearchGame } from '../openings/types';
import { positionKeyFromFen, type PositionKey } from '../tree/fenKey';
import type {
  RepertoireAccountBuildInfo,
  RepertoireAccountFilters,
  RepertoireAccountMoveStats,
  RepertoireEntry,
  RepertoirePositionIndex,
  RepertoireSource,
} from './index';
import {
  normalizeRepertoireAccountFilters,
  isAccountRepertoireSource,
  withRepertoireAccountBuildInfo,
} from './index';

export type AccountRepertoireBuildStateName = 'idle' | 'loading' | 'building' | 'publishing' | 'ready' | 'empty' | 'error';

export interface AccountRepertoireBuildState {
  state: AccountRepertoireBuildStateName;
  sourceId: string;
  sourceVersion: string;
  totalGameCount: number;
  filteredGameCount: number;
  processedGameCount: number;
  durationMs: number | null;
  message: string | null;
}

export interface AccountRepertoireBuildResult {
  index: RepertoirePositionIndex;
  buildInfo: RepertoireAccountBuildInfo;
  source: RepertoireSource;
}

export interface BuildAccountRepertoireIndexInput {
  source: RepertoireSource;
  games: readonly ImportedGame[];
  now?: () => number;
  yieldToMain?: () => Promise<void>;
  onProgress?: (state: AccountRepertoireBuildState) => void;
}

interface AccountRepertoireCacheEntry {
  sourceVersion: string;
  gameSignature: string;
  index: RepertoirePositionIndex;
  buildInfo: RepertoireAccountBuildInfo;
}

const DEFAULT_CHUNK_SIZE = 100;
const accountIndexCache = new Map<string, AccountRepertoireCacheEntry>();
const accountBuildStates = new Map<string, AccountRepertoireBuildState>();
const accountBuildGenerations = new Map<string, number>();

function defaultYieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function sourceVersion(source: RepertoireSource): string {
  return source.contentVersion;
}

function emptyState(source: RepertoireSource, state: AccountRepertoireBuildStateName): AccountRepertoireBuildState {
  return {
    state,
    sourceId: source.id,
    sourceVersion: sourceVersion(source),
    totalGameCount: source.gameCount,
    filteredGameCount: 0,
    processedGameCount: 0,
    durationMs: null,
    message: null,
  };
}

function setBuildState(source: RepertoireSource, state: AccountRepertoireBuildState): void {
  accountBuildStates.set(source.id, state);
}

export function getAccountRepertoireBuildState(source: RepertoireSource): AccountRepertoireBuildState {
  return accountBuildStates.get(source.id) ?? emptyState(source, 'idle');
}

export function invalidateAccountRepertoireBuilds(sourceId?: string): void {
  if (sourceId) {
    accountIndexCache.delete(sourceId);
    accountBuildStates.delete(sourceId);
    accountBuildGenerations.set(sourceId, (accountBuildGenerations.get(sourceId) ?? 0) + 1);
    return;
  }

  const sourceIds = new Set([
    ...accountIndexCache.keys(),
    ...accountBuildStates.keys(),
    ...accountBuildGenerations.keys(),
  ]);
  accountIndexCache.clear();
  accountBuildStates.clear();
  for (const id of sourceIds) {
    accountBuildGenerations.set(id, (accountBuildGenerations.get(id) ?? 0) + 1);
  }
}

function gameSignature(games: readonly ImportedGame[]): string {
  let newestImportedAt = 0;
  let newestId = '';
  for (const game of games) {
    const importedAt = game.importedAt ?? 0;
    if (importedAt > newestImportedAt) newestImportedAt = importedAt;
    if (game.id > newestId) newestId = game.id;
  }
  return `${games.length}:${newestImportedAt}:${newestId}`;
}

function accountOutcome(
  game: ImportedGame,
  ownerColor: RepertoireScanOwnerColor,
): 'win' | 'draw' | 'loss' | null {
  const result = game.result?.trim();
  if (!result || result === '*') return null;
  if (result.includes('1/2')) return 'draw';
  if (ownerColor === 'white') {
    if (result === '1-0') return 'win';
    if (result === '0-1') return 'loss';
  } else {
    if (result === '0-1') return 'win';
    if (result === '1-0') return 'loss';
  }
  return null;
}

function accountRating(game: ImportedGame, ownerColor: RepertoireScanOwnerColor): number | null {
  const rating = ownerColor === 'white' ? game.whiteRating : game.blackRating;
  return typeof rating === 'number' && Number.isFinite(rating) && rating > 0 ? rating : null;
}

function resultMatchesFilter(outcome: 'win' | 'draw' | 'loss' | null, filter: RepertoireAccountFilters['result']): boolean {
  if (filter === 'all') return true;
  if (filter === 'wins') return outcome === 'win';
  if (filter === 'wins-draws') return outcome === 'win' || outcome === 'draw';
  return outcome === 'loss';
}

function gameMatchesAccountFilters(
  game: ImportedGame,
  ownerColor: RepertoireScanOwnerColor,
  filters: RepertoireAccountFilters,
): boolean {
  if (filters.timeClass !== null && game.timeClass !== filters.timeClass) return false;
  const outcome = accountOutcome(game, ownerColor);
  if (!resultMatchesFilter(outcome, filters.result)) return false;

  if (filters.minRating !== null || filters.maxRating !== null) {
    const rating = accountRating(game, ownerColor);
    if (rating === null) return false;
    if (filters.minRating !== null && rating < filters.minRating) return false;
    if (filters.maxRating !== null && rating > filters.maxRating) return false;
  }

  return true;
}

function researchGameFromImportedGame(game: ImportedGame): ResearchGame {
  const research: ResearchGame = {
    id: game.id,
    pgn: game.pgn,
  };
  if (game.white) research.white = game.white;
  if (game.black) research.black = game.black;
  if (game.result) research.result = game.result;
  if (game.date) research.date = game.date;
  if (game.timeClass) research.timeClass = game.timeClass;
  if (game.opening) research.opening = game.opening;
  if (game.eco) research.eco = game.eco;
  if (game.source) research.source = game.source;
  if (game.whiteRating) research.whiteRating = game.whiteRating;
  if (game.blackRating) research.blackRating = game.blackRating;
  return research;
}

function sideToMoveFromFen(fen: string): RepertoireScanOwnerColor | null {
  const side = fen.trim().split(/\s+/)[1];
  if (side === 'w') return 'white';
  if (side === 'b') return 'black';
  return null;
}

function statsForEdge(edge: OpeningTreeBuildEdgeSnapshot, ownerColor: RepertoireScanOwnerColor): RepertoireAccountMoveStats {
  const wins = ownerColor === 'white' ? edge.white : edge.black;
  const losses = ownerColor === 'white' ? edge.black : edge.white;
  const draws = edge.draws;
  const games = edge.total;
  return {
    games,
    wins,
    draws,
    losses,
    winPercent: games > 0 ? Math.round((wins / games) * 100) : 0,
  };
}

function mergeStats(a: RepertoireAccountMoveStats, b: RepertoireAccountMoveStats): RepertoireAccountMoveStats {
  const games = a.games + b.games;
  const wins = a.wins + b.wins;
  return {
    games,
    wins,
    draws: a.draws + b.draws,
    losses: a.losses + b.losses,
    winPercent: games > 0 ? Math.round((wins / games) * 100) : 0,
  };
}

function mergeAccountEntry(existing: RepertoireEntry, incoming: RepertoireEntry): RepertoireEntry {
  const existingStats = existing.accountStats;
  const incomingStats = incoming.accountStats;
  if (!existingStats || !incomingStats) return existing;
  const accountStats = mergeStats(existingStats, incomingStats);
  return {
    ...existing,
    accountStats,
    isMain: existing.isMain || incoming.isMain,
  };
}

function addAccountEntry(index: RepertoirePositionIndex, key: PositionKey, entry: RepertoireEntry): void {
  const entries = index.get(key) ?? [];
  const existingIndex = entries.findIndex(candidate => candidate.uci === entry.uci);
  if (existingIndex >= 0) {
    entries[existingIndex] = mergeAccountEntry(entries[existingIndex]!, entry);
  } else {
    entries.push(entry);
  }
  entries.sort((a, b) => {
    const aStats = a.accountStats;
    const bStats = b.accountStats;
    return (bStats?.games ?? 0) - (aStats?.games ?? 0) || a.san.localeCompare(b.san);
  });
  entries.forEach((candidate, index) => { candidate.isMain = index === 0; });
  index.set(key, entries);
}

async function addEntriesFromOpeningBuilder(
  positionIndex: RepertoirePositionIndex,
  builder: OpeningTreeBuilder,
  ownerColor: RepertoireScanOwnerColor,
  yieldToMain: () => Promise<void>,
): Promise<void> {
  let visited = 0;
  for (const position of builder.positionSnapshots()) {
    const sideToMove = sideToMoveFromFen(position.fen);
    if (sideToMove !== ownerColor || position.edges.length === 0) {
      visited += 1;
      if (visited % DEFAULT_CHUNK_SIZE === 0) await yieldToMain();
      continue;
    }

    try {
      // OpeningTreeBuilder still exposes its own normalized key; account source lookups
      // re-key the public model through the shared repertoire/tree positionKeyFromFen helper.
      const key = positionKeyFromFen(position.fen);
      position.edges.forEach((edge, edgeIndex) => {
        if (!edge.uci || !edge.san) return;
        addAccountEntry(positionIndex, key, {
          uci: edge.uci,
          san: edge.san,
          isMain: edgeIndex === 0,
          depthPly: 0,
          chapterIndex: 0,
          chapterTitle: 'Account games',
          sourceGameIndex: 0,
          nodePathHint: '',
          comments: [],
          nags: [],
          accountStats: statsForEdge(edge, ownerColor),
        });
      });
    } catch {
      // Invalid FEN from a malformed source game should not poison the whole source.
    }

    visited += 1;
    if (visited % DEFAULT_CHUNK_SIZE === 0) await yieldToMain();
  }
}

async function addGamesCooperatively(
  source: RepertoireSource,
  builder: OpeningTreeBuilder,
  games: readonly ResearchGame[],
  stateBase: Omit<AccountRepertoireBuildState, 'processedGameCount'>,
  processedBefore: number,
  yieldToMain: () => Promise<void>,
  onProgress: ((state: AccountRepertoireBuildState) => void) | undefined,
): Promise<number> {
  let processed = processedBefore;
  for (let i = 0; i < games.length; i += DEFAULT_CHUNK_SIZE) {
    const chunk = games.slice(i, i + DEFAULT_CHUNK_SIZE);
    builder.addGames(chunk);
    processed += chunk.length;
    const state = { ...stateBase, state: 'building' as const, processedGameCount: processed };
    setBuildState(source, state);
    onProgress?.(state);
    await yieldToMain();
  }
  return processed;
}

export async function buildAccountRepertoirePositionIndex(
  input: BuildAccountRepertoireIndexInput,
): Promise<AccountRepertoireBuildResult> {
  const source = input.source;
  if (!isAccountRepertoireSource(source)) throw new Error('Repertoire source is not account-backed.');
  const now = input.now ?? Date.now;
  const yieldToMain = input.yieldToMain ?? defaultYieldToMain;
  const startedAt = now();
  const filters = normalizeRepertoireAccountFilters(source.accountFilters);
  const gamesByColor: Record<RepertoireScanOwnerColor, ResearchGame[]> = { white: [], black: [] };

  for (const game of input.games) {
    const ownerColor = inferOwnerColorFromImportedGame(game);
    if (!ownerColor) continue;
    if (!gameMatchesAccountFilters(game, ownerColor, filters)) continue;
    gamesByColor[ownerColor].push(researchGameFromImportedGame(game));
  }

  const filteredGameCount = gamesByColor.white.length + gamesByColor.black.length;
  const baseState: Omit<AccountRepertoireBuildState, 'processedGameCount'> = {
    state: 'building',
    sourceId: source.id,
    sourceVersion: sourceVersion(source),
    totalGameCount: input.games.length,
    filteredGameCount,
    durationMs: null,
    message: null,
  };

  const whiteBuilder = new OpeningTreeBuilder();
  const blackBuilder = new OpeningTreeBuilder();
  let processed = 0;
  processed = await addGamesCooperatively(source, whiteBuilder, gamesByColor.white, baseState, processed, yieldToMain, input.onProgress);
  processed = await addGamesCooperatively(source, blackBuilder, gamesByColor.black, baseState, processed, yieldToMain, input.onProgress);

  const index: RepertoirePositionIndex = new Map();
  await addEntriesFromOpeningBuilder(index, whiteBuilder, 'white', yieldToMain);
  await addEntriesFromOpeningBuilder(index, blackBuilder, 'black', yieldToMain);

  const finishedAt = now();
  const buildInfo: RepertoireAccountBuildInfo = {
    builtAt: finishedAt,
    durationMs: Math.max(0, finishedAt - startedAt),
    totalGameCount: input.games.length,
    filteredGameCount,
  };
  const updatedSource = withRepertoireAccountBuildInfo(source, buildInfo, finishedAt);
  const state: AccountRepertoireBuildState = {
    state: 'publishing',
    sourceId: source.id,
    sourceVersion: sourceVersion(source),
    totalGameCount: input.games.length,
    filteredGameCount,
    processedGameCount: processed,
    durationMs: buildInfo.durationMs,
    message: null,
  };
  setBuildState(source, state);

  return {
    index,
    buildInfo,
    source: updatedSource,
  };
}

export function lookupAccountRepertoireEntriesByFen(source: RepertoireSource, fen: string): RepertoireEntry[] {
  const cache = accountIndexCache.get(source.id);
  if (!cache || cache.sourceVersion !== sourceVersion(source)) return [];
  return cache.index.get(positionKeyFromFen(fen)) ?? [];
}

export function ensureAccountRepertoireBuild(params: {
  source: RepertoireSource;
  loadGames: (accountId: string) => Promise<ImportedGame[]>;
  saveBuildInfo?: (source: RepertoireSource) => Promise<RepertoireSource | null | void>;
  onProgress?: (state: AccountRepertoireBuildState) => void;
  onComplete?: (source: RepertoireSource) => void;
  onError?: (source: RepertoireSource, error: unknown) => void;
}): void {
  const { source } = params;
  if (!isAccountRepertoireSource(source) || !source.accountId) return;
  const current = accountBuildStates.get(source.id);
  if (current?.sourceVersion === sourceVersion(source) && (current.state === 'loading' || current.state === 'building' || current.state === 'publishing')) return;
  if (current?.sourceVersion === sourceVersion(source) && (current.state === 'ready' || current.state === 'empty')) return;

  const generation = (accountBuildGenerations.get(source.id) ?? 0) + 1;
  accountBuildGenerations.set(source.id, generation);
  const loading = emptyState(source, 'loading');
  setBuildState(source, loading);
  params.onProgress?.(loading);

  void params.loadGames(source.accountId).then(async games => {
    if (accountBuildGenerations.get(source.id) !== generation) return;
    const signature = gameSignature(games);
    const cached = accountIndexCache.get(source.id);
    if (cached?.sourceVersion === sourceVersion(source) && cached.gameSignature === signature) {
      const ready = {
        ...emptyState(source, cached.index.size === 0 ? 'empty' : 'ready'),
        totalGameCount: cached.buildInfo.totalGameCount,
        filteredGameCount: cached.buildInfo.filteredGameCount,
        processedGameCount: cached.buildInfo.filteredGameCount,
        durationMs: cached.buildInfo.durationMs,
      };
      setBuildState(source, ready);
      params.onProgress?.(ready);
      return;
    }
    const buildInput: BuildAccountRepertoireIndexInput = {
      source,
      games,
    };
    if (params.onProgress) buildInput.onProgress = params.onProgress;
    const result = await buildAccountRepertoirePositionIndex(buildInput);
    if (accountBuildGenerations.get(source.id) !== generation) return;
    let completedSource = result.source;
    if (params.saveBuildInfo) {
      const savedSource = await params.saveBuildInfo(result.source);
      if (accountBuildGenerations.get(source.id) !== generation) return;
      if (savedSource === null) {
        invalidateAccountRepertoireBuilds(source.id);
        return;
      }
      if (savedSource) completedSource = savedSource;
    }
    accountIndexCache.set(source.id, {
      sourceVersion: sourceVersion(source),
      gameSignature: signature,
      index: result.index,
      buildInfo: result.buildInfo,
    });
    const finalState: AccountRepertoireBuildState = {
      state: result.index.size === 0 ? 'empty' : 'ready',
      sourceId: source.id,
      sourceVersion: sourceVersion(source),
      totalGameCount: result.buildInfo.totalGameCount,
      filteredGameCount: result.buildInfo.filteredGameCount,
      processedGameCount: result.buildInfo.filteredGameCount,
      durationMs: result.buildInfo.durationMs,
      message: null,
    };
    setBuildState(source, finalState);
    params.onProgress?.(finalState);
    params.onComplete?.(completedSource);
  }).catch(error => {
    if (accountBuildGenerations.get(source.id) !== generation) return;
    const state = {
      ...emptyState(source, 'error'),
      message: error instanceof Error ? error.message : 'Could not build account source.',
    };
    setBuildState(source, state);
    params.onError?.(source, error);
    params.onProgress?.(state);
  });
}
