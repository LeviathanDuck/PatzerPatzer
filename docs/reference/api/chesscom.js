/**
 * Chess.com public API adapter.
 *
 * All functions are plain async — no React dependencies — so this module can
 * be used anywhere and swapped out without touching components.
 *
 * Companion adapters (e.g. lichess.js) must export the same public surface:
 *   fetchRecentGames(username, limit, filters) → Promise<{ games: NormalizedGame[], hitCap: boolean }>
 *
 * NormalizedGame shape:
 *   {
 *     id:          string   — unique identifier (game URL)
 *     pgn:         string   — full PGN string (for chess.js loadPgn)
 *     white:       string   — white player username (lowercase)
 *     black:       string   — black player username (lowercase)
 *     result:      '1-0' | '0-1' | '1/2-1/2'
 *     datePlayed:  string   — 'YYYY-MM-DD'
 *     timeControl: string   — raw time control string, e.g. '600', '180+2'
 *     opening:     string   — opening name, or ''
 *   }
 *
 * ImportFilters shape (same model used by all adapters):
 *   {
 *     timeControl: 'all' | 'bullet' | 'blitz' | 'rapid'
 *     dateRange:   '24h' | '1week' | '1month' | '3months' | '1year' | 'all' | 'custom'
 *     customFrom:  string  — 'YYYY-MM-DD', used when dateRange === 'custom'
 *     customTo:    string  — 'YYYY-MM-DD', used when dateRange === 'custom'
 *   }
 */

const BASE = 'https://api.chess.com/pub/player'

// ── low-level fetches ─────────────────────────────────────────────────────────

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) {
    const msg = res.status === 404
      ? `Chess.com: user not found`
      : `Chess.com API error ${res.status}`
    throw new Error(msg)
  }
  return res.json()
}

/** Returns archive URLs oldest-first, e.g. ["…/2023/01", "…/2023/02", …] */
async function fetchArchives(username) {
  const data = await getJson(`${BASE}/${username.toLowerCase()}/games/archives`)
  return data.archives ?? []
}

/** Returns the raw game array for one monthly archive URL. */
async function fetchArchiveGames(archiveUrl) {
  const data = await getJson(archiveUrl)
  return data.games ?? []
}

// ── PGN header parser ─────────────────────────────────────────────────────────

/** Extract all [Key "Value"] pairs from a PGN string. */
function parsePgnHeaders(pgn) {
  const headers = {}
  const re = /\[(\w+)\s+"([^"]*)"\]/g
  let m
  while ((m = re.exec(pgn)) !== null) headers[m[1]] = m[2]
  return headers
}

// ── result normalisation ──────────────────────────────────────────────────────

/**
 * Chess.com stores per-side results like "win", "resigned", "checkmated",
 * "timeout", "stalemate", "agreed", "repetition", "insufficient", etc.
 * Map to standard PGN result tokens.
 */
function normalizeResult(whiteResult, blackResult) {
  if (whiteResult === 'win') return '1-0'
  if (blackResult === 'win') return '0-1'
  return '1/2-1/2'
}

// ── date range helpers ────────────────────────────────────────────────────────

/** Resolve the filter's dateRange + customFrom into a Date lower bound, or null. */
function resolveDateFrom(dateRange, customFrom) {
  const now = new Date()
  switch (dateRange) {
    case '24h':     return new Date(now - 24 * 60 * 60 * 1000)
    case '1week':   return new Date(now - 7  * 24 * 60 * 60 * 1000)
    case '1month':  return new Date(now - 30 * 24 * 60 * 60 * 1000)
    case '3months': return new Date(now - 90 * 24 * 60 * 60 * 1000)
    case '1year':   return new Date(now - 365 * 24 * 60 * 60 * 1000)
    case 'custom':  return customFrom ? new Date(customFrom) : null
    default:        return null // 'all'
  }
}

/** Resolve the filter's dateRange + customTo into a Date upper bound, or null. */
function resolveDateTo(dateRange, customTo) {
  if (dateRange === 'custom' && customTo) return new Date(customTo + 'T23:59:59')
  return null
}

