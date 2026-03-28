// ---------------------------------------------------------------------------
// Puzzle V1 — Library view + round view with feedback and result states
// Adapted from lichess-org/lila: ui/puzzle/src/view/feedback.ts, after.ts
//
// Renders the top-level puzzle library surface and the puzzle round view
// with real-time feedback during play and result-state UI on solve/fail.
// ---------------------------------------------------------------------------

import { h, type VNode } from 'snabbdom';
import { renderCeval, renderPvBox, renderEngineSettings, setCevalFenOverride } from '../ceval/view';
import { protocol as sharedProtocol, engineEnabled, engineReady as sharedEngineReady, multiPv, analysisDepth } from '../engine/ctrl';
import {
  getLibraryCounts, getPuzzleRoundState, getActiveRoundCtrl,
  mountPuzzleBoard, destroyPuzzleBoard, mountIdleBoard, nextPuzzle, retryPuzzle,
  getOrCreateMeta, savePuzzleMeta, toggleFavorite,
  isRetrySessionActive, getRetryCount, getRetryIndex, getRetryQueue,
  startRetrySession, nextRetryPuzzle, loadRetryCount,
  getDueCount, loadDueCount, startDueSession,
  getPuzzleListState, openPuzzleList, closePuzzleList,
  filterPuzzleList, loadMorePuzzles, selectPuzzleFromList,
  loadMoreImportedShards, hasMoreImportedShards,
  startImportedSession,
  getImportedSessionError, clearImportedSessionError,
  getActiveSession, clearActiveSession,
  type LibraryCounts, type PuzzleListFilters, type PuzzleListState,
  type ActiveSession,
} from './ctrl';
import type { PuzzleRoundCtrl } from './ctrl';
import type { PuzzleDefinition, PuzzleSourceKind, SolveResult, PuzzleMoveQuality, PuzzleUserMeta } from './types';
import { parseFen, makeFen } from 'chessops/fen';
import { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';
import { makeSan } from 'chessops/san';

function sourceCard(
  title: string,
  description: string,
  count: number | undefined,
  sourceKind: PuzzleSourceKind,
  redraw: () => void,
): VNode {
  const loaded = count !== undefined;
  return h('div.puzzle-library__card', [
    h('div.puzzle-library__card-header', [
      h('h3.puzzle-library__card-title', title),
      h(
        'span.puzzle-library__card-count',
        loaded ? `${count} puzzle${count === 1 ? '' : 's'}` : 'loading\u2026',
      ),
    ]),
    h('p.puzzle-library__card-desc', description),
    h(
      'button.puzzle-library__card-action',
      {
        attrs: { disabled: !loaded || count === 0 },
        on: {
          click: () => {
            openPuzzleList(sourceKind, redraw);
          },
        },
      },
      'Browse',
    ),
  ]);
}

/** Render the library sidebar content (sources, due, retry). */
function renderLibrarySidebar(redraw: () => void): VNode {
  const counts = getLibraryCounts();
  const rCount = getRetryCount();
  const dCount = getDueCount();

  if (rCount === undefined) loadRetryCount(redraw);
  if (dCount === undefined) loadDueCount(redraw);

  return h('aside.puzzle__side.puzzle-library__sidebar', [
    h('h2.puzzle-library__title', 'Puzzle Library'),

    // Source cards
    sourceCard('Imported Puzzles', 'Puzzles from the Lichess database.',
      counts?.imported, 'imported-lichess', redraw),
    sourceCard('User Library', 'Puzzles from your reviewed games.',
      counts?.user, 'user-library', redraw),

    // Due for Review
    h('div.puzzle-library__section', [
      h('div.puzzle-library__section-header', [
        h('h3', 'Due for Review'),
        h('span.puzzle-library__count',
          dCount !== undefined ? `${dCount}` : '\u2026'),
      ]),
      h('button.button.puzzle-library__action', {
        attrs: { disabled: dCount === undefined || dCount === 0 },
        on: { click: () => { startDueSession(redraw); } },
      }, 'Review Due'),
    ]),

    // Retry Failed
    h('div.puzzle-library__section', [
      h('div.puzzle-library__section-header', [
        h('h3', 'Retry Failed'),
        h('span.puzzle-library__count',
          rCount !== undefined ? `${rCount}` : '\u2026'),
      ]),
      h('button.button.puzzle-library__action', {
        attrs: { disabled: rCount === undefined || rCount === 0 },
        on: { click: () => { startRetrySession(redraw); } },
      }, 'Start Retry'),
    ]),
  ]);
}

export function renderPuzzleLibrary(redraw: () => void): VNode {
  // Clear puzzle engine FEN override when back on library page
  setCevalFenOverride(null);
  _lastPuzzleEngineFen = '';

  const listState = getPuzzleListState();

  // Board-centered layout: sidebar on left, board always visible
  return h('div.puzzle-page', [
    h('div.puzzle.puzzle--library', [
      // Sidebar — shows browse pane when active, otherwise source cards
      listState
        ? renderInlineBrowsePane(listState, redraw)
        : renderLibrarySidebar(redraw),
      // Board area — idle decorative board, always visible
      h('div.puzzle__board.main-board', [
        h('div.cg-wrap', {
          key: 'puzzle-idle-board',
          hook: {
            insert: vnode => { mountIdleBoard(vnode.elm as HTMLElement); },
            destroy: () => { destroyPuzzleBoard(); },
          },
        }),
      ]),
    ]),
  ]);
}

// --- Puzzle list (browse) view ---

function sourceLabel(source: PuzzleSourceKind): string {
  return source === 'imported-lichess' ? 'Imported Puzzles' : 'User Library';
}

function renderPuzzleListFilterBar(
  ls: PuzzleListState,
  redraw: () => void,
): VNode {
  const filters = ls.filters;
  const isImported = ls.source === 'imported-lichess';

  const children: VNode[] = [];

  if (isImported) {
    // Rating range inputs
    children.push(
      h('label.puzzle-list__filter-label', 'Rating:'),
    );
    children.push(
      h('input.puzzle-list__filter-input', {
        attrs: {
          type: 'number',
          placeholder: 'Min',
          min: 0,
          max: 4000,
          step: 50,
        },
        props: { value: filters.ratingMin ?? '' },
        on: {
          change: (e: Event) => {
            const val = parseInt((e.target as HTMLInputElement).value, 10);
            const newFilters: PuzzleListFilters = { ...filters };
            if (isNaN(val)) delete newFilters.ratingMin; else newFilters.ratingMin = val;
            filterPuzzleList(newFilters, redraw);
          },
        },
      }),
    );
    children.push(
      h('span.puzzle-list__filter-sep', '\u2013'), // en dash
    );
    children.push(
      h('input.puzzle-list__filter-input', {
        attrs: {
          type: 'number',
          placeholder: 'Max',
          min: 0,
          max: 4000,
          step: 50,
        },
        props: { value: filters.ratingMax ?? '' },
        on: {
          change: (e: Event) => {
            const val = parseInt((e.target as HTMLInputElement).value, 10);
            const newFilters: PuzzleListFilters = { ...filters };
            if (isNaN(val)) delete newFilters.ratingMax; else newFilters.ratingMax = val;
            filterPuzzleList(newFilters, redraw);
          },
        },
      }),
    );

    // Theme dropdown
    if (ls.availableThemes.length > 0) {
      children.push(
        h('label.puzzle-list__filter-label', 'Theme:'),
      );
      children.push(
        h('select.puzzle-list__filter-select', {
          on: {
            change: (e: Event) => {
              const val = (e.target as HTMLSelectElement).value;
              const newFilters: PuzzleListFilters = { ...filters };
              if (val) newFilters.theme = val; else delete newFilters.theme;
              filterPuzzleList(newFilters, redraw);
            },
          },
        }, [
          h('option', { attrs: { value: '' } }, 'All themes'),
          ...ls.availableThemes.map(t =>
            h('option', {
              attrs: { value: t, selected: filters.theme === t },
            }, t),
          ),
        ]),
      );
    }
  }

  // Result count
  children.push(
    h('span.puzzle-list__filter-count', `${ls.filtered.length} matching`),
  );

  return h('div.puzzle-list__filters', children);
}

function renderPuzzleListRow(
  def: PuzzleDefinition,
  redraw: () => void,
): VNode {
  const cells: VNode[] = [];

  // Puzzle ID (shortened)
  const displayId = def.id.length > 20 ? def.id.slice(0, 18) + '\u2026' : def.id;
  cells.push(h('span.puzzle-list__row-id', displayId));

  // Rating (imported only)
  if (def.sourceKind === 'imported-lichess') {
    cells.push(h('span.puzzle-list__row-rating', `${def.rating}`));
  }

  // Themes (imported) or source reason (user)
  if (def.sourceKind === 'imported-lichess' && def.themes.length > 0) {
    const themeText = def.themes.slice(0, 3).join(', ');
    const more = def.themes.length > 3 ? ` +${def.themes.length - 3}` : '';
    cells.push(h('span.puzzle-list__row-themes', themeText + more));
  } else if (def.sourceKind === 'user-library' && def.sourceReason) {
    cells.push(h('span.puzzle-list__row-themes', def.sourceReason));
  }

  // Solution length
  cells.push(h('span.puzzle-list__row-moves', `${def.solutionLine.length} moves`));

  return h('div.puzzle-list__row', {
    on: {
      click: () => {
        selectPuzzleFromList(def.id, redraw);
      },
    },
  }, cells);
}

/** Inline browse pane — renders inside the sidebar so the board stays visible. */
function renderInlineBrowsePane(
  ls: PuzzleListState,
  redraw: () => void,
): VNode {
  if (ls.loading) {
    return h('aside.puzzle__side.puzzle-library__sidebar', [
      h('span.puzzle-list__loading', 'Loading puzzles\u2026'),
    ]);
  }

  // Imported puzzles: theme-first session builder
  if (ls.source === 'imported-lichess') {
    return renderImportedSessionBuilder(ls, redraw);
  }

  // User library: puzzle-row list (unchanged)
  const hasMore = ls.visible.length < ls.filtered.length;
  return h('aside.puzzle__side.puzzle-library__sidebar.puzzle-list', [
    h('div.puzzle-list__header', [
      h('a.puzzle-list__back', {
        on: { click: () => closePuzzleList(redraw) },
      }, '\u2190 Back'),
      h('h2.puzzle-list__title', sourceLabel(ls.source)),
      h('span.puzzle-list__count', `${ls.filtered.length} puzzle${ls.filtered.length === 1 ? '' : 's'}`),
    ]),
    renderPuzzleListFilterBar(ls, redraw),
    ls.filtered.length === 0
      ? h('div.puzzle-list__empty', 'No puzzles match the current filters.')
      : h('div.puzzle-list__scroll', [
          h('div.puzzle-list__row.puzzle-list__row--header', [
            h('span.puzzle-list__row-id', 'Puzzle'),
            h('span.puzzle-list__row-themes', 'Reason'),
            h('span.puzzle-list__row-moves', 'Moves'),
          ]),
          ...ls.visible.map(def => renderPuzzleListRow(def, redraw)),
          hasMore
            ? h('button.button.puzzle-list__load-more', {
                on: { click: () => loadMorePuzzles(redraw) },
              }, `Load More (${ls.visible.length} of ${ls.filtered.length})`)
            : null,
        ]),
  ]);
}

// --- Imported session builder: theme-first with category groups ---
// Adapted from lichess-org/lila: modules/puzzle/src/main/PuzzleTheme.scala categorized

/** Lichess-style theme categories. Themes not found in the manifest are hidden. */
const THEME_CATEGORIES: [string, string[]][] = [
  ['Motifs', [
    'fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck',
    'sacrifice', 'hangingPiece', 'trappedPiece', 'exposedKing',
    'attackingF2F7', 'capturingDefender', 'kingsideAttack', 'queensideAttack',
    'advancedPawn',
  ]],
  ['Advanced', [
    'attraction', 'clearance', 'deflection', 'interference', 'intermezzo',
    'quietMove', 'xRayAttack', 'zugzwang', 'defensiveMove',
    'discoveredCheck', 'collinearMove',
  ]],
  ['Mates', [
    'mate', 'mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5',
  ]],
  ['Mate Patterns', [
    'backRankMate', 'smotheredMate', 'hookMate', 'anastasiaMate',
    'arabianMate', 'bodenMate', 'dovetailMate', 'swallowstailMate',
    'morphysMate', 'operaMate', 'pillsburysMate',
  ]],
  ['Phases', [
    'opening', 'middlegame', 'endgame',
    'rookEndgame', 'bishopEndgame', 'pawnEndgame', 'knightEndgame',
    'queenEndgame', 'queenRookEndgame',
  ]],
  ['Special Moves', [
    'castling', 'enPassant', 'promotion', 'underPromotion',
  ]],
  ['Goals', [
    'equality', 'advantage', 'crushing',
  ]],
  ['Lengths', [
    'oneMove', 'short', 'long', 'veryLong',
  ]],
];

/** Session builder local state — persists across redraws via closure. */
let _selectedThemes: Set<string> = new Set();
let _selectedOpenings: Set<string> = new Set();
let _sessionRatingMin = 800;
let _sessionRatingMax = 2400;
let _sessionStarting = false;
let _sessionTab: 'themes' | 'openings' = 'themes';
let _openingSearch = '';
let _lastPuzzleEngineFen = '';

function renderImportedSessionBuilder(
  ls: PuzzleListState,
  redraw: () => void,
): VNode {
  const totalSelected = _selectedThemes.size + _selectedOpenings.size;

  return h('aside.puzzle__side.puzzle-library__sidebar.puzzle-list.puzzle-session', [
    h('div.puzzle-list__header', [
      h('a.puzzle-list__back', {
        on: { click: () => {
          _selectedThemes = new Set();
          _selectedOpenings = new Set();
          _openingSearch = '';
          _sessionStarting = false;
          _sessionTab = 'themes';
          closePuzzleList(redraw);
        }},
      }, '\u2190 Back'),
      h('h2.puzzle-list__title', 'Imported Puzzles'),
    ]),

    // Rating range sliders — stacked
    h('div.puzzle-session__rating', [
      h('label.puzzle-session__label', 'Rating Range'),
      h('div.puzzle-session__range-line', [
        h('span.puzzle-session__range-label', 'Min'),
        h('input.puzzle-session__range', {
          key: 'rating-min-slider',
          attrs: { type: 'range', min: 0, max: 3200, step: 50, value: _sessionRatingMin },
          props: { value: _sessionRatingMin },
          on: { input: (e: Event) => {
            const v = parseInt((e.target as HTMLInputElement).value, 10);
            _sessionRatingMin = Math.min(v, _sessionRatingMax - 50);
            redraw();
          }},
        }),
        h('input.puzzle-session__range-val', {
          key: 'rating-min-num',
          attrs: { type: 'number', min: 0, max: 3200, step: 50, value: _sessionRatingMin },
          props: { value: _sessionRatingMin },
          on: { change: (e: Event) => {
            const v = parseInt((e.target as HTMLInputElement).value, 10);
            if (!isNaN(v)) _sessionRatingMin = Math.max(0, Math.min(v, _sessionRatingMax - 50));
            redraw();
          }},
          hook: { update: (_old, vnode) => { (vnode.elm as HTMLInputElement).value = String(_sessionRatingMin); }},
        }),
      ]),
      h('div.puzzle-session__range-line', [
        h('span.puzzle-session__range-label', 'Max'),
        h('input.puzzle-session__range', {
          key: 'rating-max-slider',
          attrs: { type: 'range', min: 0, max: 3200, step: 50, value: _sessionRatingMax },
          props: { value: _sessionRatingMax },
          on: { input: (e: Event) => {
            const v = parseInt((e.target as HTMLInputElement).value, 10);
            _sessionRatingMax = Math.max(v, _sessionRatingMin + 50);
            redraw();
          }},
        }),
        h('input.puzzle-session__range-val', {
          key: 'rating-max-num',
          attrs: { type: 'number', min: 0, max: 3200, step: 50, value: _sessionRatingMax },
          props: { value: _sessionRatingMax },
          on: { change: (e: Event) => {
            const v = parseInt((e.target as HTMLInputElement).value, 10);
            if (!isNaN(v)) _sessionRatingMax = Math.min(3200, Math.max(v, _sessionRatingMin + 50));
            redraw();
          }},
          hook: { update: (_old, vnode) => { (vnode.elm as HTMLInputElement).value = String(_sessionRatingMax); }},
        }),
      ]),
    ]),

    // Start bar — always visible near top
    h('div.puzzle-session__start-bar', [
      h('span.puzzle-session__selection-hint',
        totalSelected > 0 ? `${totalSelected} selected` : 'All puzzles'),
      h('button.button.puzzle-session__start', {
        attrs: { disabled: _sessionStarting },
        on: { click: () => {
          _sessionStarting = true;
          clearImportedSessionError();
          redraw();
          startImportedSession(
            [..._selectedThemes],
            [..._selectedOpenings],
            _sessionRatingMin,
            _sessionRatingMax,
            redraw,
          ).finally(() => {
            _sessionStarting = false;
            redraw();
          });
        }},
      }, _sessionStarting ? 'Loading\u2026' : 'Start Puzzles'),
    ]),

    // Error message
    getImportedSessionError()
      ? h('div.puzzle-session__error', getImportedSessionError()!)
      : null,

    // Tab selector: Themes | Openings
    h('div.puzzle-session__tabs', [
      h('button.puzzle-session__tab', {
        class: { active: _sessionTab === 'themes' },
        on: { click: () => { _sessionTab = 'themes'; redraw(); }},
      }, `Themes${_selectedThemes.size > 0 ? ` (${_selectedThemes.size})` : ''}`),
      h('button.puzzle-session__tab', {
        class: { active: _sessionTab === 'openings' },
        on: { click: () => { _sessionTab = 'openings'; redraw(); }},
      }, `Openings${_selectedOpenings.size > 0 ? ` (${_selectedOpenings.size})` : ''}`),
    ]),

    // Tab content
    _sessionTab === 'themes'
      ? renderThemeList(ls, redraw)
      : renderOpeningList(ls, redraw),
  ]);
}

function renderThemeList(ls: PuzzleListState, redraw: () => void): VNode {
  const available = new Set(ls.availableThemes);
  return h('div.puzzle-session__themes', [
    ...THEME_CATEGORIES.map(([category, themes]) => {
      const visibleThemes = themes.filter(t => available.has(t));
      if (visibleThemes.length === 0) return null;
      return h('div.puzzle-session__category', [
        h('div.puzzle-session__category-label', category),
        ...visibleThemes.map(theme =>
          h('div.puzzle-session__theme-row', {
            class: { active: _selectedThemes.has(theme) },
            on: { click: () => {
              const s = new Set(_selectedThemes);
              if (s.has(theme)) s.delete(theme); else s.add(theme);
              _selectedThemes = s;
              redraw();
            }},
          }, [
            h('span.puzzle-session__checkbox', _selectedThemes.has(theme) ? '\u2611' : '\u2610'),
            h('span.puzzle-session__theme-name', formatThemeName(theme)),
          ]),
        ),
      ]);
    }).filter(Boolean) as VNode[],
  ]);
}

function renderOpeningList(ls: PuzzleListState, redraw: () => void): VNode {
  const query = _openingSearch.toLowerCase();
  const allOpenings = ls.availableOpenings;

  // Group openings by family (text before the first underscore variation)
  const filtered = query
    ? allOpenings.filter(o => formatOpeningName(o).toLowerCase().includes(query))
    : allOpenings;

  // Group by opening family (e.g. "Sicilian_Defense" from "Sicilian_Defense_Najdorf_Variation")
  const groups = new Map<string, string[]>();
  for (const o of filtered) {
    const parts = o.split('_');
    // Use first two words as family, or first word if only one
    const family = parts.length >= 2 ? `${parts[0]}_${parts[1]}` : parts[0]!;
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family)!.push(o);
  }

  return h('div.puzzle-session__themes', [
    // Search bar
    h('div.puzzle-session__search', [
      h('input.puzzle-session__search-input', {
        attrs: { type: 'text', placeholder: 'Search openings\u2026' },
        props: { value: _openingSearch },
        on: { input: (e: Event) => {
          _openingSearch = (e.target as HTMLInputElement).value;
          redraw();
        }},
      }),
    ]),
    filtered.length === 0
      ? h('div.puzzle-list__empty', 'No openings match your search.')
      : null,
    ...[...groups.entries()].map(([family, openings]) => {
      const allSelected = openings.every(o => _selectedOpenings.has(o));
      const someSelected = !allSelected && openings.some(o => _selectedOpenings.has(o));
      return h('div.puzzle-session__category', [
        h('div.puzzle-session__category-label.puzzle-session__category-label--clickable', {
          class: { active: allSelected, partial: someSelected },
          on: { click: () => {
            const s = new Set(_selectedOpenings);
            if (allSelected) {
              for (const o of openings) s.delete(o);
            } else {
              for (const o of openings) s.add(o);
            }
            _selectedOpenings = s;
            redraw();
          }},
        }, [
          h('span.puzzle-session__checkbox',
            allSelected ? '\u2611' : someSelected ? '\u2610' : '\u2610'),
          h('span', formatOpeningName(family)),
        ]),
        ...openings.map(opening =>
          h('div.puzzle-session__theme-row', {
            class: { active: _selectedOpenings.has(opening) },
            on: { click: () => {
              const s = new Set(_selectedOpenings);
              if (s.has(opening)) s.delete(opening); else s.add(opening);
              _selectedOpenings = s;
              redraw();
            }},
          }, [
            h('span.puzzle-session__checkbox', _selectedOpenings.has(opening) ? '\u2611' : '\u2610'),
            h('span.puzzle-session__theme-name', formatOpeningName(opening)),
          ]),
        ),
      ]);
    }),
  ]);
}

