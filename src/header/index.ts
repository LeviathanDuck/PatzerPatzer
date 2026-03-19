// App header: unified import search bar, nav, and global settings menu.
// Adapted from docs/reference/TopNav.jsx and AppShell.jsx (previous React iteration).

import { h, type VNode } from 'snabbdom';
import { chesscom, importChesscom } from '../import/chesscom';
import { lichess, importLichess } from '../import/lichess';
import { pgnState, importPgn } from '../import/pgn';
import {
  importFilters, SPEED_OPTIONS, DATE_RANGE_OPTIONS,
  type ImportDateRange,
} from '../import/filters';
import { renderBoardSettings } from '../board/cosmetics';
import type { Route } from '../router';
import type { ImportedGame, ImportCallbacks } from '../import/types';

// --- Module-level header state ---
type ImportPlatform = 'chesscom' | 'lichess';
let importPlatform: ImportPlatform = 'chesscom';
let showImportPanel  = false;
let showGlobalMenu   = false;
let showBoardSettings = false;

export function setImportPlatform(p: ImportPlatform): void { importPlatform = p; }
export function getImportPlatform(): ImportPlatform         { return importPlatform; }

export interface HeaderDeps {
  route:               Route;
  importedGames:       ImportedGame[];
  selectedGameId:      string | null;
  analyzedGameIds:     ReadonlySet<string>;
  missedTacticGameIds: ReadonlySet<string>;
  importCallbacks:     ImportCallbacks;
  onSelectGame:        (id: string, pgn: string) => void;
  renderGameRow:       (game: ImportedGame, isAnalyzed: boolean, hasMissedTactic: boolean) => (VNode | null)[];
  gameSourceUrl:       (game: ImportedGame) => string | undefined;
  downloadPgn:         (annotated: boolean) => void;
  resetAllData:        () => void;
  redraw:              () => void;
}

// --- Nav ---

function activeSection(route: Route): string {
  switch (route.name) {
    case 'analysis':
    case 'analysis-game':
      return 'analysis';
    case 'puzzles':  return 'puzzles';
    case 'openings': return 'openings';
    case 'stats':    return 'stats';
    case 'games':    return 'games';
    default:         return '';
  }
}

const navLinks: { label: string; href: string; section: string }[] = [
  { label: 'Analysis', href: '#/analysis', section: 'analysis' },
  { label: 'Games',    href: '#/games',    section: 'games'    },
  { label: 'Puzzles',  href: '#/puzzles',  section: 'puzzles'  },
  { label: 'Openings', href: '#/openings', section: 'openings' },
  { label: 'Stats',    href: '#/stats',    section: 'stats'    },
];

function renderNav(route: Route): VNode {
  const active = activeSection(route);
  return h('nav.header__nav', navLinks.map(({ label, href, section }) =>
    h('a', { attrs: { href }, class: { active: active === section } }, label)
  ));
}

// --- Global settings menu ---

function closeGlobalMenu(redraw: () => void): void {
  showGlobalMenu    = false;
  showBoardSettings = false;
  redraw();
}

function renderGlobalMenu(deps: HeaderDeps): VNode {
  const { downloadPgn, redraw } = deps;
  return h('div.global-menu', [
    h('button.global-menu__trigger', {
      class: { active: showGlobalMenu },
      attrs: { title: 'Settings' },
      on: { click: () => {
        showGlobalMenu    = !showGlobalMenu;
        showBoardSettings = false;
        redraw();
      }},
    }, '⚙'),

    showGlobalMenu ? h('div.global-menu__backdrop', {
      on: { click: () => closeGlobalMenu(redraw) },
    }) : null,

    showGlobalMenu ? h('div.global-menu__dropdown', {
      class: { 'board-open': showBoardSettings },
    }, [
      h('button.global-menu__item', {
        on: { click: () => { console.log('TODO: clear local cache'); } },
      }, 'Clear Local Cache'),

      h('button.global-menu__item', {
        on: { click: () => { console.log('TODO: game review settings'); } },
      }, 'Game Review'),

      h('button.global-menu__item', {
        on: { click: () => { closeGlobalMenu(redraw); downloadPgn(false); } },
      }, 'Export PGN from Current Board'),

      h('div.global-menu__item.global-menu__item--has-sub', {
        on: { click: () => { showBoardSettings = !showBoardSettings; redraw(); } },
      }, [
        h('span', 'Board Settings'),
        h('span.global-menu__arrow', showBoardSettings ? '▾' : '›'),
      ]),

      showBoardSettings ? renderBoardSettings(redraw) : null,
    ]) : null,
  ]);
}

