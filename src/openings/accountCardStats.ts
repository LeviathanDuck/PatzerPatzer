










import type { ChessAccount } from '../accounts';
import { loadGamesByAccountFromIdb } from '../idb';

export interface AccountRatingPoint { date: string; rating: number; }

export interface AccountSpeedStat {
  /** Count of this account's imported games at this speed (accountId-scoped, not username-scoped). */
  games: number;
  /** Most recent imported rating for the account at this speed, by ascending date. */
  current?: number;
  /** Max imported rating for the account at this speed — "imported peak", distinct from lifetimeBest. */
  peak?: number;
  /** Ascending-by-date rating series (account's rating only) for the card sparkline. */
  series: AccountRatingPoint[];
}

export interface AccountCardStats {
  bySpeed: Map<string, AccountSpeedStat>;
}

/** Card's primary speeds, always represented when present in the account's imported games. */
export const PRIMARY_CARD_SPEEDS = ['rapid', 'blitz'] as const;


const EXCLUDED_SPEEDS = new Set(['bullet', 'ultrabullet']);

/**
 * Computes per-speed games/current/peak/series for one registry account, scoped to that
 * account's canonical `username`. Reads only this account's games (indexed accountId query,
 * not a full-store scan) — cheap and safe to call per card render.
 *
 * Game count per speed is accountId-scoped (every record returned by
 * loadGamesByAccountFromIdb already belongs to this account). Rating extraction additionally
 * requires the game's white/black field to exactly match the account's lowercased canonical
 * username — if neither side matches (e.g. a display-name casing mismatch), the game still
 * counts toward `games` for that speed but is skipped for current/peak/series, never guessed.
 */
export async function computeAccountCardStats(account: ChessAccount): Promise<AccountCardStats> {
  const target = account.username.trim().toLowerCase();
  const records = await loadGamesByAccountFromIdb(account.id);

  // Ascending date sort — mirrors computeCardStats/extractRatingSeries in view.ts: the last
  // entry per speed (by date) is the most recent, used for `current`.
  const sorted = [...records].sort((a, b) => (a.date ?? '') < (b.date ?? '') ? -1 : 1);

  const bySpeed = new Map<string, AccountSpeedStat>();

  for (const g of sorted) {
    const tc = g.timeClass;
    if (!tc || EXCLUDED_SPEEDS.has(tc)) continue;

    if (!bySpeed.has(tc)) bySpeed.set(tc, { games: 0, series: [] });
    const sp = bySpeed.get(tc)!;
    sp.games++;

    const isWhite = g.white?.trim().toLowerCase() === target;
    const isBlack = g.black?.trim().toLowerCase() === target;
    if (!isWhite && !isBlack) continue;

    const myRating = isWhite ? g.whiteRating : g.blackRating;
    if (myRating === undefined || myRating === null) continue;

    if (sp.peak === undefined || myRating > sp.peak) sp.peak = myRating;
    sp.current = myRating;
    if (g.date) sp.series.push({ date: g.date, rating: myRating });
  }

  return { bySpeed };
}
