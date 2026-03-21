// Games tab rendering: filter bar, sort controls, game table, compact game list.
// Game metadata helpers (getUserColor, gameResult, gameSourceUrl, renderCompactGameRow)
// live here so main.ts stays as bootstrap-only code.
//
// Operates on importedGames in-memory — no separate data system.

import { h, type VNode } from 'snabbdom';
import { parsePgnHeader, type ImportedGame } from '../import/types';
import { chesscom } from '../import/chesscom';
import { lichess } from '../import/lichess';

const NEW_IMPORT_WINDOW_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Game metadata helpers (moved from main.ts — Step 16)
// ---------------------------------------------------------------------------

function isRecentlyImported(game: ImportedGame): boolean {
  return game.importedAt !== undefined && Date.now() - game.importedAt < NEW_IMPORT_WINDOW_MS;
}

/** Determine which side the importing user played in a given game. */
export function getUserColor(game: ImportedGame): 'white' | 'black' | null {
  // Prefer importedUsername stored at import time (reliable after IDB restore).
  // Fall back to current adapter usernames for games imported before this field existed.
  const knownNames = [game.importedUsername, chesscom.username, lichess.username]
    .map(n => n?.trim().toLowerCase())
    .filter((n): n is string => !!n);
  if (knownNames.length === 0) return null;
  if (game.white && knownNames.includes(game.white.toLowerCase())) return 'white';
  if (game.black && knownNames.includes(game.black.toLowerCase())) return 'black';
  return null;
}

/** Derive win/loss/draw relative to user. Returns null when user color cannot be determined. */
export function gameResult(game: ImportedGame): 'win' | 'loss' | 'draw' | null {
  const color = getUserColor(game);
  if (!game.result) return null;
  if (game.result.includes('1/2')) return 'draw';
  if (!color) return null;
  if (color === 'white') return game.result === '1-0' ? 'win' : 'loss';
  return game.result === '0-1' ? 'win' : 'loss';
}

/** Returns the source platform URL for a game, extracted from PGN headers. */
export function gameSourceUrl(game: ImportedGame): string | undefined {
  const link = parsePgnHeader(game.pgn, 'Link');
  if (link?.startsWith('http')) return link;
  const site = parsePgnHeader(game.pgn, 'Site');
  if (site?.startsWith('https://lichess.org/')) return site;
  return undefined;
}

/**
 * Shared structured row children for compact game lists (header panel + underboard).
 * Fields: result dot · opponent name · date · time class icon · badges.
 */
export function renderCompactGameRow(game: ImportedGame, isAnalyzed: boolean, hasMissedTactic: boolean): (VNode | null)[] {
  const result    = gameResult(game);
  const userColor = getUserColor(game);
  const opponent  = userColor === 'white' ? (game.black ?? game.id)
    : userColor === 'black' ? (game.white ?? game.id)
    : (game.white && game.black ? `${game.white} vs ${game.black}` : game.id);

  const date = game.date ? game.date.slice(0, 10) : null;

  const tcIconMap: Record<string, string> = {
    ultrabullet: '\ue032',
    bullet:      '\ue032',
    blitz:       '\ue008',
    rapid:       '\ue002',
  };
  const tcIcon = game.timeClass ? (tcIconMap[game.timeClass] ?? null) : null;
  const isNewImport = isRecentlyImported(game);

  const resultCls = result === 'win'  ? 'grl__result--win'
    : result === 'loss' ? 'grl__result--loss'
    : result === 'draw' ? 'grl__result--draw'
    : 'grl__result--unknown';

  const oppColor  = userColor === 'white' ? 'black' : userColor === 'black' ? 'white' : null;
  const oppChip   = oppColor ? h('span.color-chip.--' + oppColor) : null;
  const oppRating = userColor === 'white' ? game.blackRating : userColor === 'black' ? game.whiteRating : undefined;
  const oppLabel  = oppRating !== undefined ? `${opponent} (${oppRating})` : opponent;

  return [
    h('span.grl__result.' + resultCls, '●'),
    h('span.grl__opponent', [oppLabel, oppChip]),
    date ? h('span.grl__date', date) : null,
    tcIcon ? h('span.grl__tc', { attrs: { 'data-icon': tcIcon, ...(game.timeClass ? { title: game.timeClass } : {}) } }) : null,
    (isNewImport || isAnalyzed || hasMissedTactic) ? h('span.grl__badges', [
      isNewImport     ? h('span.grl__badge.--new',  { attrs: { title: 'Newly imported' } }, 'NEW') : null,
      isAnalyzed      ? h('span.grl__badge.--ok',   { attrs: { title: 'Analyzed' } },       '✓') : null,
      hasMissedTactic ? h('span.grl__badge.--warn', { attrs: { title: 'Missed tactic' } },  '!') : null,
    ]) : null,
  ];
}

