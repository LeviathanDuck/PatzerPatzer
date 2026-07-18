












































import type { AccountPlatform } from '../accounts';
import { getProfile } from './profiles';
import { parsePgnHeader, type ImportedGame } from './types';
import { saveGameToIdb } from '../idb';
import { record, Severity } from '../diagnostics';

const CHESSCOM_BASE = 'https://api.chess.com/pub/player';

// Chess.com API etiquette asks clients to identify themselves (mirrors
// src/import/chesscom.ts / src/import/profiles.ts — browsers drop this
// header silently, but it costs nothing and is honored by non-browser
// runtimes, including this module's own tests).
const CHESSCOM_USER_AGENT = 'ChessPatzer/1.0 (+https://chesspatzer.com; background enrichment)';

/** Attempt ceiling for a single archive-month fetch before it is abandoned and logged. */
const MAX_FETCH_ATTEMPTS = 4;
/** Exponential backoff schedule (ms) between retryable (429/5xx/network) failures. */
const BACKOFF_SCHEDULE_MS = [500, 1000, 2000, 4000];

function backoffDelayMs(attempt: number): number {
  return BACKOFF_SCHEDULE_MS[Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1)]!;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function recordEnrichmentEvent(
  message: string,
  severity: Severity,
  metadata: Record<string, string | number | boolean | null>,
): void {
  record({
    kind: 'api',
    severity,
    source: 'import.enrichment',
    sourceTag: 'import',
    message,
    metadata: { platform: 'chesscom', ...metadata },
    redactionClass: 'safe',
  });
}

export interface EnrichmentCallbacks {






  onGameEnriched: (gameId: string, patch: Pick<ImportedGame, 'opponentRatingDelta'>) => void;
}

export interface EnrichmentOptions {
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable backoff delay for tests; defaults to a real setTimeout sleep. */
  sleepImpl?: (ms: number) => Promise<void>;
}

/** Minimal shape of a chess.com monthly-archive game object needed for delta computation. */
interface ChesscomRawArchiveGame {
  uuid?: string;
  rules?: string;
  rated?: boolean;
  time_class?: string;
  end_time?: number;
  white?: { username?: string; rating?: number };
  black?: { username?: string; rating?: number };
}








type ChesscomRescanRawGame = ChesscomRawArchiveGame & {
  url?: string;
  pgn?: string;
  fen?: string;
  eco?: string;
  time_control?: string;
  start_time?: number;
  tournament?: string;
  match?: string;
  accuracies?: { white?: number; black?: number };
  white?: { result?: string };
  black?: { result?: string };
};

interface ProfileWorkItem {
  kind: 'profile';
  platform: AccountPlatform;
  username: string;
  fetchImpl: typeof fetch;
}

interface DeltaGameRef {
  game: ImportedGame;
  uuid: string;
  timeClass: string;
}

interface ChesscomDeltaWorkItem {
  kind: 'chesscom-delta';
  opponentUsername: string;
  month: string; // YYYY-MM, derived from the game's endTime
  refs: DeltaGameRef[];
  fetchImpl: typeof fetch;
  sleepImpl: (ms: number) => Promise<void>;
  onGameEnriched: EnrichmentCallbacks['onGameEnriched'];
}

interface RescanGameRef {
  game: ImportedGame;
  uuid: string;
}

interface ChesscomRescanWorkItem {
  kind: 'chesscom-rescan';
  /** The imported account's own (lowercased) username — this is a self-archive rescan, not an opponent's. */
  username: string;
  month: string; // YYYY-MM
  refs: RescanGameRef[];
  fetchImpl: typeof fetch;
  sleepImpl: (ms: number) => Promise<void>;
  callbacks: RescanCallbacks;
}

type EnrichmentWorkItem = ProfileWorkItem | ChesscomDeltaWorkItem | ChesscomRescanWorkItem;

// Module-level, process-lifetime queue and per-opponent-month archive cache.
// Both are intentionally unbounded-but-small: a single import batch produces
// at most one item per unique opponent and one per unique (opponent, month).
const queue: EnrichmentWorkItem[] = [];
let activeRun: Promise<void> | null = null;

type ArchiveOutcome =
  | { status: 'ok'; games: ChesscomRawArchiveGame[] }
  | { status: 'not-found' }
  | { status: 'abandoned' };