/** Convert underscore-separated opening tag to readable label. */
function formatOpeningName(tag: string): string {
  return tag.replace(/_/g, ' ');
}

/** Convert camelCase theme id to readable label. */
function formatThemeName(theme: string): string {
  // mateIn1 -> Mate In 1, backRankMate -> Back Rank Mate
  return theme
    .replace(/([A-Z])/g, ' $1')
    .replace(/(\d+)/g, ' $1')
    .replace(/^ /, '')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// --- Puzzle round view ---

let _puzzleInfoExpanded = false;

function renderPuzzleInfo(def: PuzzleDefinition, redraw: () => void): VNode {
  const rating = def.sourceKind === 'imported-lichess' ? `${def.rating}` : null;

  // Collapsed: just show rating
  if (!_puzzleInfoExpanded) {
    return h('div.puzzle-info', [
      h('div.puzzle-info__summary', {
        on: { click: () => { _puzzleInfoExpanded = true; redraw(); }},
      }, [
        rating ? h('span.puzzle-info__rating', `Rating ${rating}`) : null,
        h('span.puzzle-info__expand', '\u25BC'),
      ]),
    ]);
  }

  // Expanded: full details
  const rows: VNode[] = [];
  const sourceLabel = def.sourceKind === 'imported-lichess' ? 'Imported (Lichess)' : 'User Library';
  rows.push(h('tr', [h('td.puzzle-round__label', 'Source'), h('td', sourceLabel)]));
  if (rating) rows.push(h('tr', [h('td.puzzle-round__label', 'Rating'), h('td', rating)]));
  rows.push(h('tr', [h('td.puzzle-round__label', 'Moves'), h('td', `${def.solutionLine.length}`)]));
  if (def.sourceKind === 'imported-lichess') {
    if (def.themes.length > 0) rows.push(h('tr', [h('td.puzzle-round__label', 'Themes'), h('td', def.themes.join(', '))]));
    if (def.lichessPuzzleId) rows.push(h('tr', [h('td.puzzle-round__label', 'Lichess ID'), h('td', def.lichessPuzzleId)]));
  } else {
    if (def.title) rows.push(h('tr', [h('td.puzzle-round__label', 'Title'), h('td', def.title)]));
    if (def.sourceReason) rows.push(h('tr', [h('td.puzzle-round__label', 'Reason'), h('td', def.sourceReason)]));
    if (def.sourceGameId) rows.push(h('tr', [h('td.puzzle-round__label', 'Source game'), h('td', def.sourceGameId)]));
  }
  rows.push(h('tr', [h('td.puzzle-round__label', 'FEN'), h('td.puzzle-round__fen', def.startFen)]));

  return h('div.puzzle-info', [
    h('div.puzzle-info__summary', {
      on: { click: () => { _puzzleInfoExpanded = false; redraw(); }},
    }, [
      rating ? h('span.puzzle-info__rating', `Rating ${rating}`) : null,
      h('span.puzzle-info__expand', '\u25B2'),
    ]),
    h('table.puzzle-round__info', rows),
  ]);
}

// --- Feedback panel ---
// Adapted from lichess-org/lila: ui/puzzle/src/view/feedback.ts
// Shows real-time per-move feedback during play and result states after.

function solveResultLabel(result: SolveResult): string {
  switch (result) {
    case 'clean-solve': return 'Solved!';
    case 'recovered-solve': return 'Solved (with recovery)';
    case 'assisted-solve': return 'Solved (with assistance)';
    case 'failed': return 'Puzzle failed';
    case 'skipped': return 'Skipped';
  }
}

function renderFeedbackPanel(rc: PuzzleRoundCtrl, redraw: () => void): VNode {
  // --- Post-solve/fail viewing mode ---
  if (rc.mode === 'view') {
    if (rc.status === 'solved') return renderSolvedFeedback(rc, redraw);
    if (rc.status === 'failed') return renderFailedFeedback(rc, redraw);
    return h('div.puzzle__feedback.viewing', [
      h('div.puzzle__feedback__message', 'Viewing puzzle'),
    ]);
  }

  // --- Active play (mode = 'play' or 'try') ---
  return renderPlayingFeedback(rc, redraw);
}

/**
 * Feedback during active play — "Your turn" prompt, correct/wrong transients.
 * Adapted from lichess-org/lila: ui/puzzle/src/view/feedback.ts initial/good/fail
 */
function renderPlayingFeedback(rc: PuzzleRoundCtrl, redraw: () => void): VNode {
  // Correct move — "Best move!"
  if (rc.feedback === 'good') {
    return h('div.puzzle__feedback.good', [
      h('div.puzzle__feedback__player', [
        h('div.puzzle__feedback__icon', '\u2713'),
        h('div.puzzle__feedback__instruction', [
          h('strong', 'Best move!'),
          h('em', 'Keep going\u2026'),
        ]),
      ]),
    ]);
  }

  // Wrong move — "Not the move. Try something else."
  // Adapted from lichess-org/lila: ui/puzzle/src/view/feedback.ts fail()
  if (rc.feedback === 'fail') {
    return h('div.puzzle__feedback.fail', [
      h('div.puzzle__feedback__player', [
        h('div.puzzle__feedback__icon.puzzle__feedback__icon--fail', '\u2717'),
        h('div.puzzle__feedback__instruction', [
          h('strong', 'Not the move'),
          h('em', 'Try something else.'),
        ]),
      ]),
      renderViewSolutionButtons(rc, redraw),
    ]);
  }

  // Default: "Your turn" prompt
  const colorLabel = rc.pov === 'white' ? 'White' : 'Black';
  return h('div.puzzle__feedback.play', [
    h('div.puzzle__feedback__player', [
      h('div.puzzle__feedback__icon.puzzle__feedback__icon--turn', '\u265A'),
      h('div.puzzle__feedback__instruction', [
        h('strong', 'Your turn'),
        h('em', `Find the best move for ${colorLabel}.`),
      ]),
    ]),
    renderViewSolutionButtons(rc, redraw),
  ]);
}

/**
 * Hint + View Solution buttons, shown during play/try modes.
 * Adapted from lichess-org/lila: ui/puzzle/src/view/feedback.ts viewSolution()
 */
function renderViewSolutionButtons(rc: PuzzleRoundCtrl, redraw: () => void): VNode {
  return h('div.puzzle__feedback__actions', [
    h('button.button.button-empty.puzzle__hint', {
      on: { click: () => { rc.useHint(redraw); } },
    }, rc.usedHint ? 'Hint used' : 'Get a hint'),
    rc.canViewSolution
      ? h('button.button.button-empty.puzzle__reveal', {
          on: { click: () => { rc.viewSolution(redraw); } },
        }, 'View the solution')
      : null,
  ]);
}

// --- Move quality summary ---
// Renders a read-only summary of the solver's move qualities after a round ends.
// All eval deltas are displayed from the solver's perspective: positive cpLoss
// means the solver's position got worse.

const QUALITY_COLORS: Record<PuzzleMoveQuality['quality'], string> = {
  best:       '#22c55e', // green
  good:       '#86efac', // light green
  inaccuracy: '#eab308', // yellow
  mistake:    '#f97316', // orange
  blunder:    '#ef4444', // red
};

const QUALITY_LABELS: Record<PuzzleMoveQuality['quality'], string> = {
  best:       'Best',
  good:       'Good',
  inaccuracy: 'Inaccuracy',
  mistake:    'Mistake',
  blunder:    'Blunder',
};

function formatCpLoss(cpLoss: number): string {
  // cpLoss is from solver's perspective: positive = lost centipawns (bad).
  // Show as pawn units. Negative would mean position improved (rare for non-best).
  const pawns = cpLoss / 100;
  if (pawns <= 0) return `+${Math.abs(pawns).toFixed(1)}`;
  return `\u2212${pawns.toFixed(1)}`; // minus sign + value
}

function renderMoveQualityRow(mq: PuzzleMoveQuality, san: string): VNode {
  const color = QUALITY_COLORS[mq.quality];
  const label = QUALITY_LABELS[mq.quality];

  const cells: VNode[] = [];

  // Move label in SAN
  cells.push(h('span.puzzle__mq-move', san));

  // Quality badge
  cells.push(
    h('span.puzzle__mq-badge', {
      style: {
        backgroundColor: color,
        color: mq.quality === 'good' ? '#1a1a1a' : '#fff',
      },
    }, label),
  );

  // Matched checkmark or contextual note
  if (mq.matched) {
    cells.push(h('span.puzzle__mq-check', '\u2713'));
  } else if (mq.quality === 'good') {
    cells.push(h('span.puzzle__mq-note', 'Not the solution, but a good move'));
  }

  // Centipawn loss (if available), displayed as pawn units
  if (mq.cpLoss !== undefined) {
    const formatted = formatCpLoss(mq.cpLoss);
    cells.push(h('span.puzzle__mq-cp', `${formatted} pawns`));
  }

  return h('div.puzzle__mq-row', cells);
}

function uciToSanFromFen(fen: string | undefined, uci: string): string {
  if (!fen) return uci;
  const setup = parseFen(fen);
  if (setup.isErr) return uci;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return uci;
  const move = parseUci(uci);
  if (!move) return uci;
  try { return makeSan(pos.value, move); } catch { return uci; }
}

function renderMoveQualitySummary(moveQualities: PuzzleMoveQuality[], _def: PuzzleDefinition): VNode | null {
  // Only show moves that were accepted (matched the solution) — skip retried wrong moves
  const accepted = moveQualities.filter(mq => mq.matched);
  if (accepted.length === 0) return null;

  return h('div.puzzle__mq-summary', [
    h('div.puzzle__mq-header', 'Move Quality'),
    ...accepted.map(mq => renderMoveQualityRow(mq, uciToSanFromFen(mq.fenBefore, mq.playedUci))),
  ]);
}

/**
 * Result state after successful solve.
 * Adapted from lichess-org/lila: ui/puzzle/src/view/after.ts (win path)
 */
function renderSolvedFeedback(rc: PuzzleRoundCtrl, redraw: () => void): VNode {
  const result = rc.status === 'solved'
    ? (rc.usedHint || rc.usedEngineReveal || rc.revealedSolution
        ? 'assisted-solve'
        : rc.failureReasons.length > 0 ? 'recovered-solve' : 'clean-solve')
    : 'failed';

  return h('div.puzzle__feedback.after.solved', [
    h('div.puzzle__feedback__result', [
      h('div.puzzle__feedback__icon.puzzle__feedback__icon--success', '\u2713'),
      h('div.puzzle__feedback__message', [
        h('strong', solveResultLabel(result as SolveResult)),
        result === 'clean-solve'
          ? h('em', 'Perfect - no mistakes!')
          : result === 'recovered-solve'
          ? h('em', 'You recovered after a wrong move.')
          : h('em', 'You used assistance to find the solution.'),
      ]),
    ]),
    h('div.puzzle__feedback__actions', [
      h('button.button.button-empty.puzzle__engine-lines', {
        attrs: { disabled: rc.puzzleEngineEnabled },
        on: { click: () => { rc.showEngineLines(redraw); } },
      }, rc.puzzleEngineEnabled ? 'Engine active' : 'Engine Lines'),
      h('button.button.button-empty.puzzle__engine-arrows', {
        on: { click: () => { rc.showEngineArrows(redraw); } },
      }, 'Engine Arrows'),
    ]),
    renderMoveQualitySummary(rc.moveQualities, rc.definition),
    renderNextNav(redraw),
  ]);
}

/**
 * Result state after failure.
 * Shows what the correct move was and offers retry/next/back.
 * Adapted from lichess-org/lila: ui/puzzle/src/view/after.ts (loss path)
 */
function renderFailedFeedback(rc: PuzzleRoundCtrl, redraw: () => void): VNode {
  const skipped = rc.failureReasons.includes('skip-pressed');

  // Show the expected correct move in SAN
  const expectedUci = rc.solutionLine[rc.progressPly];
  let correctMoveNote: string | undefined;
  if (expectedUci) {
    // Compute position at current progress to convert UCI to SAN
    const allMoves: string[] = [];
    if (rc.definition.triggerMove) allMoves.push(rc.definition.triggerMove);
    allMoves.push(...rc.solutionLine.slice(0, rc.progressPly));
    const setupResult = parseFen(rc.definition.startFen);
    let san = expectedUci;
    if (setupResult.isOk) {
      const posResult = Chess.fromSetup(setupResult.value);
      if (posResult.isOk) {
        const pos = posResult.value;
        for (const uci of allMoves) {
          const m = parseUci(uci);
          if (m) pos.play(m);
        }
        const expectedParsed = parseUci(expectedUci);
        if (expectedParsed) san = makeSan(pos, expectedParsed);
      }
    }
    correctMoveNote = `The correct move was ${san}.`;
  }

  return h('div.puzzle__feedback.after.failed', [
    h('div.puzzle__feedback__result', [
      h('div.puzzle__feedback__icon.puzzle__feedback__icon--fail', '\u2717'),
      h('div.puzzle__feedback__message', [
        h('strong', skipped ? 'Puzzle skipped' : 'Puzzle failed'),
        correctMoveNote ? h('em', correctMoveNote) : null,
      ]),
    ]),
    h('div.puzzle__feedback__actions', [
      !rc.revealedSolution
        ? h('button.button.button-empty.puzzle__reveal', {
            on: { click: () => { rc.revealSolution(redraw); } },
          }, 'Show Solution')
        : null,
      h('button.button.button-empty.puzzle__engine-lines', {
        attrs: { disabled: rc.puzzleEngineEnabled },
        on: { click: () => { rc.showEngineLines(redraw); } },
      }, rc.puzzleEngineEnabled ? 'Engine active' : 'Engine Lines'),
      h('button.button.button-empty.puzzle__engine-arrows', {
        on: { click: () => { rc.showEngineArrows(redraw); } },
      }, 'Engine Arrows'),
    ]),
    renderMoveQualitySummary(rc.moveQualities, rc.definition),
    h('div.puzzle__feedback__nav', [
      h('button.button.puzzle__retry', {
        on: { click: () => { retryPuzzle(redraw); } },
      }, 'Try Again'),
      ...renderNextNavChildren(redraw),
    ]),
  ]);
}

// --- Shared next-puzzle navigation ---
// When a retry session is active, "Next Puzzle" advances through the retry
// queue. Otherwise it falls back to the default random-next behavior.

function renderNextNavChildren(redraw: () => void): VNode[] {
  const inRetry = isRetrySessionActive();
  const nextFn = inRetry ? nextRetryPuzzle : nextPuzzle;
  const idx = getRetryIndex();
  const total = getRetryQueue().length;

  const children: VNode[] = [];

  if (inRetry) {
    children.push(
      h('span.puzzle__retry-progress', `Retry ${idx + 1} of ${total}`),
    );
  }

  children.push(
    h('button.button.button-empty.puzzle__next', {
      on: { click: () => { nextFn(redraw); } },
    }, inRetry
      ? (idx + 1 >= total ? 'Finish Retry Session' : 'Next Retry Puzzle')
      : 'Next Puzzle',
    ),
  );

  children.push(
    h('a.puzzle__back-link', { attrs: { href: '#/puzzles' } }, 'Back to Library'),
  );

  return children;
}

function renderNextNav(redraw: () => void): VNode {
  return h('div.puzzle__feedback__nav', renderNextNavChildren(redraw));
}

// --- Metadata editing panel ---
// Minimal organization surface: favorite toggle, notes, tags, folders.
// All changes are auto-saved to IDB via PuzzleUserMeta persistence.

function renderMetaPanel(puzzleId: string, redraw: () => void): VNode {
  const meta = getOrCreateMeta(puzzleId);

  return h('div.puzzle-meta', [
    // Favorite toggle
    h('div.puzzle-meta__row.puzzle-meta__favorite', [
      h('button.puzzle-meta__fav-btn', {
        class: { 'puzzle-meta__fav-btn--active': meta.favorite },
        attrs: { title: meta.favorite ? 'Remove from favorites' : 'Add to favorites' },
        on: { click: () => { toggleFavorite(puzzleId, redraw); } },
      }, meta.favorite ? '\u2665' : '\u2661'), // filled heart / empty heart
      h('span.puzzle-meta__fav-label', meta.favorite ? 'Favorited' : 'Favorite'),
    ]),

    // Notes textarea
    h('div.puzzle-meta__row', [
      h('label.puzzle-meta__label', { attrs: { for: `puzzle-notes-${puzzleId}` } }, 'Notes'),
      h('textarea.puzzle-meta__notes', {
        attrs: {
          id: `puzzle-notes-${puzzleId}`,
          rows: 3,
          placeholder: 'Add notes about this puzzle\u2026',
        },
        props: { value: meta.notes ?? '' },
        on: {
          blur: (e: Event) => {
            const val = (e.target as HTMLTextAreaElement).value.trim();
            if ((meta.notes ?? '') !== val) {
              if (val) meta.notes = val; else delete meta.notes;
              savePuzzleMeta(meta);
            }
          },
        },
      }),
    ]),

    // Tags (comma-separated)
    h('div.puzzle-meta__row', [
      h('label.puzzle-meta__label', { attrs: { for: `puzzle-tags-${puzzleId}` } }, 'Tags'),
      h('input.puzzle-meta__tags', {
        attrs: {
          id: `puzzle-tags-${puzzleId}`,
          type: 'text',
          placeholder: 'tag1, tag2, tag3',
        },
        props: { value: (meta.tags ?? []).join(', ') },
        on: {
          blur: (e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            const tags = raw.split(',').map(t => t.trim()).filter(Boolean);
            if (tags.length > 0) meta.tags = tags; else delete meta.tags;
            savePuzzleMeta(meta);
          },
        },
      }),
    ]),

    // Folders / collections
    renderFoldersEditor(meta, redraw),
  ]);
}

function renderFoldersEditor(meta: PuzzleUserMeta, redraw: () => void): VNode {
  return h('div.puzzle-meta__row.puzzle-meta__folders', [
    h('label.puzzle-meta__label', 'Collections'),
    // Current folder list with remove buttons
    meta.folders.length > 0
      ? h('div.puzzle-meta__folder-list', meta.folders.map(folder =>
          h('span.puzzle-meta__folder-pill', [
            folder,
            h('button.puzzle-meta__folder-remove', {
              attrs: { title: `Remove from "${folder}"` },
              on: {
                click: () => {
                  meta.folders = meta.folders.filter(f => f !== folder);
                  savePuzzleMeta(meta);
                  redraw();
                },
              },
            }, '\u00d7'), // multiplication sign as X
          ]),
        ))
      : h('span.puzzle-meta__folder-empty', 'No collections'),
    // Add to folder input
    h('input.puzzle-meta__folder-input', {
      attrs: {
        type: 'text',
        placeholder: 'Add to collection\u2026',
      },
      props: { value: '' },
      on: {
        keydown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            const input = e.target as HTMLInputElement;
            const name = input.value.trim();
            if (name && !meta.folders.includes(name)) {
              meta.folders = [...meta.folders, name];
              savePuzzleMeta(meta);
            }
            input.value = '';
            redraw();
          }
        },
      },
    }),
  ]);
}