/**
 * Return true if the entire archive month falls before the dateFrom cutoff.
 * Archive URLs end with /YYYY/MM. Skipping early archives avoids unnecessary fetches.
 */
function isArchiveEntirelyBefore(archiveUrl, dateFrom) {
  const parts = archiveUrl.split('/')
  const mm   = parseInt(parts[parts.length - 1], 10)
  const yyyy = parseInt(parts[parts.length - 2], 10)
  // Last moment of this archive month
  const lastOfMonth = new Date(yyyy, mm, 0, 23, 59, 59) // day 0 of mm+1 = last day of mm
  return lastOfMonth < dateFrom
}

// ── filtering ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the raw Chess.com game object should be included.
 *
 * Hard rules (always applied):
 *   - rated game only
 *   - standard chess rules only (no variants)
 *   - no daily games
 *
 * Soft rules (from filters):
 *   - time control class matches (bullet / blitz / rapid / all)
 *   - end_time falls within [dateFrom, dateTo]
 */
function passesFilter(raw, timeControl, dateFrom, dateTo) {
  // Hard rules
  if (!raw.rated)              return false
  if (raw.rules !== 'chess')   return false
  if (raw.time_class === 'daily') return false

  // Time control filter
  if (timeControl !== 'all' && raw.time_class !== timeControl) return false

  // Date range filter — end_time is a Unix timestamp (seconds)
  if (dateFrom || dateTo) {
    const playedAt = new Date((raw.end_time ?? 0) * 1000)
    if (dateFrom && playedAt < dateFrom) return false
    if (dateTo   && playedAt > dateTo)   return false
  }

  return true
}

// ── normalisation ─────────────────────────────────────────────────────────────

/** Transform one raw Chess.com game object into a NormalizedGame. */
function normalizeGame(raw) {
  const headers = parsePgnHeaders(raw.pgn ?? '')

  // Date: PGN header "Date" is "YYYY.MM.DD"; convert to "YYYY-MM-DD".
  const datePlayed = (headers.Date ?? '').replace(/\./g, '-')

  // Opening: Chess.com puts the full name in an "Opening" PGN header.
  const opening = headers.Opening ?? ''

  return {
    id:          raw.url ?? `${raw.white?.username}-${raw.end_time}`,
    pgn:         raw.pgn ?? '',
    white:       (raw.white?.username ?? '').toLowerCase(),
    black:       (raw.black?.username ?? '').toLowerCase(),
    result:      normalizeResult(raw.white?.result, raw.black?.result),
    datePlayed,
    timeControl: raw.time_control ?? headers.TimeControl ?? '',
    opening,
  }
}

// ── public surface ────────────────────────────────────────────────────────────

/**
 * Fetch up to `limit` recent games for `username`, applying `filters`.
 * Always excludes non-rated games, variants, and daily chess.
 * Returns { games: NormalizedGame[], hitCap: boolean } where hitCap is true
 * when collection stopped because `limit` was reached (not because archives
 * were exhausted). Callers can use hitCap to tell users more games exist.
 */
export async function fetchRecentGames(username, limit = 250, filters = {}) {
  const {
    timeControl = 'all',
    dateRange   = 'all',
    customFrom  = '',
    customTo    = '',
  } = filters

  const archives = await fetchArchives(username)
  if (archives.length === 0) return { games: [], hitCap: false }

  const dateFrom  = resolveDateFrom(dateRange, customFrom)
  const dateTo    = resolveDateTo(dateRange, customTo)
  const collected = []

  for (let i = archives.length - 1; i >= 0 && collected.length < limit; i--) {
    // Skip entire months that are before our dateFrom cutoff.
    if (dateFrom && isArchiveEntirelyBefore(archives[i], dateFrom)) break

    const raw = await fetchArchiveGames(archives[i])

    // Archive is oldest-first; iterate newest-first.
    for (let j = raw.length - 1; j >= 0 && collected.length < limit; j--) {
      if (passesFilter(raw[j], timeControl, dateFrom, dateTo)) {
        collected.push(normalizeGame(raw[j]))
      }
    }
  }

  return { games: collected, hitCap: collected.length >= limit }
}
