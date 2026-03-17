import { useGameLibrary } from '../../context/GameLibraryContext'

/**
 * ImportControls — filter pill rows for the import panel.
 *
 * Renders only the time-control and date-range filter controls.
 * Platform selector, username input, and Import button are rendered
 * inline in TopNav so they remain visible in the main header bar.
 */

const TIME_CONTROLS = [
  { value: 'all',    label: 'All'    },
  { value: 'bullet', label: 'Bullet' },
  { value: 'blitz',  label: 'Blitz'  },
  { value: 'rapid',  label: 'Rapid'  },
]

const DATE_RANGES = [
  { value: '24h',     label: '24h'     },
  { value: '1week',   label: '1 week'  },
  { value: '1month',  label: '1 month' },
  { value: '3months', label: '3 mo'    },
  { value: '1year',   label: '1 year'  },
  { value: 'all',     label: 'All time'},
  { value: 'custom',  label: 'Custom'  },
]

export default function ImportControls() {
  const { filters, setFilter } = useGameLibrary()
  const isCustom = filters.dateRange === 'custom'

  return (
    <div className="flex flex-col gap-2 py-2.5">
      {/* Time control + date range pills */}
      <div className="flex flex-wrap items-center gap-4">

        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-xs mr-1">Time:</span>
          {TIME_CONTROLS.map(({ value, label }) => (
            <FilterPill
              key={value}
              active={filters.timeControl === value}
              onClick={() => setFilter('timeControl', value)}
            >
              {label}
            </FilterPill>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-xs mr-1">Date:</span>
          {DATE_RANGES.map(({ value, label }) => (
            <FilterPill
              key={value}
              active={filters.dateRange === value}
              onClick={() => setFilter('dateRange', value)}
            >
              {label}
            </FilterPill>
          ))}
        </div>
      </div>

      {/* Custom date inputs */}
      {isCustom && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-gray-500 text-xs">From:</span>
          <input
            type="date"
            value={filters.customFrom}
            onChange={e => setFilter('customFrom', e.target.value)}
            className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-200
                       text-xs focus:outline-none focus:border-green-600"
          />
          <span className="text-gray-500 text-xs">To:</span>
          <input
            type="date"
            value={filters.customTo}
            onChange={e => setFilter('customTo', e.target.value)}
            className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-200
                       text-xs focus:outline-none focus:border-green-600"
          />
        </div>
      )}
    </div>
  )
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-xs transition-colors
        ${active
          ? 'bg-green-800 text-green-100 font-medium'
          : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
        }`}
    >
      {children}
    </button>
  )
}