/** Convert the current expected move from UCI to SAN for display. */
function expectedMoveSan(rc: PuzzleRoundCtrl): string {
  const uci = rc.currentExpectedMove();
  if (!uci) return 'complete';
  const allMoves: string[] = [];
  if (rc.definition.triggerMove) allMoves.push(rc.definition.triggerMove);
  allMoves.push(...rc.solutionLine.slice(0, rc.progressPly));
  const setupResult = parseFen(rc.definition.startFen);
  if (setupResult.isErr) return uci;
  const posResult = Chess.fromSetup(setupResult.value);
  if (posResult.isErr) return uci;
  const pos = posResult.value;
  for (const m of allMoves) {
    const parsed = parseUci(m);
    if (parsed) pos.play(parsed);
  }
  const move = parseUci(uci);
  return move ? makeSan(pos, move) : uci;
}

// --- Puzzle move list ---
// Shows moves played so far without revealing future solution moves.
// Adapted from lichess-org/lila: ui/puzzle/src/view/tree.ts (puzzle replay)

function computeSanMoves(startFen: string, uciMoves: string[]): string[] {
  const sans: string[] = [];
  const setup = parseFen(startFen);
  if (setup.isErr) return sans;
  const posResult = Chess.fromSetup(setup.value);
  if (posResult.isErr) return sans;
  const pos = posResult.value;
  for (const uci of uciMoves) {
    const move = parseUci(uci);
    if (!move) break;
    sans.push(makeSan(pos, move));
    pos.play(move);
  }
  return sans;
}

