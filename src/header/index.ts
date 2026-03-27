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
import {
  boardWheelNavEnabled,
  reviewDotsUserOnly,
  renderBoardSettings,
  setBoardWheelNavEnabled,
  setReviewDotsUserOnly,
} from '../board/cosmetics';
import { boardSoundEnabled, setBoardSoundEnabled } from '../board/sound';
import {
  isBulkRunning, isBulkPaused,
  pauseBulkReview, resumeBulkReview, cancelBulkReview,
  getQueueSummary, getAutoReview,
} from '../engine/reviewQueue';
import { reviewDepth, setReviewDepth } from '../engine/batch';
import { missedMomentConfig, setMissedMomentConfig } from '../engine/tactics';
import type { Route } from '../router';
import type { ImportedGame, ImportCallbacks } from '../import/types';

// --- Module-level header state ---
type ImportPlatform = 'chesscom' | 'lichess';
let importPlatform: ImportPlatform = 'chesscom';
let showImportPanel  = false;
let showGlobalMenu   = false;
let showBoardSettings     = false;
let showDetectionModal    = false;
let showReviewMenu        = false;
let showMobileNav    = false;

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
    case 'puzzle-round':
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

// --- Bulk Review menu ---

const REVIEW_DEPTHS = [12, 14, 16, 18, 20];

function renderReviewMenu(redraw: () => void): VNode {
  const running = isBulkRunning();
  const paused  = isBulkPaused();
  const active  = running || paused;
  const summary = active ? getQueueSummary() : null;
  const auto    = getAutoReview();

  return h('div.review-menu', [
    h('button.review-menu__trigger', {
      class: { active: showReviewMenu || active },
      attrs: { title: 'Bulk Review settings' },
      on: { click: () => { showReviewMenu = !showReviewMenu; redraw(); } },
    }, active ? `Review ${summary!.done}/${summary!.total}` : 'Review'),

    showReviewMenu ? h('div.review-menu__backdrop', {
      on: { click: () => { showReviewMenu = false; redraw(); } },
    }) : null,

    showReviewMenu ? h('div.review-menu__dropdown', [

      // Queue status + controls
      active ? h('div.review-menu__section', [
        h('div.review-menu__label', summary
          ? `${summary.done} of ${summary.total} game${summary.total === 1 ? '' : 's'} analyzed`
          : 'Idle'),
        h('div.review-menu__row', [
          paused
            ? h('button.review-menu__btn', {
                on: { click: () => { resumeBulkReview(); redraw(); } },
              }, 'Resume')
            : h('button.review-menu__btn', {
                on: { click: () => { pauseBulkReview(); redraw(); } },
              }, 'Pause'),
          h('button.review-menu__btn.--cancel', {
            on: { click: () => { cancelBulkReview(); redraw(); } },
          }, 'Cancel'),
        ]),
      ]) : null,

      h('div.review-menu__section', [
        h('div.review-menu__label', `Depth: ${reviewDepth}`),
        h('div.review-menu__row', REVIEW_DEPTHS.map(d =>
          h('button.review-menu__pill', {
            class: { active: reviewDepth === d },
            on: { click: () => { setReviewDepth(d); redraw(); } },
          }, String(d)),
        )),
      ]),

      h('label.review-menu__toggle', [
        h('span', 'Auto-review on import'),
        h('input', {
          attrs: { type: 'checkbox', checked: auto },
          on: {
            change: (e: Event) => {
              localStorage.setItem('patzer.autoReview', String((e.target as HTMLInputElement).checked));
              redraw();
            },
          },
        }),
      ]),

    ]) : null,
  ]);
}

// --- Global settings menu ---

function closeGlobalMenu(redraw: () => void): void {
  showGlobalMenu    = false;
  showBoardSettings = false;
  redraw();
}

// --- Detection Settings modal ---

interface SliderDef {
  key:             keyof typeof missedMomentConfig;
  label:           string;
  description:     string;
  min:             number;
  max:             number;
  step:            number;
  format:          (v: number) => string;
  lichessDefault?: number;
}

