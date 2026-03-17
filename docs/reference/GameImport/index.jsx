import { useGameLibrary } from '../../context/GameLibraryContext'

/**
 * GameImport — scrollable game list that reads from GameLibraryContext.
 *
 * Import controls (username, filters, fetch trigger) live in the header
 * via ImportControls. This component is purely a display / selection list.
 */
export default function GameImport() {
  const { games, importedFor, selectedGame, selectGame, loading, hitCap } = useGameLibrary()

  if (loading) {
    return <p className="text-gray-500 text-sm px-1">Loading games…</p>
  }

  if (games.length === 0) {
    return (
      <p className="text-gray-600 text-sm px-1">
        Use <span className="text-gray-400">Import Games</span> in the header to load your games.
      </p>
    )
  }

  return (
    <div className="flex flex-col border border-gray-800 rounded-lg overflow-hidden">
      <div className="bg-gray-800/60 px-3 py-1.5 text-xs text-gray-400 border-b border-gray-800 flex items-center justify-between">
        <span>{importedFor}</span>
        <span className={hitCap ? 'text-yellow-500' : ''}>
          {hitCap ? `${games.length} games (cap reached)` : `${games.length} games`}
        </span>
      </div>

      <ul className="overflow-y-auto max-h-72 divide-y divide-gray-800/60">
        {games.map((game) => (
          <GameRow
            key={game.id}
            game={game}
            viewingAs={importedFor}
            isSelected={selectedGame?.id === game.id}
            onClick={() => selectGame(game)}
          />
        ))}
      </ul>
    </div>
  )
}

// ── GameRow ───────────────────────────────────────────────────────────────────

function GameRow({ game, viewingAs, isSelected, onClick }) {
  const isWhite  = game.white === viewingAs
  const opponent = isWhite ? game.black : game.white

  const outcome = (() => {
    if (game.result === '1/2-1/2') return 'draw'
    const userWon = (isWhite && game.result === '1-0') || (!isWhite && game.result === '0-1')
    return userWon ? 'win' : 'loss'
  })()

  const outcomeLabel = { win: 'W', loss: 'L', draw: 'D' }[outcome]
  const outcomeClass = {
    win:  'bg-green-800 text-green-200',
    loss: 'bg-red-900  text-red-300',
    draw: 'bg-gray-700 text-gray-300',
  }[outcome]

  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-left px-3 py-2 text-sm transition-colors
          ${isSelected
            ? 'bg-green-900/40 border-l-2 border-green-500'
            : 'hover:bg-gray-800/60 border-l-2 border-transparent'
          }`}
      >
        <div className="flex items-center gap-2">
          <span className={`shrink-0 w-5 h-5 rounded text-xs font-bold flex items-center justify-center ${outcomeClass}`}>
            {outcomeLabel}
          </span>

          <div className="flex-1 min-w-0">
            <span className="text-gray-100 font-medium truncate block">vs {opponent}</span>
            {game.opening && (
              <span className="text-gray-500 text-xs truncate block leading-tight">{game.opening}</span>
            )}
          </div>

          <div className="shrink-0 text-right">
            <span className="text-gray-400 text-xs block">{game.datePlayed?.slice(0, 10) ?? '—'}</span>
            {game.timeControl && (
              <span className="text-gray-600 text-xs block">{formatTimeControl(game.timeControl)}</span>
            )}
          </div>
        </div>
      </button>
    </li>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatTimeControl(tc) {
  if (!tc || tc === '-') return ''
  const [base, inc] = tc.split('+').map(Number)
  const mins = Math.floor(base / 60)
  const secs = base % 60
  const baseLabel = secs === 0 ? `${mins} min` : `${mins}:${String(secs).padStart(2, '0')}`
  return inc ? `${baseLabel} +${inc}` : baseLabel
}