// --- Main header ---

/**
 * Global app header — unified search bar with nested import panel.
 * The search bar is the primary import control: platform toggle → username → Import.
 * Filters, PGN paste, and the game list live inside a dropdown panel below the bar.
 */
export function renderHeader(deps: HeaderDeps): VNode {
  const {
    route, importedGames, selectedGameId,
    analyzedGameIds, missedTacticGameIds,
    importCallbacks, onSelectGame, renderGameRow,
    gameSourceUrl, resetAllData, redraw,
  } = deps;

  const loading  = importPlatform === 'chesscom' ? chesscom.loading  : lichess.loading;
  const error    = importPlatform === 'chesscom' ? chesscom.error    : lichess.error;
  const username = importPlatform === 'chesscom' ? chesscom.username : lichess.username;

  const doImport = () => importPlatform === 'chesscom'
    ? void importChesscom(importCallbacks)
    : void importLichess(importCallbacks);

  const hasActiveFilters =
    importFilters.speeds.size > 0 ||
    importFilters.dateRange !== '1month' ||
    !importFilters.rated;

  const panel = showImportPanel ? h('div.header__panel', [

    h('div.header__panel-section', [
      h('div.header__panel-label', 'Time control'),
      h('div.header__panel-row', [
        h('button.header__pill', {
          class: { active: importFilters.speeds.size === 0 },
          on: { click: () => { importFilters.speeds = new Set(); redraw(); } },
        }, 'All'),
        ...SPEED_OPTIONS.map(({ value, label, icon }) =>
          h('button.header__pill', {
            class: { active: importFilters.speeds.has(value) },
            attrs: { 'data-icon': icon },
            on: { click: () => {
              const s = new Set(importFilters.speeds);
              s.has(value) ? s.delete(value) : s.add(value);
              importFilters.speeds = s;
              redraw();
            }},
          }, label)
        ),
      ]),

      h('div.header__panel-label.--mt', 'Period'),
      h('div.header__panel-row', [
        ...DATE_RANGE_OPTIONS.map(({ value, label }) =>
          h('button.header__pill', {
            class: { active: importFilters.dateRange === value },
            on: { click: () => { importFilters.dateRange = value as ImportDateRange; redraw(); } },
          }, label)
        ),
      ]),

      importFilters.dateRange === 'custom' ? h('div.header__panel-row.--mt', [
        h('span.header__panel-hint', 'From'),
        h('input.header__date-input', {
          attrs: { type: 'date', value: importFilters.customFrom },
          on: { change: (e: Event) => { importFilters.customFrom = (e.target as HTMLInputElement).value; redraw(); } },
        }),
        h('span.header__panel-hint', 'To'),
        h('input.header__date-input', {
          attrs: { type: 'date', value: importFilters.customTo },
          on: { change: (e: Event) => { importFilters.customTo = (e.target as HTMLInputElement).value; redraw(); } },
        }),
      ]) : null,

      h('div.header__panel-row.--mt', [
        h('label.header__panel-check', [
          h('input', {
            attrs: { type: 'checkbox', checked: importFilters.rated },
            on: { change: (e: Event) => { importFilters.rated = (e.target as HTMLInputElement).checked; redraw(); } },
          }),
          'Rated only',
        ]),
      ]),
    ]),

    h('div.header__panel-divider'),

    h('div.header__panel-section', [
      h('div.header__panel-label', 'Paste PGN'),
      h('textarea.header__pgn-input', {
        key: pgnState.key,
        attrs: { placeholder: 'Paste a PGN here…', rows: 3, spellcheck: false },
        on: { input: (e: Event) => { pgnState.input = (e.target as HTMLTextAreaElement).value; } },
      }),
      h('div.header__panel-row', [
        h('button.header__panel-btn', {
          on: { click: () => {
            importPgn(importCallbacks);
            if (!pgnState.error) { showImportPanel = false; }
            redraw();
          }},
        }, 'Import PGN'),
        pgnState.error ? h('span.header__panel-error', pgnState.error) : null,
      ]),
    ]),

    importedGames.length > 0 ? h('div.header__panel-section', [
      h('div.header__panel-label', `${importedGames.length} game${importedGames.length === 1 ? '' : 's'} imported`),
      h('div.header__games-list', importedGames.map(game => {
        const isAnalyzed      = analyzedGameIds.has(game.id);
        const hasMissedTactic = missedTacticGameIds.has(game.id);
        const srcUrl = gameSourceUrl(game);
        return h('div.header__game-item', [
          h('button.header__game-row', {
            class: { active: game.id === selectedGameId },
            on: { click: () => {
              onSelectGame(game.id, game.pgn);
              showImportPanel = false;
              redraw();
            }},
          }, renderGameRow(game, isAnalyzed, hasMissedTactic)),
          srcUrl ? h('a.game-ext-link', {
            attrs: { href: srcUrl, target: '_blank', rel: 'noopener', title: 'View on source platform' },
            on: { click: (e: Event) => e.stopPropagation() },
          }) : null,
        ]);
      })),
    ]) : null,

  ]) : null;

  const backdrop = showImportPanel ? h('div.header__backdrop', {
    on: { click: () => { showImportPanel = false; redraw(); } },
  }) : null;

  return h('header.header', [
    h('a.header__brand', { attrs: { href: '#/' } }, 'Patzer Pro'),

    h('div.header__search', { key: 'header-search' }, [
      h('div.header__bar', [
        h('div.header__platforms', [
          h('button.header__platform', {
            class: { active: importPlatform === 'chesscom' },
            on: { click: () => { importPlatform = 'chesscom'; redraw(); } },
          }, 'Chess.com'),
          h('button.header__platform', {
            class: { active: importPlatform === 'lichess' },
            on: { click: () => { importPlatform = 'lichess'; redraw(); } },
          }, 'Lichess'),
        ]),

        h('input.header__input', {
          key: `input-${importPlatform}`,
          attrs: {
            type: 'search',
            placeholder: importPlatform === 'chesscom' ? 'Chess.com username' : 'Lichess username',
            value: username,
            disabled: loading,
            autocomplete: 'off',
            spellcheck: false,
          },
          on: {
            input: (e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              if (importPlatform === 'chesscom') chesscom.username = v;
              else lichess.username = v;
            },
            keydown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' && username.trim() && !loading) doImport();
            },
          },
        }),

        h('button.header__import', {
          attrs: { disabled: loading || !username.trim() },
          on: { click: doImport },
        }, loading ? 'Importing…' : 'Import'),

        importedGames.length > 0 && !error
          ? h('span.header__count', { on: { click: () => { showImportPanel = !showImportPanel; redraw(); } } },
              `${importedGames.length} games`)
          : null,
        error
          ? h('span.header__error', { attrs: { title: error } }, '⚠')
          : null,

        h('button.header__toggle', {
          class: { active: showImportPanel, 'header__toggle--filtered': hasActiveFilters && !showImportPanel },
          attrs: { title: 'Filters & games' },
          on: { click: () => { showImportPanel = !showImportPanel; redraw(); } },
        }, showImportPanel ? '▴' : '▾'),
      ]),

      panel,
      backdrop,
    ]),

    renderNav(route),

    h('button.dev-reset', { on: { click: () => void resetAllData() } }, 'Reset'),
    renderGlobalMenu(deps),
  ]);
}