const archiveMonthCache = new Map<string, Promise<ArchiveOutcome>>();

function archiveCacheKey(username: string, month: string): string {
  return `${username.toLowerCase()}|${month}`;
}

function monthFromEpochSeconds(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [year, mm] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year!, (mm! - 1) + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isRatedStandardGameOfClass(raw: ChesscomRawArchiveGame, timeClass: string): boolean {
  return raw.rules === 'chess' && raw.rated === true && raw.time_class === timeClass;
}

function sortedByEndTime(games: ChesscomRawArchiveGame[]): ChesscomRawArchiveGame[] {
  return games
    .filter((g): g is ChesscomRawArchiveGame & { end_time: number } => typeof g.end_time === 'number')
    .sort((a, b) => a.end_time - b.end_time);
}

function ratingForUsername(raw: ChesscomRawArchiveGame, username: string): number | undefined {
  const lower = username.toLowerCase();
  if (raw.white?.username?.toLowerCase() === lower) {
    return typeof raw.white.rating === 'number' ? raw.white.rating : undefined;
  }
  if (raw.black?.username?.toLowerCase() === lower) {
    return typeof raw.black.rating === 'number' ? raw.black.rating : undefined;
  }
  return undefined;
}

/**
 * Fetch one opponent's monthly archive, serially retrying on 429/5xx/network
 * failure with exponential backoff up to MAX_FETCH_ATTEMPTS before abandoning
 * and logging. Cached per (opponent, month) for the life of the session so
 * one opponent with many games in a batch costs one archive fetch per month.
 */
function fetchArchiveMonth(
  username: string,
  month: string,
  fetchImpl: typeof fetch,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<ArchiveOutcome> {
  const key = archiveCacheKey(username, month);
  const cached = archiveMonthCache.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<ArchiveOutcome> => {
    const [year, mm] = month.split('-');
    const url = `${CHESSCOM_BASE}/${username.toLowerCase()}/games/${year}/${mm}`;
    let attempt = 0;
    for (;;) {
      let res: Response;
      try {
        res = await fetchImpl(url, { headers: { 'User-Agent': CHESSCOM_USER_AGENT } });
      } catch (error) {
        attempt++;
        if (attempt >= MAX_FETCH_ATTEMPTS) {
          recordEnrichmentEvent('enrichment-archive-fetch-abandoned', Severity.Error, {
            requestClass: 'opponent-monthly-archive', errorClass: errorClass(error), month, attempt,
          });
          return { status: 'abandoned' };
        }
        await sleepImpl(backoffDelayMs(attempt));
        continue;
      }
      if (res.status === 404) return { status: 'not-found' };
      if (res.ok) {
        try {
          const data = await res.json() as { games?: ChesscomRawArchiveGame[] };
          return { status: 'ok', games: data.games ?? [] };
        } catch (error) {
          recordEnrichmentEvent('enrichment-archive-parse-failed', Severity.Error, {
            requestClass: 'opponent-monthly-archive', errorClass: errorClass(error), month,
          });
          return { status: 'abandoned' };
        }
      }
      if (res.status === 429 || res.status >= 500) {
        attempt++;
        if (attempt >= MAX_FETCH_ATTEMPTS) {
          recordEnrichmentEvent('enrichment-archive-fetch-abandoned', Severity.Error, {
            requestClass: 'opponent-monthly-archive', errorClass: 'http-error', httpStatus: res.status, month, attempt,
          });
          return { status: 'abandoned' };
        }
        await sleepImpl(backoffDelayMs(attempt));
        continue;
      }
      recordEnrichmentEvent('enrichment-archive-fetch-failed', Severity.Error, {
        requestClass: 'opponent-monthly-archive', errorClass: 'http-error', httpStatus: res.status, month,
      });
      return { status: 'abandoned' };
    }
  })();

  archiveMonthCache.set(key, promise);
  return promise;
}















async function computeDeltasForUsername(
  username: string,
  month: string,
  refs: readonly DeltaGameRef[],
  fetchImpl: typeof fetch,
  sleepImpl: (ms: number) => Promise<void>,
  requestClass: string,
): Promise<Map<string, number>> {
  const currentOutcome = await fetchArchiveMonth(username, month, fetchImpl, sleepImpl);
  const deltas = new Map<string, number>();
  if (currentOutcome.status === 'abandoned') return deltas; // already logged by fetchArchiveMonth
  const currentGames = currentOutcome.status === 'ok' ? currentOutcome.games : [];

  const refsByTimeClass = new Map<string, DeltaGameRef[]>();
  for (const ref of refs) {
    const list = refsByTimeClass.get(ref.timeClass) ?? [];
    list.push(ref);
    refsByTimeClass.set(ref.timeClass, list);
  }

  for (const [timeClass, classRefs] of refsByTimeClass) {
    let combined = sortedByEndTime(currentGames.filter(g => isRatedStandardGameOfClass(g, timeClass)));
    let fetchedPrevMonth = false;

    for (const ref of classRefs) {
      let idx = combined.findIndex(g => g.uuid === ref.uuid);
      if (idx === -1) {
        recordEnrichmentEvent('enrichment-delta-game-not-found', Severity.Warn, {
          requestClass, month, timeClass,
        });
        continue;
      }
      if (idx === 0 && !fetchedPrevMonth) {
        fetchedPrevMonth = true;
        const prevMonth = shiftMonth(month, -1);
        const prevOutcome = await fetchArchiveMonth(username, prevMonth, fetchImpl, sleepImpl);
        const prevGames = prevOutcome.status === 'ok' ? prevOutcome.games : [];
        combined = sortedByEndTime(
          [...prevGames, ...currentGames].filter(g => isRatedStandardGameOfClass(g, timeClass)),
        );
        idx = combined.findIndex(g => g.uuid === ref.uuid);
      }
      if (idx <= 0) continue; // no prior baseline available even across the month boundary — store nothing

      const previousRating = ratingForUsername(combined[idx - 1]!, username);
      const currentRating = ratingForUsername(combined[idx]!, username);
      if (previousRating === undefined || currentRating === undefined) continue;

      deltas.set(ref.game.id, currentRating - previousRating);
    }
  }
  return deltas;
}

/**
 * Compute and persist opponentRatingDelta for every game referenced by this
 * work item, via computeDeltasForUsername() above.
 */
async function processChesscomDeltaItem(item: ChesscomDeltaWorkItem): Promise<void> {
  const deltas = await computeDeltasForUsername(
    item.opponentUsername, item.month, item.refs, item.fetchImpl, item.sleepImpl, 'opponent-monthly-archive',
  );
  for (const ref of item.refs) {
    const delta = deltas.get(ref.game.id);
    if (delta === undefined) continue;
    const patch: Pick<ImportedGame, 'opponentRatingDelta'> = { opponentRatingDelta: delta };
    try {








      const ok = await saveGameToIdb({ ...ref.game, ...patch });
      if (ok) {
        item.onGameEnriched(ref.game.id, patch);
      } else {
        recordEnrichmentEvent('enrichment-game-write-failed', Severity.Error, {
          requestClass: 'game-record-update', errorClass: 'idb-write-false',
        });
      }
    } catch (error) {
      recordEnrichmentEvent('enrichment-game-write-failed', Severity.Error, {
        requestClass: 'game-record-update', errorClass: errorClass(error),
      });
    }
  }
}








function chesscomUrlGameId(url: string | undefined): string | undefined {
  return url?.match(/\/game\/live\/(\d+)/)?.[1];
}

function storedChesscomUrlId(gameId: string): string | undefined {
  return gameId.match(/^chesscom:(\d+)$/)?.[1];
}

function findRawRescanMatch(
  rawGames: readonly ChesscomRescanRawGame[],
  ref: RescanGameRef,
): ChesscomRescanRawGame | undefined {
  const byUuid = rawGames.find(g => g.uuid === ref.uuid);
  if (byUuid) return byUuid;
  const urlId = storedChesscomUrlId(ref.game.id);
  if (!urlId) return undefined;
  return rawGames.find(g => chesscomUrlGameId(g.url) === urlId);
}












function mergeApprovedFields(
  existing: ImportedGame,
  raw: ChesscomRescanRawGame,
): Partial<ImportedGame> | null {
  const patch: Partial<ImportedGame> = {};

  if (raw.accuracies && (typeof raw.accuracies.white === 'number' || typeof raw.accuracies.black === 'number')) {
    const existingAcc = existing.platformAccuracies;
    const nextWhite = existingAcc?.white ?? (typeof raw.accuracies.white === 'number' ? raw.accuracies.white : undefined);
    const nextBlack = existingAcc?.black ?? (typeof raw.accuracies.black === 'number' ? raw.accuracies.black : undefined);
    const whiteIsNew = existingAcc?.white === undefined && nextWhite !== undefined;
    const blackIsNew = existingAcc?.black === undefined && nextBlack !== undefined;
    if (whiteIsNew || blackIsNew) {
      patch.platformAccuracies = {
        ...(nextWhite !== undefined ? { white: nextWhite } : {}),
        ...(nextBlack !== undefined ? { black: nextBlack } : {}),
      };
    }
  }

  const whiteResultCode = typeof raw.white?.result === 'string' ? raw.white.result : undefined;
  if (whiteResultCode && !existing.whiteResultCode) patch.whiteResultCode = whiteResultCode;

  const blackResultCode = typeof raw.black?.result === 'string' ? raw.black.result : undefined;
  if (blackResultCode && !existing.blackResultCode) patch.blackResultCode = blackResultCode;

  const termination = raw.pgn ? parsePgnHeader(raw.pgn, 'Termination') : undefined;
  if (termination && !existing.termination) patch.termination = termination;

  const finalFen = typeof raw.fen === 'string' ? raw.fen : undefined;
  if (finalFen && !existing.finalFen) patch.finalFen = finalFen;

  const openingUrl = typeof raw.eco === 'string' ? raw.eco : undefined;
  if (openingUrl && !existing.openingUrl) patch.openingUrl = openingUrl;

  const variant = typeof raw.rules === 'string' ? raw.rules : undefined;
  if (variant && !existing.variant) patch.variant = variant;

  const timeControl = typeof raw.time_control === 'string' ? raw.time_control : undefined;
  if (timeControl && !existing.timeControl) patch.timeControl = timeControl;

  const tournamentUrl = typeof raw.tournament === 'string' ? raw.tournament : undefined;
  if (tournamentUrl && !existing.tournamentUrl) patch.tournamentUrl = tournamentUrl;

  const matchUrl = typeof raw.match === 'string' ? raw.match : undefined;
  if (matchUrl && !existing.matchUrl) patch.matchUrl = matchUrl;

  if (existing.rated === undefined && typeof raw.rated === 'boolean') patch.rated = raw.rated;
  if (existing.startTime === undefined && typeof raw.start_time === 'number') patch.startTime = raw.start_time;
  if (existing.endTime === undefined && typeof raw.end_time === 'number') patch.endTime = raw.end_time;

  return Object.keys(patch).length > 0 ? patch : null;
}








async function processChesscomRescanItem(item: ChesscomRescanWorkItem): Promise<void> {
  const outcome = await fetchArchiveMonth(item.username, item.month, item.fetchImpl, item.sleepImpl);
  if (outcome.status === 'abandoned') return; // already logged by fetchArchiveMonth
  const rawGames = (outcome.status === 'ok' ? outcome.games : []) as ChesscomRescanRawGame[];

  const mergedGames: ImportedGame[] = [];
  for (const ref of item.refs) {
    let current = ref.game;
    const raw = findRawRescanMatch(rawGames, ref);
    if (raw) {
      const patch = mergeApprovedFields(current, raw);
      if (patch) {
        const updated: ImportedGame = { ...current, ...patch };
        try {



          const ok = await saveGameToIdb(updated);
          if (ok) {
            current = updated;
            item.callbacks.onGameUpdated(current.id, patch);
          } else {
            recordEnrichmentEvent('enrichment-rescan-write-failed', Severity.Error, {
              requestClass: 'account-monthly-archive', errorClass: 'idb-write-false',
            });
          }
        } catch (error) {
          recordEnrichmentEvent('enrichment-rescan-write-failed', Severity.Error, {
            requestClass: 'account-monthly-archive', errorClass: errorClass(error),
          });
        }
      }
    } else {
      recordEnrichmentEvent('enrichment-rescan-game-not-found', Severity.Warn, {
        requestClass: 'account-monthly-archive', month: item.month,
      });
    }
    mergedGames.push(current);
  }



  const missingDeltaRefs: DeltaGameRef[] = mergedGames
    .filter((g): g is ImportedGame & { uuid: string; timeClass: string } =>
      g.ratingDelta === undefined && g.uuid !== undefined && g.rated === true
      && g.timeClass !== undefined && g.timeClass !== 'daily')
    .map(g => ({ game: g, uuid: g.uuid, timeClass: g.timeClass }));

  if (missingDeltaRefs.length > 0) {
    const deltas = await computeDeltasForUsername(
      item.username, item.month, missingDeltaRefs, item.fetchImpl, item.sleepImpl, 'account-monthly-archive',
    );
    for (let i = 0; i < mergedGames.length; i++) {
      const delta = deltas.get(mergedGames[i]!.id);
      if (delta === undefined) continue;
      const updated: ImportedGame = { ...mergedGames[i]!, ratingDelta: delta };
      try {


        const ok = await saveGameToIdb(updated);
        if (ok) {
          mergedGames[i] = updated;
          item.callbacks.onGameUpdated(updated.id, { ratingDelta: delta });
        } else {
          recordEnrichmentEvent('enrichment-rescan-delta-write-failed', Severity.Error, {
            requestClass: 'game-record-update', errorClass: 'idb-write-false',
          });
        }
      } catch (error) {
        recordEnrichmentEvent('enrichment-rescan-delta-write-failed', Severity.Error, {
          requestClass: 'game-record-update', errorClass: errorClass(error),
        });
      }
    }
  }





  enqueueImportEnrichment(
    mergedGames,
    { onGameEnriched: (gameId, patch) => item.callbacks.onGameUpdated(gameId, patch) },
    { fetchImpl: item.fetchImpl, sleepImpl: item.sleepImpl },
  );
}

async function processProfileItem(item: ProfileWorkItem): Promise<void> {
  try {
    // getProfile() is cache-aware (7-day TTL) and swallows its own
    // fetch/parse failures, falling back to any stale cached record — see
    // src/import/profiles.ts. This call primes/refreshes that cache.
    await getProfile(item.platform, item.username, { fetchImpl: item.fetchImpl });
  } catch (error) {
    recordEnrichmentEvent('enrichment-profile-fetch-errored', Severity.Warn, {
      requestClass: 'opponent-profile', errorClass: errorClass(error),
    });
  }
}

/** Drains the shared queue strictly serially — one item's requests complete before the next starts. */
function runQueue(): void {
  if (activeRun) return;
  activeRun = (async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      try {
        if (item.kind === 'profile') await processProfileItem(item);
        else if (item.kind === 'chesscom-delta') await processChesscomDeltaItem(item);
        else await processChesscomRescanItem(item);
      } catch (error) {
        recordEnrichmentEvent('enrichment-queue-item-errored', Severity.Error, {
          requestClass: item.kind, errorClass: errorClass(error),
        });
      }
    }
    activeRun = null;
  })();
}