// ---------------------------------------------------------------------------
// Dependency surface injected by main.ts at render time
// ---------------------------------------------------------------------------

export interface GamesViewDeps {
  importedGames:         ImportedGame[];
  selectedGameId:        string | null;
  analyzedGameIds:       Set<string>;
  missedTacticGameIds:   Set<string>;
  analyzedGameAccuracy:  Map<string, { white: number | null; black: number | null }>;
  savedPuzzles:          Array<{ gameId: string | null }>;
  gameResult:            (game: ImportedGame) => 'win' | 'loss' | 'draw' | null;
  getUserColor:          (game: ImportedGame) => 'white' | 'black' | null;
  gameSourceUrl:         (game: ImportedGame) => string | undefined;
  renderCompactGameRow:  (game: ImportedGame, analyzed: boolean, missed: boolean) => (VNode | null)[];
  /** Set selectedGameId + call loadGame (used for click-to-load in the game list). */
  selectGame:            (game: ImportedGame) => void;
  /** selectGame + navigate to analysis + startBatchWhenReady (used for Review button). */
  reviewGame:            (game: ImportedGame) => void;
  redraw:                () => void;
}

// ---------------------------------------------------------------------------
// Filter / sort state (owned by this module)
// ---------------------------------------------------------------------------

type GamesResultFilter = 'win' | 'loss' | 'draw';
type GamesSortField    = 'date' | 'result' | 'opponent' | 'timeClass';

let gamesFilterResults:  Set<GamesResultFilter> = new Set(); // empty = all
let gamesFilterSpeeds:   Set<string>            = new Set(); // empty = all
let gamesFilterOpponent  = '';
let gamesFilterColor:    '' | 'white' | 'black' = '';
let gamesSortField: GamesSortField = 'date';
let gamesSortDir:   'asc' | 'desc' = 'desc';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toggleGamesSort(field: GamesSortField, redraw: () => void): void {
  if (gamesSortField === field) {
    gamesSortDir = gamesSortDir === 'desc' ? 'asc' : 'desc';
  } else {
    gamesSortField = field;
    gamesSortDir = 'desc';
  }
  redraw();
}

function gamesFilterActive(): boolean {
  return gamesFilterResults.size > 0 || gamesFilterSpeeds.size > 0 ||
    gamesFilterOpponent.trim() !== '' || gamesFilterColor !== '';
}

function clearGamesFilters(redraw: () => void): void {
  gamesFilterResults  = new Set();
  gamesFilterSpeeds   = new Set();
  gamesFilterOpponent = '';
  gamesFilterColor    = '';
  redraw();
}