const DETECTION_SLIDERS: SliderDef[] = [
  {
    key: 'swingThreshold',
    label: 'Swing Threshold',
    description: 'Minimum win-chance drop required to flag a tactical mistake. Lower = more sensitive; flags smaller errors. 0.05 is the Lichess inaccuracy floor — any real mistake will be caught.',
    min: 0.01, max: 0.30, step: 0.01,
    format: v => v.toFixed(2),
    lichessDefault: 0.05,
  },
  {
    key: 'missedMateMaxN',
    label: 'Missed Mate in N',
    description: 'Flag a move when a forced checkmate in N moves or fewer was on the board but not played. Lichess flags missed mates in 3 or fewer. Set to 0 to disable this category entirely.',
    min: 0, max: 10, step: 1,
    format: v => v === 0 ? 'off' : `in ${v}`,
    lichessDefault: 3,
  },
  {
    key: 'collapseWcFloor',
    label: 'Near-Win Floor',
    description: 'How dominant the mover must be (win chances %) before a near-win collapse can be flagged. 55% ≈ +50–100 centipawns advantage. Raise this to only flag collapses from clearly winning positions.',
    min: 0.50, max: 0.95, step: 0.05,
    format: v => `${Math.round(v * 100)}%`,
  },
  {
    key: 'collapseDropMin',
    label: 'Collapse Drop',
    description: 'Minimum win-chance loss to flag a near-win collapse. Intentionally lower than the swing threshold — throwing away a won game is significant even when the raw drop is modest.',
    min: 0.02, max: 0.20, step: 0.01,
    format: v => v.toFixed(2),
  },
  {
    key: 'maxPly',
    label: 'Max Ply',
    description: 'Stop flagging tactical mistakes after this many half-moves (plies). Ply 60 = move 30. Set to 0 to check the entire game including the endgame. Lichess analysis covers up to ply 60.',
    min: 0, max: 120, step: 10,
    format: v => v === 0 ? 'all' : `ply ${v} (move ${v / 2})`,
    lichessDefault: 60,
  },
];

function renderDetectionModal(redraw: () => void): VNode {
  const cfg = missedMomentConfig;

  const rows = DETECTION_SLIDERS.map(s => {
    const value = cfg[s.key] as number;
    const markerPct = s.lichessDefault !== undefined
      ? ((s.lichessDefault - s.min) / (s.max - s.min)) * 100
      : null;

    return h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', s.label),
        h('span.detection-modal__value', s.format(value)),
      ]),
      h('p.detection-modal__desc', s.description),
      h('div.detection-modal__slider-wrap', [
        h('input', {
          attrs: { type: 'range', min: s.min, max: s.max, step: s.step, value },
          on: {
            input: (e: Event) => {
              const raw = parseFloat((e.target as HTMLInputElement).value);
              setMissedMomentConfig({ [s.key]: s.step >= 1 ? Math.round(raw) : raw });
              redraw();
            },
          },
        }),
        markerPct !== null
          ? h('span.detection-modal__default-mark', {
              attrs: {
                style: `left: ${markerPct}%`,
                title: `Lichess default: ${s.format(s.lichessDefault!)}`,
              },
            })
          : null,
      ]),
    ]);
  });

  return h('div.detection-modal', [
    h('div.detection-modal__backdrop', {
      on: { click: () => { showDetectionModal = false; redraw(); } },
    }),
    h('div.detection-modal__card', [
      h('div.detection-modal__header', [
        h('h2', 'Detection Settings'),
        h('button.detection-modal__close', {
          attrs: { title: 'Close' },
          on: { click: () => { showDetectionModal = false; redraw(); } },
        }, '✕'),
      ]),
      h('div.detection-modal__body', rows),
    ]),
  ]);
}