function renderPuzzleMoveList(def: PuzzleDefinition, rc: PuzzleRoundCtrl | null): VNode {
  const progressPly = rc?.progressPly ?? 0;
  // Show only moves that have been played (up to progressPly).
  // After solve/fail, show all solution moves.
  const showAll = rc && (rc.status === 'solved' || rc.status === 'failed');
  const solutionSlice = showAll ? def.solutionLine : def.solutionLine.slice(0, progressPly);
  // Prepend trigger move so the move list starts with the opponent's last move
  const allMoves = def.triggerMove ? [def.triggerMove, ...solutionSlice] : solutionSlice;
  const sans = computeSanMoves(def.startFen, allMoves);
  // Track whether we have a trigger move prefix for styling
  const hasTrigger = !!def.triggerMove;

  if (sans.length === 0) {
    return h('div.puzzle-moves', [
      h('div.puzzle-moves__empty', 'Waiting for moves\u2026'),
    ]);
  }

  // Determine starting move number from FEN
  const fenParts = def.startFen.split(' ');
  const startFullMove = parseInt(fenParts[5] ?? '1', 10);
  const startColorIsBlack = fenParts[1] === 'b';

  const moveNodes: VNode[] = [];
  for (let i = 0; i < sans.length; i++) {
    // Determine the actual ply in the game
    const isBlackMove = startColorIsBlack ? (i % 2 === 0) : (i % 2 === 1);
    const fullMoveNum = startFullMove + Math.floor((i + (startColorIsBlack ? 1 : 0)) / 2);

    // Show move number before white moves (or before the first black move if starting as black)
    if (!isBlackMove || (i === 0 && startColorIsBlack)) {
      moveNodes.push(
        h('span.puzzle-moves__num', `${fullMoveNum}.${startColorIsBlack && i === 0 ? '..' : ''}`),
      );
    }

    // With trigger: i=0 is trigger(opponent), i=1 is user, i=2 is opponent...
    // Without trigger: i=0 is user, i=1 is opponent...
    const isTrigger = hasTrigger && i === 0;
    const solutionIdx = hasTrigger ? i - 1 : i;
    const isUserMove = hasTrigger ? (i % 2 === 1) : (i % 2 === 0);
    const isCurrentMove = hasTrigger ? (solutionIdx === progressPly - 1 && solutionIdx >= 0) : (i === progressPly - 1);

    moveNodes.push(
      h('span.puzzle-moves__move', {
        class: {
          'puzzle-moves__move--current': isCurrentMove,
          'puzzle-moves__move--trigger': isTrigger,
          'puzzle-moves__move--opponent': !isUserMove,
          'puzzle-moves__move--user': isUserMove,
        },
      }, sans[i]),
    );
  }

  return h('div.puzzle-moves', moveNodes);
}