function filteredGames(deps: GamesViewDeps): ImportedGame[] {
  let list = [...deps.importedGames];

  if (gamesFilterResults.size > 0) {
    list = list.filter(g => {
      const r = deps.gameResult(g);
      return r !== null && gamesFilterResults.has(r);
    });
  }

  if (gamesFilterSpeeds.size > 0) {
    list = list.filter(g => g.timeClass && gamesFilterSpeeds.has(g.timeClass));
  }

  if (gamesFilterOpponent.trim()) {
    const q = gamesFilterOpponent.trim().toLowerCase();
    list = list.filter(g => {
      const opp = opponentName(g, deps.getUserColor)?.toLowerCase() ?? '';
      return opp.includes(q);
    });
  }

  if (gamesFilterColor) {
    list = list.filter(g => deps.getUserColor(g) === gamesFilterColor);
  }

  // Sort
  list.sort((a, b) => {
    let cmp = 0;
    if (gamesSortField === 'date') {
      cmp = (a.date ?? '').localeCompare(b.date ?? '');
    } else if (gamesSortField === 'opponent') {
      cmp = (opponentName(a, deps.getUserColor) ?? '').localeCompare(opponentName(b, deps.getUserColor) ?? '');
    } else if (gamesSortField === 'timeClass') {
      cmp = (a.timeClass ?? '').localeCompare(b.timeClass ?? '');
    } else if (gamesSortField === 'result') {
      const ord = (g: ImportedGame) => {
        const r = deps.gameResult(g);
        return r === 'win' ? 0 : r === 'draw' ? 1 : r === 'loss' ? 2 : 3;
      };
      cmp = ord(a) - ord(b);
    }
    return gamesSortDir === 'desc' ? -cmp : cmp;
  });

  return list;
}

function opponentName(
  game: ImportedGame,
  getUserColor: (g: ImportedGame) => 'white' | 'black' | null,
): string | undefined {
  const color = getUserColor(game);
  if (color === 'white') return game.black;
  if (color === 'black') return game.white;
  // If user color unknown, show white vs black
  return (game.white && game.black) ? `${game.white} vs ${game.black}` : undefined;
}

function renderResultIcon(r: 'win' | 'loss' | 'draw' | null): VNode {
  if (r === 'win')  return h('span.games-view__result.--win',  { attrs: { title: 'Win'  } }, '●');
  if (r === 'loss') return h('span.games-view__result.--loss', { attrs: { title: 'Loss' } }, '●');
  if (r === 'draw') return h('span.games-view__result.--draw', { attrs: { title: 'Draw' } }, '●');
  return h('span.games-view__result', '–');
}

function renderSortTh(label: string, field: GamesSortField, redraw: () => void): VNode {
  const active = gamesSortField === field;
  const arrow  = active ? (gamesSortDir === 'desc' ? ' ↓' : ' ↑') : '';
  return h('th', {
    class: { 'games-view__th--active': active },
    on:   { click: () => toggleGamesSort(field, redraw) },
  }, label + arrow);
}

const SPEED_ICONS: Record<string, string> = {
  ultrabullet: '\ue059',
  bullet:      '\ue032',
  blitz:       '\ue008',
  rapid:       '\ue002',
  classical:   '\ue007', // licon.Turtle
};

// ---------------------------------------------------------------------------
// Exported render functions
// ---------------------------------------------------------------------------

/**
 * Compact game list shown in the analysis underboard.
 * Adapted from docs/reference/GameImport/index.jsx.
 */
export function renderGameList(deps: GamesViewDeps): VNode {
  if (deps.importedGames.length === 0) return h('div');
  return h('div.game-list', [
    h('div.game-list__header', `${deps.importedGames.length} imported game${deps.importedGames.length === 1 ? '' : 's'}`),
    h('ul', deps.importedGames.map(game => {
      const isAnalyzed      = deps.analyzedGameIds.has(game.id);
      const hasMissedTactic = deps.missedTacticGameIds.has(game.id);
      const srcUrl          = deps.gameSourceUrl(game);
      return h('li', [
        h('button.game-list__row', {
          class: { active: game.id === deps.selectedGameId },
          on: { click: () => deps.selectGame(game) },
        }, deps.renderCompactGameRow(game, isAnalyzed, hasMissedTactic)),
        srcUrl ? h('a.game-ext-link', {
          attrs: { href: srcUrl, target: '_blank', rel: 'noopener', title: 'View on source platform' },
        }) : null,
      ]);
    })),
  ]);
}