function renderGlobalMenu(deps: HeaderDeps): VNode {
  const { downloadPgn, resetAllData, selectedGameId, redraw } = deps;
  const hasGame = selectedGameId !== null;
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

    showDetectionModal ? renderDetectionModal(redraw) : null,

    showGlobalMenu ? h('div.global-menu__dropdown', {
      class: { 'board-open': showBoardSettings },
    }, [
      h('button.global-menu__item', {
        on: { click: () => {
          closeGlobalMenu(redraw);
          void resetAllData();
        } },
      }, 'Clear Local Data'),

      // Navigate to the analysis board to review the currently loaded game.
      // Disabled when no game is selected — nothing to review.
      h('button.global-menu__item', {
        attrs: { disabled: !hasGame, title: hasGame ? 'Review current game on analysis board' : 'Select a game first' },
        on: { click: () => {
          if (!hasGame) return;
          closeGlobalMenu(redraw);
          window.location.hash = '#/analysis';
        }},
      }, 'Game Review'),

      h('button.global-menu__item', {
        on: { click: () => { closeGlobalMenu(redraw); downloadPgn(true); } },
      }, 'Export PGN (Annotated)'),

      h('button.global-menu__item', {
        on: { click: () => { closeGlobalMenu(redraw); downloadPgn(false); } },
      }, 'Export PGN (Plain)'),

      h('label.global-menu__item.global-menu__item--toggle', [
        h('span', 'Board Wheel Navigation'),
        h('input', {
          attrs: { type: 'checkbox', checked: boardWheelNavEnabled },
          on: {
            change: (e: Event) => {
              setBoardWheelNavEnabled((e.target as HTMLInputElement).checked);
              redraw();
            },
          },
        }),
      ]),

      h('label.global-menu__item.global-menu__item--toggle', [
        h('span', 'Review Dots: User Only'),
        h('input', {
          attrs: { type: 'checkbox', checked: reviewDotsUserOnly },
          on: {
            change: (e: Event) => {
              setReviewDotsUserOnly((e.target as HTMLInputElement).checked);
              redraw();
            },
          },
        }),
      ]),

      h('label.global-menu__item.global-menu__item--toggle', [
        h('span', 'Board Sounds'),
        h('input', {
          attrs: { type: 'checkbox', checked: boardSoundEnabled },
          on: {
            change: (e: Event) => {
              setBoardSoundEnabled((e.target as HTMLInputElement).checked);
              redraw();
            },
          },
        }),
      ]),

      h('button.global-menu__item', {
        on: { click: () => { showDetectionModal = true; showGlobalMenu = false; redraw(); } },
      }, 'Detection Settings…'),

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

// --- Mobile nav ---

function renderMobileNav(route: Route, redraw: () => void): VNode {
  const active = activeSection(route);
  return h('div.header__mobile-nav', [
    h('button.header__hamburger', {
      class: { active: showMobileNav },
      attrs: { title: 'Menu', 'aria-label': 'Menu' },
      on: { click: () => { showMobileNav = !showMobileNav; redraw(); } },
    }, '☰'),
    showMobileNav ? h('div.header__mobile-backdrop', {
      on: { click: () => { showMobileNav = false; redraw(); } },
    }) : null,
    showMobileNav ? h('div.header__mobile-dropdown', navLinks.map(({ label, href, section }) =>
      h('a.header__mobile-link', {
        attrs: { href },
        class: { active: active === section },
        on: { click: () => { showMobileNav = false; redraw(); } },
      }, label)
    )) : null,
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
      h('div.header__panel-label', 'Platform'),
      h('div.header__panel-row', [
        h('button.header__pill', {
          class: { active: importPlatform === 'chesscom' },
          on: { click: () => { importPlatform = 'chesscom'; redraw(); } },
        }, 'Chess.com'),
        h('button.header__pill', {
          class: { active: importPlatform === 'lichess' },
          on: { click: () => { importPlatform = 'lichess'; redraw(); } },
        }, 'Lichess'),
      ]),
    ]),

    h('div.header__panel-divider'),

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
    renderMobileNav(route, redraw),

    h('div.header__search', { key: 'header-search' }, [
      h('div.header__bar', [
        h('button.header__platform-toggle', {
          attrs: { title: importPlatform === 'chesscom' ? 'Switch to Lichess' : 'Switch to Chess.com' },
          on: { click: () => { importPlatform = importPlatform === 'chesscom' ? 'lichess' : 'chesscom'; redraw(); } },
        }, importPlatform === 'chesscom' ? 'Chess.com' : 'Lichess'),

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
    renderReviewMenu(redraw),
    renderGlobalMenu(deps),
  ]);
}