export function enqueueImportEnrichment(
  games: readonly ImportedGame[],
  callbacks: EnrichmentCallbacks,
  options: EnrichmentOptions = {},
): void {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? defaultSleep;

  const profileDedupe = new Set<string>();
  const deltaBuckets = new Map<string, ChesscomDeltaWorkItem>();

  for (const game of games) {
    const platform = game.source;
    if (platform !== 'chesscom' && platform !== 'lichess') continue; // PGN paste: no platform identity to enrich from
    const importedUsername = game.importedUsername;
    if (!importedUsername) continue;

    const white = game.white?.toLowerCase();
    const black = game.black?.toLowerCase();
    let opponentUsername: string | undefined;
    if (white === importedUsername) opponentUsername = game.black;
    else if (black === importedUsername) opponentUsername = game.white;
    if (!opponentUsername || opponentUsername.toLowerCase() === importedUsername) continue;

    const profileDedupeKey = `${platform}:${opponentUsername.toLowerCase()}`;
    if (!profileDedupe.has(profileDedupeKey)) {
      profileDedupe.add(profileDedupeKey);
      queue.push({ kind: 'profile', platform, username: opponentUsername, fetchImpl });
    }




    if (platform !== 'chesscom') continue;
    if (game.opponentRatingDelta !== undefined) continue;
    if (!game.rated || !game.timeClass || game.timeClass === 'daily') continue;
    if (game.endTime === undefined || !game.uuid) continue;

    const month = monthFromEpochSeconds(game.endTime);
    const bucketKey = `${opponentUsername.toLowerCase()}|${month}`;
    let bucket = deltaBuckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        kind: 'chesscom-delta',
        opponentUsername,
        month,
        refs: [],
        fetchImpl,
        sleepImpl,
        onGameEnriched: callbacks.onGameEnriched,
      };
      deltaBuckets.set(bucketKey, bucket);
    }
    bucket.refs.push({ game, uuid: game.uuid, timeClass: game.timeClass });
  }

  for (const bucket of deltaBuckets.values()) queue.push(bucket);
  runQueue();
}

