









import type { AccountPlatform } from '../accounts';
import { getPlayerProfile, putPlayerProfile, type PlayerProfileRecord } from '../idb';
import { record, Severity } from '../diagnostics';

/** ~7 days, matching the spec's profile-store TTL. */
export const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Chess.com API etiquette asks clients to identify themselves. Browsers treat
// `User-Agent` as a forbidden header name and silently drop it from `fetch()`,
// so this has no effect on in-browser requests today, but it is honored by
// any non-browser runtime and costs nothing to include (mirrors
// src/import/chesscom.ts CHESSCOM_USER_AGENT).
const CHESSCOM_USER_AGENT = 'ChessPatzer/1.0 (+https://chesspatzer.com; profile fetch)';

/** Injectable fetch type, for tests that stub network access. */
export type ProfileFetchFn = typeof fetch;

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function recordProfileFetchFailure(
  platform: AccountPlatform,
  message: string,
  metadata: Record<string, string | number | boolean | null>,
): void {
  record({
    kind: 'api',
    severity: Severity.Error,
    source: 'import.profiles',
    sourceTag: 'import',
    message,
    metadata: { platform, ...metadata },
    redactionClass: 'safe',
  });
}

/** `${platform}:${lowercased username}` — the player-profiles store key. */
export function profileKey(platform: AccountPlatform, username: string): string {
  return `${platform}:${username.trim().toLowerCase()}`;
}

/** A profile record is fresh if fetched within the TTL window. */
export function isProfileFresh(profile: PlayerProfileRecord, now: number = Date.now()): boolean {
  return now - profile.fetchedAt < PROFILE_TTL_MS;
}

type NormalizedProfile = Pick<PlayerProfileRecord, 'avatarUrl' | 'countryCode' | 'displayName'>;

interface ChesscomPlayerPayload {
  avatar?: unknown;
  country?: unknown;
  name?: unknown;
}

/**
 * chess.com's `country` field is a URL like
 * `https://api.chess.com/pub/country/US` — the store keeps only the ISO
 * suffix, per the owner's "country code" (not full URL) decision.
 */
function isoCountryFromChesscomUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const match = /\/country\/([A-Za-z]{2,3})\/?$/.exec(url);
  return match?.[1]?.toUpperCase();
}