// --- Puzzle engine panel ---
// Shows engine eval output when activated after solve/fail.
// Adapted from lichess-org/lila: ui/puzzle/src/view/feedback.ts post-solve ceval

/**
 * Render the analysis board's ceval components for the puzzle page.
 * Sets the FEN override so renderPvBox uses the puzzle position, then
 * uses the shared engine toggle and PV box from src/ceval/view.ts.
 */
function renderPuzzleEnginePanel(rc: PuzzleRoundCtrl, redraw: () => void): VNode {
  // Compute current puzzle FEN for the ceval view
  const allMoves: string[] = [];
  if (rc.definition.triggerMove) allMoves.push(rc.definition.triggerMove);
  allMoves.push(...rc.solutionLine.slice(0, rc.progressPly));
  const setup = parseFen(rc.definition.startFen);
  let puzzleFen = rc.definition.startFen;
  if (setup.isOk) {
    const pos = Chess.fromSetup(setup.value);
    if (pos.isOk) {
      for (const uci of allMoves) {
        const m = parseUci(uci);
        if (m) pos.value.play(m);
      }
      puzzleFen = makeFen(pos.value.toSetup());
    }
  }

  // Set FEN override so the shared ceval view renders for the puzzle position
  setCevalFenOverride(puzzleFen);

  // If engine is on, ensure it's evaluating the puzzle position (not the analysis board's).
  // Only send when the FEN changes to avoid spamming the engine on every redraw.
  if (engineEnabled && sharedEngineReady && puzzleFen !== _lastPuzzleEngineFen) {
    _lastPuzzleEngineFen = puzzleFen;
    sharedProtocol.setPosition(puzzleFen);
    sharedProtocol.go(analysisDepth, multiPv);
  }

  const children: (VNode | null)[] = [];

  // Ceval header bar (toggle, eval pearl, engine name, settings gear)
  children.push(renderCeval());

  // PV lines box (only renders when engine is enabled)
  children.push(renderPvBox());

  // Engine settings panel (only renders when settings gear is toggled)
  children.push(renderEngineSettings());

  return h('div.puzzle-ceval', children);
}

