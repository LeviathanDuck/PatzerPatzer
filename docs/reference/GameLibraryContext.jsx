/**
 * GameLibraryContext — app-level shared state for imported games.
 *
 * All tools (Puzzles, Game Review, Opening Trainer…) can read from this
 * context to access the same imported game list and selected game without
 * each page owning its own fetch logic.
 *
 * State held here:
 *   platform     — 'chesscom' | 'lichess'
 *   username     — current import username
 *   filters      — ImportFilters object (see DEFAULT_FILTERS)
 *   games        — NormalizedGame[] from the last successful import
 *   importedFor  — the username that produced the current game list
 *   loading      — fetch in progress
 *   error        — last error message, or null
 *   selectedGame — the NormalizedGame the user has chosen to replay, or null
 */

import { createContext, useContext, useState, useCallback } from 'react'
import { fetchRecentGames as fetchChessCom } from '../api/chesscom'
import { fetchRecentGames as fetchLichess } from '../api/lichess'

// ── constants ─────────────────────────────────────────────────────────────────

/** Maximum number of games fetched per import. Increase here to raise the cap everywhere. */
export const IMPORT_LIMIT = 250

// ── filter defaults ───────────────────────────────────────────────────────────

export const DEFAULT_FILTERS = {
  timeControl: 'all',   // 'all' | 'bullet' | 'blitz' | 'rapid'
  dateRange:   '1month', // '24h' | '1week' | '1month' | '3months' | '1year' | 'all' | 'custom'
  customFrom:  '',       // 'YYYY-MM-DD', only used when dateRange === 'custom'
  customTo:    '',       // 'YYYY-MM-DD', only used when dateRange === 'custom'
}

// ── context ───────────────────────────────────────────────────────────────────

const GameLibraryContext = createContext(null)

export function GameLibraryProvider({ children }) {
  const [platform,     setPlatform]     = useState('chesscom')
  const [username,     setUsername]     = useState('')
  const [filters,      setFiltersState] = useState(DEFAULT_FILTERS)
  const [games,        setGames]        = useState([])
  const [importedFor,  setImportedFor]  = useState('')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const [selectedGame, setSelectedGame] = useState(null)
  const [hitCap,       setHitCap]       = useState(false)

  /** Update a single filter key without replacing the whole object. */
  const setFilter = useCallback((key, value) => {
    setFiltersState(prev => ({ ...prev, [key]: value }))
  }, [])

  /** Trigger a fetch using the current platform / username / filters. */
  const importGames = useCallback(async () => {
    const name = username.trim()
    if (!name) return

    setLoading(true)
    setError(null)
    setGames([])
    setHitCap(false)
    setSelectedGame(null)

    try {
      const fetcher        = platform === 'chesscom' ? fetchChessCom : fetchLichess
      const { games: result, hitCap: capped } = await fetcher(name, IMPORT_LIMIT, filters)

      if (result.length === 0) {
        setError(`No games found for "${name}" with the current filters.`)
      } else {
        setGames(result)
        setHitCap(capped)
        setImportedFor(name.toLowerCase())
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [platform, username, filters])

  /** Mark a game as the active selection (triggers board load in consuming pages). */
  const selectGame = useCallback((game) => {
    setSelectedGame(game)
  }, [])

  return (
    <GameLibraryContext.Provider value={{
      platform,     setPlatform,
      username,     setUsername,
      filters,      setFilter,
      games,
      importedFor,
      loading,
      error,
      selectedGame, selectGame,
      hitCap,
      importGames,
    }}>
      {children}
    </GameLibraryContext.Provider>
  )
}

export function useGameLibrary() {
  const ctx = useContext(GameLibraryContext)
  if (!ctx) throw new Error('useGameLibrary must be used inside <GameLibraryProvider>')
  return ctx
}