/** Default cap for one opponent-delta backfill sweep — see enqueueOpponentDeltaBackfill. */
const DEFAULT_BACKFILL_LIMIT = 200;

export interface OpponentDeltaBackfillOptions extends EnrichmentOptions {
  /** Maximum games one sweep may enqueue (newest first). Defaults to DEFAULT_BACKFILL_LIMIT. */
  limit?: number;
}



















export function enqueueOpponentDeltaBackfill(
  games: readonly ImportedGame[],
  callbacks: EnrichmentCallbacks,
  options: OpponentDeltaBackfillOptions = {},
): number {
  const limit = options.limit ?? DEFAULT_BACKFILL_LIMIT;
  const candidates = games.filter(game => {
    if (game.source !== 'chesscom' || !game.importedUsername) return false;
    if (game.opponentRatingDelta !== undefined) return false;
    if (!game.rated || !game.timeClass || game.timeClass === 'daily') return false;
    if (game.endTime === undefined || !game.uuid) return false;
    const white = game.white?.toLowerCase();
    const black = game.black?.toLowerCase();
    const opponent = white === game.importedUsername ? game.black
      : black === game.importedUsername ? game.white
      : undefined;
    return opponent !== undefined && opponent.toLowerCase() !== game.importedUsername;
  });
  const selected = candidates
    .slice()
    .sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0))
    .slice(0, limit);
  if (selected.length > 0) enqueueImportEnrichment(selected, callbacks, options);
  return selected.length;
}