// --- Session sidebar ---
// Persistent left sidebar during puzzle rounds. Shows session info at top
// and a chicklet history grid at bottom.

function renderSessionSidebar(session: ActiveSession, def: PuzzleDefinition, redraw: () => void): VNode {
  // Format theme/opening labels
  const labels: string[] = [];
  if (session.themes.length > 0) {
    labels.push(...session.themes.slice(0, 4).map(t => formatThemeName(t)));
    if (session.themes.length > 4) labels.push(`+${session.themes.length - 4} more`);
  }
  if (session.openings.length > 0) {
    labels.push(...session.openings.slice(0, 3).map(o => formatOpeningName(o)));
    if (session.openings.length > 3) labels.push(`+${session.openings.length - 3} more`);
  }
  if (labels.length === 0) labels.push('All themes');

  const clean = session.history.filter(e => e.result === 'clean').length;
  const assisted = session.history.filter(e => e.result === 'assisted').length;
  const failed = session.history.filter(e => e.result === 'failed').length;
  const total = session.history.length;

  return h('aside.puzzle__session-sidebar', [
    // Session info
    h('div.session-info', [
      h('div.session-info__header', [
        h('span.session-info__label', 'Current Session'),
        h('button.session-info__end', {
          on: { click: () => { clearActiveSession(); window.location.hash = '#/puzzles'; }},
          attrs: { title: 'End session' },
        }, 'End'),
      ]),
      h('div.session-info__themes', labels.join(', ')),
      h('div.session-info__rating',
        `Rating ${session.ratingMin}\u2013${session.ratingMax}`),
      h('div.session-info__stats', [
        h('span.session-info__stat.session-info__stat--clean', `${clean} clean`),
        h('span.session-info__stat.session-info__stat--assisted', `${assisted} assisted`),
        h('span.session-info__stat.session-info__stat--failed', `${failed} failed`),
        h('span.session-info__stat', `${total} total`),
      ]),
    ]),

    // History chicklet grid
    h('div.session-history', [
      h('div.session-history__label', 'Puzzle History'),
      h('div.session-history__grid',
        session.history.map((entry, i) =>
          h('div.session-history__cell', {
            class: {
              'session-history__cell--clean': entry.result === 'clean',
              'session-history__cell--assisted': entry.result === 'assisted',
              'session-history__cell--failed': entry.result === 'failed',
              'session-history__cell--active': entry.result === 'in-progress',
            },
            attrs: { title: `#${i + 1} ${entry.puzzleId}: ${entry.result}` },
          }),
        ),
      ),
    ]),

    // Puzzle info + metadata — moved to left sidebar
    renderPuzzleInfo(def, redraw),
    renderMetaPanel(def.id, redraw),
  ]);
}

