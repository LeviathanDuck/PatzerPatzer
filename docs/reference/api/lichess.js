/**
 * Lichess API adapter — placeholder.
 *
 * Exports the same surface as chesscom.js so GameLibraryContext can swap
 * adapters with a single import swap:
 *
 *   fetchRecentGames(username, limit, filters)
 *     → Promise<{ games: NormalizedGame[], hitCap: boolean }>
 *
 * See chesscom.js for the NormalizedGame shape.
 */

// eslint-disable-next-line no-unused-vars
export async function fetchRecentGames(_username, _limit, _filters) {
  throw new Error('Lichess import is not yet implemented.')
}