function normalizeChesscomProfile(payload: ChesscomPlayerPayload): NormalizedProfile {
  const avatarUrl = typeof payload.avatar === 'string' ? payload.avatar : undefined;
  const countryCode = isoCountryFromChesscomUrl(payload.country);
  const displayName = typeof payload.name === 'string' && payload.name.trim() ? payload.name : undefined;
  return {
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(countryCode ? { countryCode } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

async function fetchChesscomProfilePayload(
  username: string,
  fetchImpl: ProfileFetchFn,
): Promise<ChesscomPlayerPayload | null> {
  let res: Response;
  try {
    res = await fetchImpl(`https://api.chess.com/pub/player/${username.toLowerCase()}`, {
      headers: { 'User-Agent': CHESSCOM_USER_AGENT },
    });
  } catch (error) {
    recordProfileFetchFailure('chesscom', 'Chess.com profile fetch failed', {
      errorClass: errorClass(error),
    });
    return null;
  }
  if (!res.ok) {
    recordProfileFetchFailure('chesscom', 'Chess.com profile fetch failed', {
      errorClass: 'http-error',
      httpStatus: res.status,
    });
    return null;
  }
  try {
    return await res.json() as ChesscomPlayerPayload;
  } catch (error) {
    recordProfileFetchFailure('chesscom', 'Chess.com profile parse failed', {
      errorClass: errorClass(error),
    });
    return null;
  }
}

interface LichessUserPayload {
  profile?: { flag?: unknown; realName?: unknown };
  title?: unknown;
}

/**
 * Lichess has no avatars (owner-confirmed, spec item 11): `avatarUrl` is
 * intentionally never populated for lichess profiles. Display name prefers
 * `profile.realName`, falling back to `title` (e.g. "GM"), matching what
 * lichess itself treats as public-facing identity beyond the username.
 */
function normalizeLichessProfile(payload: LichessUserPayload): NormalizedProfile {
  const countryCode = typeof payload.profile?.flag === 'string' && payload.profile.flag
    ? payload.profile.flag.toUpperCase()
    : undefined;
  const realName = typeof payload.profile?.realName === 'string' && payload.profile.realName.trim()
    ? payload.profile.realName
    : undefined;
  const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title : undefined;
  const displayName = realName ?? title;
  return {
    ...(countryCode ? { countryCode } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

async function fetchLichessProfilePayload(
  username: string,
  fetchImpl: ProfileFetchFn,
): Promise<LichessUserPayload | null> {
  let res: Response;
  try {
    res = await fetchImpl(`https://lichess.org/api/user/${username.toLowerCase()}`);
  } catch (error) {
    recordProfileFetchFailure('lichess', 'Lichess profile fetch failed', {
      errorClass: errorClass(error),
    });
    return null;
  }
  if (!res.ok) {
    recordProfileFetchFailure('lichess', 'Lichess profile fetch failed', {
      errorClass: 'http-error',
      httpStatus: res.status,
    });
    return null;
  }
  try {
    return await res.json() as LichessUserPayload;
  } catch (error) {
    recordProfileFetchFailure('lichess', 'Lichess profile parse failed', {
      errorClass: errorClass(error),
    });
    return null;
  }
}

/**
 * Fetch + normalize a platform profile into the approved store shape
 * (no `fetchedAt` yet — callers stamp that at write time). Returns `null` on
 * any network/HTTP/parse failure so callers never overwrite a cached value
 * with a fetch error (mirrors src/import/chesscom.ts fetchChesscomLifetimeBest).
 */
export async function fetchAndNormalizeProfile(
  platform: AccountPlatform,
  username: string,
  fetchImpl: ProfileFetchFn = fetch,
): Promise<Omit<PlayerProfileRecord, 'fetchedAt'> | null> {
  let normalized: NormalizedProfile | null;
  if (platform === 'chesscom') {
    const payload = await fetchChesscomProfilePayload(username, fetchImpl);
    normalized = payload ? normalizeChesscomProfile(payload) : null;
  } else {
    const payload = await fetchLichessProfilePayload(username, fetchImpl);
    normalized = payload ? normalizeLichessProfile(payload) : null;
  }
  if (!normalized) return null;
  return {
    key: profileKey(platform, username),
    platform,
    username: username.trim().toLowerCase(),
    ...normalized,
  };
}

export interface GetProfileOptions {
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchImpl?: ProfileFetchFn;
  /** Injectable clock for tests; defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Read-through profile lookup: returns the cached record if fresh, otherwise
 * fetches, normalizes, stores, and returns the refreshed record. On fetch
 * failure, falls back to a stale cached record (if any) rather than dropping
 * previously-known profile data.
 */
export async function getProfile(
  platform: AccountPlatform,
  username: string,
  options: GetProfileOptions = {},
): Promise<PlayerProfileRecord | undefined> {
  const key = profileKey(platform, username);
  const now = options.now ?? Date.now;
  const cached = await getPlayerProfile(key);
  if (cached && isProfileFresh(cached, now())) return cached;

  const fetchImpl = options.fetchImpl ?? fetch;
  const normalized = await fetchAndNormalizeProfile(platform, username, fetchImpl);
  if (!normalized) return cached;

  const updated: PlayerProfileRecord = { ...normalized, fetchedAt: now() };
  await putPlayerProfile(updated);
  return updated;
}


















export interface ChesscomSpeedStat {
  currentRating?: number;
  bestRating?: number;
  wins?: number;
  losses?: number;
  draws?: number;
}

/** Speeds chess.com's /stats endpoint reports last/best/record for. */
export type ChesscomStatsSpeed = 'rapid' | 'blitz' | 'bullet' | 'daily';

const CHESSCOM_STATS_SPEED_KEYS: Record<string, ChesscomStatsSpeed> = {
  chess_bullet: 'bullet',
  chess_blitz:  'blitz',
  chess_rapid:  'rapid',
  chess_daily:  'daily',
};

interface ChesscomStatEntry {
  last?: { rating?: unknown };
  best?: { rating?: unknown };
  record?: { win?: unknown; loss?: unknown; draw?: unknown };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Fetch + normalize per-speed current/best ratings and W/L/D records from
 * chess.com's `/pub/player/{user}/stats` endpoint, for IMPORTED ACCOUNTS
 * ONLY (spec item 16 — opponents get no stats fetch). Best-effort: returns
 * `null` on any network/HTTP/parse failure, matching
 * `fetchChesscomLifetimeBest`'s failure contract. Not yet called from any
 * live path — see the deferred-wiring note above.
 */
export async function fetchChesscomImportedAccountStats(
  username: string,
  fetchImpl: ProfileFetchFn = fetch,
): Promise<Partial<Record<ChesscomStatsSpeed, ChesscomSpeedStat>> | null> {
  let res: Response;
  try {
    res = await fetchImpl(`https://api.chess.com/pub/player/${username.toLowerCase()}/stats`, {
      headers: { 'User-Agent': CHESSCOM_USER_AGENT },
    });
  } catch (error) {
    recordProfileFetchFailure('chesscom', 'Chess.com account stats fetch failed', {
      errorClass: errorClass(error),
    });
    return null;
  }
  if (!res.ok) {
    recordProfileFetchFailure('chesscom', 'Chess.com account stats fetch failed', {
      errorClass: 'http-error',
      httpStatus: res.status,
    });
    return null;
  }
  let data: Record<string, ChesscomStatEntry>;
  try {
    data = await res.json() as Record<string, ChesscomStatEntry>;
  } catch (error) {
    recordProfileFetchFailure('chesscom', 'Chess.com account stats parse failed', {
      errorClass: errorClass(error),
    });
    return null;
  }
  const stats: Partial<Record<ChesscomStatsSpeed, ChesscomSpeedStat>> = {};
  for (const [statKey, speed] of Object.entries(CHESSCOM_STATS_SPEED_KEYS)) {
    const entry = data[statKey];
    if (!entry) continue;
    const currentRating = numberOrUndefined(entry.last?.rating);
    const bestRating = numberOrUndefined(entry.best?.rating);
    const wins = numberOrUndefined(entry.record?.win);
    const losses = numberOrUndefined(entry.record?.loss);
    const draws = numberOrUndefined(entry.record?.draw);
    if (
      currentRating === undefined && bestRating === undefined
      && wins === undefined && losses === undefined && draws === undefined
    ) continue;
    stats[speed] = {
      ...(currentRating !== undefined ? { currentRating } : {}),
      ...(bestRating !== undefined ? { bestRating } : {}),
      ...(wins !== undefined ? { wins } : {}),
      ...(losses !== undefined ? { losses } : {}),
      ...(draws !== undefined ? { draws } : {}),
    };
  }
  return Object.keys(stats).length > 0 ? stats : null;
}