export function renderPuzzleRound(redraw: () => void): VNode {
  const rs = getPuzzleRoundState();

  // No round state yet (should not normally happen if openPuzzleRound was called)
  if (!rs) {
    return h('div.puzzle-page', h('div.puzzle-round', 'Initializing\u2026'));
  }

  // Loading
  if (rs.status === 'loading') {
    return h('div.puzzle-page', h('div.puzzle-round', [
      h('span.puzzle-round__loading', 'Loading puzzle\u2026'),
    ]));
  }

  // Error
  if (rs.status === 'error' || !rs.definition) {
    return h('div.puzzle-page', h('div.puzzle-round', [
      h('div.puzzle-round__error', rs.error ?? 'Unknown error'),
      h('a.puzzle-round__back', { attrs: { href: '#/puzzles' } }, '\u2190 Back to Library'),
    ]));
  }

  // Ready — show puzzle board + side panel with feedback
  // Layout mirrors lichess-org/lila: ui/puzzle/src/view/main.ts
  const def = rs.definition;
  const rc = getActiveRoundCtrl();

  const session = getActiveSession();

  return h('div.puzzle-page', [
    h('div.puzzle.puzzle--with-session', [
      // Left sidebar — session info + puzzle info + meta
      session
        ? renderSessionSidebar(session, def, redraw)
        : h('aside.puzzle__session-sidebar', [
            h('div.puzzle-round__header', [
              h('a.puzzle-round__back', { attrs: { href: '#/puzzles' } }, '\u2190 Back to Library'),
              h('h2.puzzle-round__title', `Puzzle ${def.id}`),
            ]),
            renderPuzzleInfo(def, redraw),
            renderMetaPanel(def.id, redraw),
          ]),
      // Board area
      h('div.puzzle__board.main-board', [
        h('div.cg-wrap', {
          key: `puzzle-board-${def.id}`,
          hook: {
            insert: vnode => {
              mountPuzzleBoard(vnode.elm as HTMLElement, redraw);
            },
            destroy: () => {
              destroyPuzzleBoard();
            },
          },
        }),
      ]),
      // Side panel — split into engine/moves top half + feedback/tools bottom half
      h('aside.puzzle__side', [
        // --- Top half: engine eval + move list ---
        h('div.puzzle__side-top', [
          // Engine eval bar + lines (always present as a container)
          rc ? renderPuzzleEnginePanel(rc, redraw) : null,
          // Move list
          renderPuzzleMoveList(def, rc),
        ]),
        // --- Bottom half: feedback ---
        h('div.puzzle__side-bottom', [
          // Feedback panel
          rc ? renderFeedbackPanel(rc, redraw) : null,
        ]),
      ]),
    ]),
  ]);
}