/**
 * Test-only helper: resolves once the in-memory queue has fully drained.
 * Production/UI code must never await this — the entire point of the queue
 * is to never block on it. Exposed purely so tests can assert post-drain
 * state deterministically instead of polling.
 */
export async function enrichmentQueueSettledForTests(): Promise<void> {
  while (activeRun) {
    await activeRun;
  }
}



export interface RescanCallbacks {
  /**
   * Invoked once ANY rescan-derived patch (merged approved fields, own-delta
   * recompute, or a handed-off opponent-delta patch from
   * enqueueImportEnrichment()) has been persisted through the normal
   * saveGameToIdb path. One callback covers the whole refresh action — the
   * caller only needs to patch its own in-memory copy of the game (if any)
   * and redraw; none of this data has a display surface yet (Track B is
   * capture-only), so a no-op callback is a valid, common case.
   */
  onGameUpdated: (gameId: string, patch: Partial<ImportedGame>) => void;
}

export interface RescanOptions extends EnrichmentOptions {}

export interface RescanSummary {
  /** Number of distinct (uuid-bearing) months found and queued for re-fetch. */
  monthsQueued: number;
  /** Number of already-imported, uuid-bearing games considered for this account. */
  gamesConsidered: number;
}




















export function enqueueAccountRescan(
  account: { platform: AccountPlatform; username: string },
  libraryGames: readonly ImportedGame[],
  callbacks: RescanCallbacks,
  options: RescanOptions = {},
): RescanSummary {
  if (account.platform !== 'chesscom') return { monthsQueued: 0, gamesConsidered: 0 };

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const username = account.username.trim().toLowerCase();

  const eligible = libraryGames.filter(g =>
    g.source === 'chesscom' && g.importedUsername === username
    && g.uuid !== undefined && g.endTime !== undefined,
  );

  const monthBuckets = new Map<string, RescanGameRef[]>();
  for (const game of eligible) {
    const month = monthFromEpochSeconds(game.endTime!);
    const refs = monthBuckets.get(month) ?? [];
    refs.push({ game, uuid: game.uuid! });
    monthBuckets.set(month, refs);
  }

  for (const [month, refs] of monthBuckets) {
    queue.push({ kind: 'chesscom-rescan', username, month, refs, fetchImpl, sleepImpl, callbacks });
  }
  runQueue();

  return { monthsQueued: monthBuckets.size, gamesConsidered: eligible.length };
}