/** Full Games tab view: filter bar + sortable table. */
export function renderGamesView(deps: GamesViewDeps): VNode {
  const games = filteredGames(deps);
  const { redraw } = deps;

  // Controls bar
  const filterBar = h('div.games-view__controls', [
    // Result filter
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Result'),
      ...(['win', 'loss', 'draw'] as GamesResultFilter[]).map(r =>
        h('button.games-view__pill', {
          class: { active: gamesFilterResults.has(r) },
          on: { click: () => {
            const s = new Set(gamesFilterResults);
            s.has(r) ? s.delete(r) : s.add(r);
            gamesFilterResults = s;
            redraw();
          }},
        }, r.charAt(0).toUpperCase() + r.slice(1))
      ),
    ]),

    // Time class filter
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Time'),
      ...(['bullet', 'blitz', 'rapid'] as string[]).map(tc =>
        h('button.games-view__pill', {
          class: { active: gamesFilterSpeeds.has(tc) },
          attrs: { 'data-icon': SPEED_ICONS[tc] ?? '' },
          on: { click: () => {
            const s = new Set(gamesFilterSpeeds);
            s.has(tc) ? s.delete(tc) : s.add(tc);
            gamesFilterSpeeds = s;
            redraw();
          }},
        }, tc.charAt(0).toUpperCase() + tc.slice(1))
      ),
    ]),

    // Color filter (playing as)
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Color'),
      h('button.games-view__pill', {
        class: { active: gamesFilterColor === 'white' },
        on: { click: () => { gamesFilterColor = gamesFilterColor === 'white' ? '' : 'white'; redraw(); } },
      }, 'White'),
      h('button.games-view__pill', {
        class: { active: gamesFilterColor === 'black' },
        on: { click: () => { gamesFilterColor = gamesFilterColor === 'black' ? '' : 'black'; redraw(); } },
      }, 'Black'),
    ]),

    // Opponent search
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Opponent'),
      h('input.games-view__search', {
        attrs: { type: 'search', placeholder: 'Name…', value: gamesFilterOpponent },
        on: { input: (e: Event) => { gamesFilterOpponent = (e.target as HTMLInputElement).value; redraw(); } },
      }),
    ]),

    // Summary + clear
    h('div.games-view__filter-group.--right', [
      h('span.games-view__summary', `${games.length} of ${deps.importedGames.length} game${deps.importedGames.length === 1 ? '' : 's'}`),
      gamesFilterActive() ? h('button.games-view__clear', { on: { click: () => clearGamesFilters(redraw) } }, 'Clear filters') : null,
    ]),
  ]);

  // Empty state
  if (deps.importedGames.length === 0) {
    return h('div.games-view', [
      filterBar,
      h('div.games-view__empty', [
        h('p', 'No games imported yet.'),
        h('p.games-view__empty-hint', 'Use the search bar above to import from Chess.com or Lichess.'),
      ]),
    ]);
  }

  // Table
  const table = h('div.games-view__table-wrap', [
    h('table.games-view__table', [
      h('thead', h('tr', [
        renderSortTh('Result',   'result',    redraw),
        renderSortTh('Opponent', 'opponent',  redraw),
        h('th.games-view__rating-th', 'Rating'),
        renderSortTh('Date',     'date',      redraw),
        renderSortTh('Time',     'timeClass', redraw),
        h('th', 'Opening'),
        h('th.games-view__review-th', 'Review'),
        h('th.games-view__puzzles-th', 'Puzzles'),
        h('th'),
      ])),
      h('tbody', games.length > 0
        ? games.map(game => {
            const r       = deps.gameResult(game);
            const opp     = opponentName(game, deps.getUserColor) ?? '–';
            const date    = game.date ? game.date.slice(0, 10) : '–';
            const tc      = game.timeClass ?? '–';
            const tcIcon  = game.timeClass ? SPEED_ICONS[game.timeClass] : undefined;
            const opening = game.opening ? (game.eco ? `${game.eco} ${game.opening}` : game.opening) : '–';
            const srcUrl  = deps.gameSourceUrl(game);
            const isAnalyzed = deps.analyzedGameIds.has(game.id);
            const hasMissed  = deps.missedTacticGameIds.has(game.id);
            const isNewImport = isRecentlyImported(game);

            // User accuracy: read from analyzedGameAccuracy map (populated at analysis-complete time).
            const accEntry  = deps.analyzedGameAccuracy.get(game.id);
            const userColor = deps.getUserColor(game);

            // Rating cell: opponent's rating only.
            const oppRating = userColor === 'white' ? game.blackRating : userColor === 'black' ? game.whiteRating : undefined;
            const ratingText = (() => {
              if (oppRating !== undefined) return String(oppRating);
              if (!userColor && (game.whiteRating !== undefined || game.blackRating !== undefined)) {
                const parts: string[] = [];
                if (game.whiteRating !== undefined) parts.push(`W:${game.whiteRating}`);
                if (game.blackRating !== undefined) parts.push(`B:${game.blackRating}`);
                return parts.join(' ');
              }
              return null;
            })();
            const ratingCell = h('td.games-view__rating', ratingText ?? '–');

            let accuracyText: string | null = null;
            if (isAnalyzed && accEntry) {
              if (userColor === 'white' && accEntry.white !== null) {
                accuracyText = `${Math.round(accEntry.white)}%`;
              } else if (userColor === 'black' && accEntry.black !== null) {
                accuracyText = `${Math.round(accEntry.black)}%`;
              } else if (!userColor) {
                const w = accEntry.white !== null ? `W:${Math.round(accEntry.white)}%` : null;
                const b = accEntry.black !== null ? `B:${Math.round(accEntry.black)}%` : null;
                accuracyText = [w, b].filter(Boolean).join(' ') || null;
              }
            }

            // Review status cell
            const reviewCell = isAnalyzed
              ? h('td.games-view__review-cell', [
                  h('span.games-view__reviewed', { attrs: { title: 'Reviewed' } }, '✓'),
                  hasMissed ? h('span.games-view__missed', { attrs: { title: 'Missed tactic detected' } }, '!') : null,
                  accuracyText ? h('span.games-view__accuracy', { attrs: { title: 'Your accuracy' } }, accuracyText) : null,
                ])
              : h('td.games-view__review-cell', [
                  h('button.games-view__review-btn', {
                    on: { click: (e: Event) => { e.stopPropagation(); deps.reviewGame(game); } },
                    attrs: { title: 'Load into Analysis and start review' },
                  }, 'Review'),
                ]);

            // Puzzle status: real data from savedPuzzles (persisted in IDB).
            const puzzleCount = deps.savedPuzzles.filter(p => p.gameId === game.id).length;
            const puzzleCell  = h('td.games-view__puzzles-cell',
              puzzleCount > 0
                ? h('span.games-view__puzzle-count', { attrs: { title: `${puzzleCount} saved puzzle${puzzleCount !== 1 ? 's' : ''}` } }, String(puzzleCount))
                : h('span.games-view__puzzle-none', '–')
            );

            return h('tr.games-view__row', {
              class: { active: game.id === deps.selectedGameId },
              on: { click: () => {
                deps.selectGame(game);
                window.location.hash = '#/analysis';
              }},
            }, [
              h('td', renderResultIcon(r)),
              h('td.games-view__opponent', [
                opp,
                userColor ? h('span.color-chip.--' + (userColor === 'white' ? 'black' : 'white')) : null,
                isNewImport ? h('span.games-view__new-import', { attrs: { title: 'Newly imported' } }, 'NEW') : null,
              ]),
              ratingCell,
              h('td.games-view__date', date),
              h('td.games-view__tc', [
                tcIcon
                  ? h('span', { attrs: { 'data-icon': tcIcon, style: 'font-family:lichess;margin-right:4px' } })
                  : null,
                tc.charAt(0).toUpperCase() + tc.slice(1),
              ]),
              h('td.games-view__opening', h('span', { attrs: { title: opening } }, opening)),
              reviewCell,
              puzzleCell,
              h('td.games-view__link-cell', srcUrl ? h('a.game-ext-link', {
                attrs: { href: srcUrl, target: '_blank', rel: 'noopener', title: 'View on source platform' },
                on: { click: (e: Event) => e.stopPropagation() },
              }) : null),
            ]);
          })
        : [h('tr', h('td', { attrs: { colspan: '9' } }, h('div.games-view__empty', 'No games match current filters.')))]
      ),
    ]),
  ]);

  return h('div.games-view', [filterBar, table]);
}
