import { useState, useRef, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useGameLibrary, DEFAULT_FILTERS } from '../context/GameLibraryContext'
import ImportControls from './ImportControls'

// ── Tool list ─────────────────────────────────────────────────────────────────

const TOOLS = [
  { label: 'Puzzles',         to: '/puzzles'          },
  { label: 'Opening Trainer', to: '/opening-trainer'  },
  { label: 'Game Review',     to: '/game-review'      },
  { label: 'Stats Dashboard', to: '/stats'            },
]

const PLATFORMS = [
  { value: 'chesscom', label: 'Chess.com' },
  { value: 'lichess',  label: 'Lichess'   },
]

// ── TopNav ────────────────────────────────────────────────────────────────────

export default function TopNav() {
  const [toolsOpen,   setToolsOpen]   = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [mobileOpen,  setMobileOpen]  = useState(false)
  const toolsRef   = useRef(null)
  const location   = useLocation()

  const {
    platform, setPlatform,
    username, setUsername,
    filters,
    loading, error,
    importGames,
    games, hitCap, importedFor,
  } = useGameLibrary()

  // Close tools dropdown on outside click.
  useEffect(() => {
    if (!toolsOpen) return
    const onDown = (e) => {
      if (!toolsRef.current?.contains(e.target)) setToolsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [toolsOpen])

  // Close menus on route change.
  useEffect(() => {
    setToolsOpen(false)
    setMobileOpen(false)
  }, [location.pathname])

  const activeTool = TOOLS.find(t => location.pathname.startsWith(t.to))

  // Show a tinted Filters button when non-default filters are active.
  const hasActiveFilters =
    filters.timeControl !== DEFAULT_FILTERS.timeControl ||
    filters.dateRange   !== DEFAULT_FILTERS.dateRange

  const handleImport = (e) => {
    e.preventDefault()
    importGames()
  }

  return (
    <header className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">

      {/* ── Main bar ───────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">

        {/* Logo */}
        <NavLink
          to="/"
          className="shrink-0 font-bold text-lg tracking-wide text-white select-none mr-1"
        >
          Patzer<span className="text-green-400">Pro</span>
        </NavLink>

        {/* Tools dropdown */}
        <div className="relative shrink-0" ref={toolsRef}>
          <button
            onClick={() => setToolsOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium
                        transition-colors select-none
              ${toolsOpen || activeTool
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
          >
            <span>{activeTool?.label ?? 'Tools'}</span>
            <Chevron open={toolsOpen} />
          </button>

          {toolsOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-52 rounded-lg border border-gray-700
                            bg-gray-900 shadow-2xl overflow-hidden z-50">
              {TOOLS.map(({ label, to }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setToolsOpen(false)}
                  className={({ isActive }) =>
                    `block px-4 py-2.5 text-sm transition-colors
                    ${isActive
                      ? 'bg-gray-800 text-green-400 font-medium'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
              <div className="border-t border-gray-800">
                <NavLink
                  to="/admin"
                  onClick={() => setToolsOpen(false)}
                  className={({ isActive }) =>
                    `block px-4 py-2.5 text-sm transition-colors
                    ${isActive
                      ? 'bg-gray-800 text-green-400 font-medium'
                      : 'text-gray-500 hover:bg-gray-800 hover:text-gray-200'
                    }`
                  }
                >
                  Admin
                </NavLink>
              </div>
            </div>
          )}
        </div>

        {/* Spacer pushes import area to the right */}
        <div className="flex-1" />

        {/* ── Inline import area (desktop only) ─────────────────────────── */}
        <form
          onSubmit={handleImport}
          className="hidden md:flex items-center gap-2"
        >
          {/* Platform segmented control */}
          <div className="flex rounded-md overflow-hidden border border-gray-700 shrink-0">
            {PLATFORMS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setPlatform(value)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors
                  ${platform === value
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Username input — persists after import via shared context state.
              Autofill attributes prevent password managers treating this as a login field. */}
          <input
            type="text"
            name="chess-player-search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            data-form-type="other"
            data-lpignore="true"
            data-1p-ignore
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && e.target.blur()}
            placeholder={platform === 'chesscom' ? 'Chess.com username' : 'Lichess username'}
            disabled={loading}
            className="w-64 px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700
                       text-sm text-gray-100 placeholder-gray-500
                       focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/30
                       disabled:opacity-50 transition-colors"
          />

          {/* Import button */}
          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="shrink-0 px-3 py-1.5 rounded-md bg-green-700 text-white text-sm font-medium
                       hover:bg-green-600 active:bg-green-800
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors whitespace-nowrap"
          >
            {loading ? 'Loading…' : 'Import'}
          </button>

          {/* Loaded-games badge */}
          {importedFor && !loading && (
            <span
              title={
                hitCap
                  ? `${games.length} games loaded (cap reached) for ${importedFor}`
                  : `${games.length} games loaded for ${importedFor}`
              }
              className={`shrink-0 hidden lg:inline-flex items-center gap-1 px-2 py-0.5
                          rounded-full text-xs border select-none
                ${hitCap
                  ? 'bg-yellow-900/40 text-yellow-400 border-yellow-700/60'
                  : 'bg-green-900/40 text-green-400 border-green-800/60'
                }`}
            >
              {importedFor}
              <span className="text-gray-500">·</span>
              {games.length}{hitCap ? '+' : ''}
            </span>
          )}

          {/* Error indicator */}
          {error && !loading && (
            <span
              title={error}
              className="shrink-0 text-red-400 text-sm select-none cursor-default"
            >
              ⚠
            </span>
          )}

          {/* Filters toggle */}
          <button
            type="button"
            onClick={() => setFiltersOpen(o => !o)}
            title={filtersOpen ? 'Hide filters' : 'Show import filters'}
            className={`shrink-0 px-2.5 py-1.5 rounded-md text-xs font-medium
                        transition-colors border select-none
              ${filtersOpen
                ? 'border-green-700 bg-green-900/25 text-green-400'
                : hasActiveFilters
                  ? 'border-green-800/60 text-green-500 hover:border-green-700 hover:text-green-400'
                  : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
              }`}
          >
            Filters {filtersOpen ? '▲' : '▼'}
            {hasActiveFilters && !filtersOpen && (
              <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-green-500
                               align-middle -mt-0.5" />
            )}
          </button>
        </form>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(o => !o)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          className="md:hidden shrink-0 w-8 h-8 rounded flex items-center justify-center
                     text-gray-400 hover:bg-gray-800 hover:text-white transition-colors text-lg"
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* ── Filter panel — desktop, expandable ────────────────────────────── */}
      {filtersOpen && (
        <div className="hidden md:block border-t border-gray-800 bg-gray-900/80">
          <div className="max-w-7xl mx-auto px-4">
            <ImportControls />
          </div>
        </div>
      )}

      {/* ── Mobile menu ───────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-800 bg-gray-900">
          <div className="px-4 py-4 flex flex-col gap-5">

            {/* Tool links */}
            <nav className="flex flex-col gap-0.5">
              <p className="text-gray-600 text-xs font-medium uppercase tracking-wide px-3 mb-1">
                Tools
              </p>
              {TOOLS.map(({ label, to }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `px-3 py-2 rounded text-sm transition-colors
                    ${isActive
                      ? 'bg-gray-800 text-green-400 font-medium'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `px-3 py-2 rounded text-sm transition-colors
                  ${isActive
                    ? 'bg-gray-800 text-green-400 font-medium'
                    : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                  }`
                }
              >
                Admin
              </NavLink>
            </nav>

            {/* Mobile import */}
            <div className="border-t border-gray-800 pt-4">
              <p className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-3">
                Import Games
              </p>
              <form onSubmit={handleImport} className="flex flex-col gap-3">
                {/* Platform tabs */}
                <div className="flex rounded-md overflow-hidden border border-gray-700 self-start">
                  {PLATFORMS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPlatform(value)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors
                        ${platform === value
                          ? 'bg-gray-600 text-white'
                          : 'bg-gray-800 text-gray-400'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Username + button */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    name="chess-player-search"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={platform === 'chesscom' ? 'Chess.com username' : 'Lichess username'}
                    disabled={loading}
                    className="flex-1 px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700
                               text-sm text-gray-100 placeholder-gray-500
                               focus:outline-none focus:border-green-600 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={loading || !username.trim()}
                    className="px-4 py-1.5 rounded-md bg-green-700 text-white text-sm font-medium
                               hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed
                               transition-colors whitespace-nowrap shrink-0"
                  >
                    {loading ? '…' : 'Import'}
                  </button>
                </div>

                {/* Status / error */}
                {importedFor && !loading && (
                  <p className={`text-xs ${hitCap ? 'text-yellow-400' : 'text-green-500'}`}>
                    {games.length} games loaded for {importedFor}
                    {hitCap ? ' (cap reached)' : ''}
                  </p>
                )}
                {error && !loading && (
                  <p className="text-red-400 text-xs">{error}</p>
                )}
              </form>
            </div>

            {/* Mobile filters */}
            <div className="border-t border-gray-800 pt-4">
              <p className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-3">
                Filters
              </p>
              <ImportControls />
            </div>

          </div>
        </div>
      )}
    </header>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Chevron({ open }) {
  return (
    <svg
      className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}
