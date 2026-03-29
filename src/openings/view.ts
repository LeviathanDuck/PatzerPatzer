/**
 * Openings subsystem view — renders the openings page shell.
 *
 * Adapted from Lichess ctrl/view separation pattern.
 * Import workflow follows OpeningTree-style: source -> details -> actions.
 */
import { h, type VNode } from 'snabbdom';
import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import { parseFen } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { Chess } from 'chessops/chess';
import { bindBoardResizeHandle } from '../board/index';
import {
  collections, collectionsLoaded, loadSavedCollections,
  openingsPage, activeCollection, sessionNode, sessionPath, openingTree, sampleGames,
  boardOrientation, flipBoard, colorFilter, setColorFilter,
  openCollection, closeSession, navigateToMove, navigateBack, navigateToRoot, navigateToPath,
  removeCollection, renameCollection,
  treeBuilding, treeBuildProgress, treeBuildTotal,
  importStep, importSource, importUsername, importColor, importError,
  importProgress, lastCreatedCollection, cancelImport,
  importSpeeds, setImportSpeeds, importDateRange, setImportDateRange,
  importCustomFrom, setImportCustomFrom, importCustomTo, setImportCustomTo,
  importRated, setImportRated, importMaxGames, setImportMaxGames,
  setImportStep, setImportSource, setImportUsername, setImportColor,
  resetImport,
} from './ctrl';
import { SPEED_OPTIONS, DATE_RANGE_OPTIONS, type ImportSpeed, type ImportDateRange } from '../import/filters';
import type { ResearchCollection, ResearchGame, ResearchSource } from './types';
import type { OpeningTreeNode } from './tree';
import { executeResearchImport } from './import';
import type { OpeningMoveStats, ExplorerDb } from './explorer';
import { explorerCtrl, MAX_EXPLORER_DEPTH } from './explorerCtrl';
import { ALL_SPEEDS, ALL_RATINGS, ALL_MODES } from './explorerConfig';
import { renderCeval, renderPvBox, renderEngineSettings, setCevalFenOverride } from '../ceval/view';
import { engineEnabled, evalCurrentPosition } from '../engine/ctrl';

let _openingsCg: CgApi | undefined;
let _lastBoardFen: string = '';

/** Render the openings page (library or session). */
export function renderOpeningsPage(redraw: () => void): VNode {
  const page = openingsPage();
  if (page === 'session') return renderSessionPage(redraw);
  return renderLibraryPage(redraw);
}

// ========== Library page ==========

function renderLibraryPage(redraw: () => void): VNode {
  if (!collectionsLoaded()) {
    void loadSavedCollections(redraw);
    return h('div.openings', [
      h('div.openings__header', [
        h('h1.openings__title', 'Opening Preparation'),
      ]),
      h('div.openings__body', [
        h('div.openings__loading', 'Loading collections\u2026'),
      ]),
    ]);
  }

  const saved = collections();
  const step = importStep();

  return h('div.openings', [
    h('div.openings__header', [
      h('h1.openings__title', 'Opening Preparation'),
      step === 'idle'
        ? h('button.openings__new-btn', {
            on: { click: () => { setImportStep('source'); redraw(); } },
          }, 'New Research')
        : null,
    ]),
    step !== 'idle'
      ? renderImportWorkflow(redraw)
      : h('div.openings__body', saved.length === 0
          ? [renderEmptyState(redraw)]
          : [renderCollectionList(saved, redraw)],
        ),
  ]);
}

function renderEmptyState(redraw: () => void): VNode {
  return h('div.openings__empty', [
    h('div.openings__empty-icon', '\u265E'),
    h('h2.openings__empty-title', 'Opening Preparation'),
    h('p', 'Research your opponents\u2019 openings by importing their games.'),
    h('p.openings__hint', 'Games are stored separately from your analysis library.'),
    h('button.openings__start-btn', {
      on: { click: () => { setImportStep('source'); redraw(); } },
    }, 'Start New Research'),
  ]);
}

function renderCollectionList(items: readonly ResearchCollection[], redraw: () => void): VNode {
  return h('div.openings__collections', items.map(c =>
    h('div.openings__collection-row', { key: c.id }, [
      h('div.openings__collection-main', {
        on: { click: () => { openCollection(c, redraw); } },
      }, [
        h('span.openings__collection-name', c.name),
        h('span.openings__collection-meta', [
          `${c.games.length} game${c.games.length !== 1 ? 's' : ''}`,
          ' \u00B7 ',
          c.source,
          ' \u00B7 ',
          new Date(c.createdAt).toLocaleDateString(),
        ]),
      ]),
      h('div.openings__collection-actions', [
        h('button.openings__col-rename', {
          attrs: { title: 'Rename' },
          on: { click: (e: Event) => {
            e.stopPropagation();
            const name = prompt('Rename collection:', c.name);
            if (name && name.trim()) void renameCollection(c.id, name.trim(), redraw);
          } },
        }, '\u270E'),
        h('button.openings__col-delete', {
          attrs: { title: 'Delete' },
          on: { click: (e: Event) => {
            e.stopPropagation();
            if (confirm(`Delete "${c.name}"? This cannot be undone.`)) {
              void removeCollection(c.id, redraw);
            }
          } },
        }, '\u2715'),
      ]),
    ]),
  ));
}

// ========== Import workflow ==========

function renderImportWorkflow(redraw: () => void): VNode {
  const step = importStep();
  return h('div.openings__import', [
    h('div.openings__import-header', [
      h('span', 'New Opponent Research'),
      h('button.header__panel-btn.--ghost', {
        on: { click: () => { resetImport(); redraw(); } },
      }, 'Cancel'),
    ]),
    step === 'source' ? renderSourceStep(redraw) : null,
    step === 'details' ? renderDetailsStep(redraw) : null,
    step === 'importing' ? renderImportingStep(redraw) : null,
    step === 'done' ? renderDoneStep(redraw) : null,
  ]);
}

function renderSourceStep(redraw: () => void): VNode {
  const src = importSource();
  const sources: { value: ResearchSource; label: string }[] = [
    { value: 'lichess', label: 'Lichess' },
    { value: 'chesscom', label: 'Chess.com' },
    { value: 'pgn', label: 'PGN Upload' },
  ];
  return h('div.openings__step', [
    h('div.header__panel-section', [
      h('div.header__panel-label', 'Source'),
      h('div.header__panel-row', sources.map(s =>
        h('button.header__pill', {
          class: { active: src === s.value },
          on: { click: () => { setImportSource(s.value); redraw(); } },
        }, s.label),
      )),
    ]),
    h('div.header__panel-divider'),
    h('div.header__panel-section', [
      h('div.header__panel-row', [
        h('button.header__panel-btn', {
          on: { click: () => { setImportStep('details'); redraw(); } },
        }, 'Next \u2192'),
      ]),
    ]),
  ]);
}

function renderDetailsStep(redraw: () => void): VNode {
  const src = importSource();
  const color = importColor();
  const err = importError();
  const speeds = importSpeeds();
  const dateRange = importDateRange();

  const sections: (VNode | null)[] = [];

  // --- Username / PGN input ---
  sections.push(
    src !== 'pgn' ? h('div.header__panel-section', [
      h('div.header__panel-label', 'Username'),
      h('input.header__text-input', {
        attrs: {
          type: 'text',
          placeholder: `${src === 'lichess' ? 'Lichess' : 'Chess.com'} username`,
          autocomplete: 'off',
          'data-lpignore': 'true',
          'data-1p-ignore': 'true',
          'data-bwignore': 'true',
          'data-form-type': 'other',
        },
        props: { value: importUsername() },
        on: { input: (e: Event) => { setImportUsername((e.target as HTMLInputElement).value); redraw(); } },
      }),
    ]) : h('div.header__panel-section', [
      h('div.header__panel-label', 'Paste PGN'),
      h('textarea.header__pgn-input', {
        attrs: { placeholder: 'Paste PGN text here\u2026', rows: '6' },
        on: { input: (e: Event) => { setImportUsername((e.target as HTMLTextAreaElement).value); redraw(); } },
      }),
    ]),
  );

  // --- Perspective ---
  sections.push(h('div.header__panel-divider'));
  sections.push(h('div.header__panel-section', [
    h('div.header__panel-label', 'Perspective'),
    h('div.header__panel-row', (['white', 'black', 'both'] as const).map(c =>
      h('button.header__pill', {
        class: { active: color === c },
        on: { click: () => { setImportColor(c); redraw(); } },
      }, c.charAt(0).toUpperCase() + c.slice(1)),
    )),
  ]));

  if (src !== 'pgn') {
    // --- Time control ---
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('div.header__panel-label', 'Time control'),
      h('div.header__panel-row', [
        h('button.header__pill', {
          class: { active: speeds.size === 0 },
          on: { click: () => { setImportSpeeds(new Set()); redraw(); } },
        }, 'All'),
        ...SPEED_OPTIONS.map(({ value, label, icon }) =>
          h('button.header__pill', {
            class: { active: speeds.has(value) },
            attrs: { 'data-icon': icon },
            on: { click: () => {
              const s = new Set(speeds);
              s.has(value) ? s.delete(value) : s.add(value);
              setImportSpeeds(s);
              redraw();
            } },
          }, label),
        ),
      ]),
    ]));

    // --- Period ---
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('div.header__panel-label', 'Period'),
      h('div.header__panel-row', [
        ...DATE_RANGE_OPTIONS.map(({ value, label }) =>
          h('button.header__pill', {
            class: { active: dateRange === value },
            on: { click: () => { setImportDateRange(value as ImportDateRange); redraw(); } },
          }, label),
        ),
      ]),
      dateRange === 'custom' ? h('div.header__panel-row.--mt', [
        h('span', 'From'),
        h('input.header__date-input', {
          attrs: { type: 'date' },
          props: { value: importCustomFrom() },
          on: { change: (e: Event) => { setImportCustomFrom((e.target as HTMLInputElement).value); redraw(); } },
        }),
        h('span', 'To'),
        h('input.header__date-input', {
          attrs: { type: 'date' },
          props: { value: importCustomTo() },
          on: { change: (e: Event) => { setImportCustomTo((e.target as HTMLInputElement).value); redraw(); } },
        }),
      ]) : null,
    ]));

    // --- Rated only ---
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('label.header__panel-check', [
        h('input', {
          attrs: { type: 'checkbox' },
          props: { checked: importRated() },
          on: { change: (e: Event) => { setImportRated((e.target as HTMLInputElement).checked); redraw(); } },
        }),
        ' Rated only',
      ]),
    ]));

    // --- Max games ---
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('div.header__panel-label', 'Max games'),
      h('input.header__text-input.header__text-input--short', {
        attrs: { type: 'number', min: '1', max: '200' },
        props: { value: importMaxGames() },
        on: { change: (e: Event) => { setImportMaxGames(parseInt((e.target as HTMLInputElement).value, 10) || 50); redraw(); } },
      }),
    ]));
  }

  // --- Error + actions ---
  sections.push(h('div.header__panel-divider'));
  sections.push(h('div.header__panel-section', [
    err ? h('div.header__panel-error', err) : null,
    h('div.header__panel-row', [
      h('button.header__panel-btn', {
        on: { click: () => { setImportStep('source'); redraw(); } },
      }, '\u2190 Back'),
      h('button.header__panel-btn', {
        attrs: { disabled: src !== 'pgn' && importUsername().trim() === '' },
        on: { click: () => { void executeResearchImport(redraw); } },
      }, 'Import'),
    ]),
  ]));

  return h('div.openings__step', sections);
}

function renderImportingStep(redraw: () => void): VNode {
  const progress = importProgress();

  return h('div.openings__step', [
    h('h3', 'Importing Games'),
    // Transfer animation
    h('div.openings__transfer', [
      h('div.openings__transfer-track', [
        h('div.openings__transfer-pulse'),
        h('div.openings__transfer-pulse.openings__transfer-pulse--delayed'),
      ]),
      h('div.openings__transfer-count',
        progress > 0
          ? `${progress.toLocaleString()} game${progress !== 1 ? 's' : ''} found`
          : 'Connecting\u2026',
      ),
    ]),
    h('button.openings__cancel-import-btn', {
      on: { click: () => { cancelImport(); redraw(); } },
    }, 'Cancel'),
  ]);
}

function renderDoneStep(redraw: () => void): VNode {
  const collection = lastCreatedCollection();
  return h('div.openings__step', [
    h('h3', 'Import Complete'),
    collection ? h('p.openings__done-summary', [
      `Created collection "${collection.name}" with ${collection.games.length} game${collection.games.length !== 1 ? 's' : ''}.`,
    ]) : null,
    h('button.openings__done-btn', {
      on: { click: () => { resetImport(); redraw(); } },
    }, 'Back to Library'),
  ]);
}

// ========== Session page (board shell) ==========

let _keyHandler: ((e: KeyboardEvent) => void) | null = null;

function renderSessionPage(redraw: () => void): VNode {
  const collection = activeCollection();
  const node = sessionNode();
  const path = sessionPath();

  return h('div.openings.openings--session', {
    hook: {
      insert: () => {
        _keyHandler = (e: KeyboardEvent) => {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateBack();
            syncOpeningsBoard(redraw);
            redraw();
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            const cur = sessionNode();
            if (cur && cur.children.length > 0) {
              navigateToMove(cur.children[0]!.uci);
              syncOpeningsBoard(redraw);
              redraw();
            }
          } else if (e.key === 'Home') {
            e.preventDefault();
            navigateToRoot();
            syncOpeningsBoard(redraw);
            redraw();
          }
        };
        document.addEventListener('keydown', _keyHandler);
      },
      destroy: () => {
        if (_keyHandler) {
          document.removeEventListener('keydown', _keyHandler);
          _keyHandler = null;
        }
      },
    },
  }, [
    h('div.openings__session-header', [
      h('button.openings__back-lib-btn', {
        on: { click: () => { _openingsCg = undefined; setCevalFenOverride(null); closeSession(); redraw(); } },
      }, '\u2190 Library'),
      h('h2.openings__session-title', collection?.name ?? 'Opening Research'),
      h('span.openings__session-meta', node
        ? `${node.total} game${node.total !== 1 ? 's' : ''} reached this position`
        : ''),
      // Color filter: White / Black
      h('div.openings__color-filter', [
        h('button.openings__color-btn', {
          class: { active: colorFilter() === 'white' },
          on: { click: () => { setColorFilter('white'); _lastBoardFen = ''; syncOpeningsBoard(redraw); redraw(); }},
          attrs: { title: 'Show games as White' },
        }, 'White'),
        h('button.openings__color-btn', {
          class: { active: colorFilter() === 'black' },
          on: { click: () => { setColorFilter('black'); _lastBoardFen = ''; syncOpeningsBoard(redraw); redraw(); }},
          attrs: { title: 'Show games as Black' },
        }, 'Black'),
      ]),
      h('button.openings__flip-btn', {
        attrs: { title: `Flip board (viewing as ${boardOrientation()})` },
        on: { click: () => {
          flipBoard();
          if (_openingsCg) {
            _openingsCg.set({ orientation: boardOrientation() });
          }
          redraw();
        } },
      }, '\u21C5'),
    ]),
    h('div.openings__session-body', [
      h('div.openings__board-col', [
        renderPlayerStrip(collection, 'top'),
        h('div.openings__board-wrap', [
          renderOpeningsBoard(node, redraw),
        ]),
        renderPlayerStrip(collection, 'bottom'),
      ]),
      h('div.openings__session-panel', [
        treeBuilding() ? renderTreeBuildBar() : null,
        renderMovePath(path, redraw),
        renderMoveNav(path, redraw),
        // Keep FEN override in sync with the current openings position on every render.
        // setCevalFenOverride also calls setEvalFenOverride so engine/ctrl uses the right FEN.
        (() => {
          setCevalFenOverride(node?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
          return null;
        })(),
        renderCeval(),
        renderEngineSettings(),
        engineEnabled ? renderPvBox() : null,
        node ? renderPlayedLinesPanel(node, redraw) : null,
        renderSampleGamesPanel(),
        renderExplorerToggle(node, redraw),
      ]),
    ]),
  ]);
}

/**
 * Player strip showing the target user and opponent labels around the board.
 * The target (researched player) appears on the side matching their color.
 */
function renderPlayerStrip(
  collection: ResearchCollection | null,
  position: 'top' | 'bottom',
): VNode {
  const target = collection?.target ?? 'Player';
  const orientation = boardOrientation();
  const filter = colorFilter();

  // Determine which color label goes on which side of the board
  // Bottom = the side the board is oriented toward
  // When orientation = 'white': bottom = white, top = black
  // When orientation = 'black': bottom = black, top = white
  const bottomColor: 'white' | 'black' = orientation;
  const topColor: 'white' | 'black' = orientation === 'white' ? 'black' : 'white';
  const stripColor = position === 'bottom' ? bottomColor : topColor;

  // Is the target player on this side?
  let label: string;
  let isTarget = false;
  if (filter === 'white') {
    isTarget = stripColor === 'white';
    label = isTarget ? target : 'Opponents';
  } else if (filter === 'black') {
    isTarget = stripColor === 'black';
    label = isTarget ? target : 'Opponents';
  } else {
    // 'both' — show target on bottom, opponents on top
    isTarget = position === 'bottom';
    label = isTarget ? target : 'Opponents';
  }

  const colorDot = stripColor === 'white' ? '\u25CB' : '\u25CF'; // ○ or ●

  return h('div.openings__player-strip', {
    class: {
      'openings__player-strip--target': isTarget,
      'openings__player-strip--top': position === 'top',
      'openings__player-strip--bottom': position === 'bottom',
    },
  }, [
    h('span.openings__player-dot', colorDot),
    h('span.openings__player-name', label),
  ]);
}

function renderOpeningsBoard(node: OpeningTreeNode | null, redraw: () => void): VNode {
  const fen = node?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  return h('div.cg-wrap.openings__board', {
    key: 'openings-board',
    hook: {
      insert: (vnode) => {
        const dests = destsForFen(fen);
        _lastBoardFen = fen;
        setCevalFenOverride(fen);
        _openingsCg = makeChessground(vnode.elm as HTMLElement, {
          fen,
          orientation: boardOrientation(),
          viewOnly: false,
          movable: {
            free: false,
            color: 'both',
            dests,
          },
          draggable: {
            enabled: false,
            showGhost: false,
          },
          drawable: {
            enabled: true,
            brushes: {
              green:    { key: 'g',  color: '#15781B', opacity: 0.8,  lineWidth: 10 },
              yellow:   { key: 'y',  color: '#e6a520', opacity: 0.55, lineWidth: 8 },
              paleGrey: { key: 'pg', color: '#888888', opacity: 0.35, lineWidth: 6 },
              ...FREQ_BRUSHES,
            },
          },
          events: {
            move: (orig, dest) => {
              // Find matching child by checking UCI
              const uci = `${orig}${dest}`;
              if (node) {
                const match = node.children.find(c =>
                  c.uci === uci || c.uci.startsWith(uci),
                );
                if (match) {
                  navigateToMove(match.uci);
                  syncOpeningsBoard(redraw);
                  redraw();
                }
              }
            },
          },
        });
        bindBoardResizeHandle(vnode.elm as HTMLElement);
        // Draw initial arrows for the starting position
        if (node && _openingsCg) {
          _openingsCg.setAutoShapes(buildFrequencyArrows(node));
        }
      },
      postpatch: () => {
        // Sync arrows on every redraw (tree may have updated from background build)
        if (node && _openingsCg) {
          _openingsCg.setAutoShapes(buildFrequencyArrows(node));
        }
      },
      destroy: () => {
        _lastBoardFen = '';
        if (_openingsCg) {
          _openingsCg.destroy();
          _openingsCg = undefined;
        }
      },
    },
  });
}

// --- Cached dests to avoid recomputing for the same FEN ---
let _cachedDestsFen = '';
let _cachedDests: Map<string, string[]> = new Map();

function destsForFen(fen: string): Map<string, string[]> {
  if (fen === _cachedDestsFen) return _cachedDests;
  const setup = parseFen(fen);
  const pos = setup.isOk ? Chess.fromSetup(setup.value) : undefined;
  _cachedDests = pos?.isOk ? chessgroundDests(pos.value) : new Map();
  _cachedDestsFen = fen;
  return _cachedDests;
}

function syncOpeningsBoard(_redraw: () => void): void {
  const node = sessionNode();
  if (!_openingsCg || !node) return;
  const fen = node.fen;
  // Skip if nothing changed
  if (fen === _lastBoardFen) return;
  _lastBoardFen = fen;
  _openingsCg.set({
    fen,
    orientation: boardOrientation(),
    movable: { dests: destsForFen(fen) },
    lastMove: node.uci ? [node.uci.slice(0, 2), node.uci.slice(2, 4)] : undefined,
  });
  _openingsCg.setAutoShapes(buildFrequencyArrows(node));
  // Update FEN override and re-evaluate if engine is on.
  setCevalFenOverride(fen);
  if (engineEnabled) evalCurrentPosition();
}

// Pre-built opacity brushes for frequency arrows (registered once at board init).
const FREQ_BRUSHES: Record<string, { key: string; color: string; opacity: number; lineWidth: number }> = {};
for (let i = 0; i < 8; i++) {
  // Pre-register 8 brushes with descending opacity: 0.85, 0.70, 0.55, ...
  const opacity = Math.max(0.15, 0.85 - i * 0.1);
  FREQ_BRUSHES[`freq${i}`] = { key: `f${i}`, color: '#15781B', opacity, lineWidth: 10 };
}

/**
 * Frequency arrows for child moves.
 * Same green color, width scales with frequency, opacity via pre-registered brushes.
 */
function buildFrequencyArrows(node: OpeningTreeNode): {
  orig: string; dest: string; brush: string;
  modifiers?: { lineWidth: number };
}[] {
  if (!node.children.length || node.total === 0) return [];
  const maxTotal = node.children[0]!.total;
  if (maxTotal === 0) return [];

  const shapes: { orig: string; dest: string; brush: string; modifiers?: { lineWidth: number } }[] = [];
  const count = Math.min(node.children.length, 8);
  for (let i = 0; i < count; i++) {
    const child = node.children[i]!;
    const ratio = child.total / maxTotal;
    const width = Math.max(3, Math.round(14 * Math.sqrt(ratio)));
    shapes.push({
      orig: child.uci.slice(0, 2),
      dest: child.uci.slice(2, 4),
      brush: `freq${i}`,
      modifiers: { lineWidth: width },
    });
  }
  return shapes;
}

function renderTreeBuildBar(): VNode {
  const progress = treeBuildProgress();
  const total = treeBuildTotal();
  const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
  return h('div.openings__tree-build', [
    h('div.openings__tree-build-bar', [
      h('div.openings__tree-build-fill', {
        attrs: { style: `width:${pct}%` },
      }),
    ]),
    h('span.openings__tree-build-label',
      `Building tree\u2026 ${progress.toLocaleString()} / ${total.toLocaleString()} games (${pct}%)`),
  ]);
}

function renderMoveNav(path: readonly string[], redraw: () => void): VNode {
  const node = sessionNode();
  const canForward = node !== null && node.children.length > 0;
  return h('div.openings__nav', [
    h('button.openings__nav-btn', {
      attrs: { disabled: path.length === 0, title: 'Go to start' },
      on: { click: () => { navigateToRoot(); syncOpeningsBoard(redraw); redraw(); } },
    }, '\u23EE'),
    h('button.openings__nav-btn', {
      attrs: { disabled: path.length === 0, title: 'Back one move' },
      on: { click: () => { navigateBack(); syncOpeningsBoard(redraw); redraw(); } },
    }, '\u25C0'),
    h('button.openings__nav-btn', {
      attrs: { disabled: !canForward, title: 'Most popular continuation' },
      on: { click: () => {
        if (node && node.children.length > 0) {
          navigateToMove(node.children[0]!.uci);
          syncOpeningsBoard(redraw);
          redraw();
        }
      } },
    }, '\u25B6'),
    h('span.openings__nav-depth', `Move ${Math.ceil(path.length / 2)}`),
  ]);
}

/** Render the current line as a clickable breadcrumb trail. */
function renderMovePath(path: readonly string[], redraw: () => void): VNode {
  if (path.length === 0) {
    return h('div.openings__path', [h('span.openings__path-start', 'Starting position')]);
  }

  // Walk the tree to get SAN labels for each step
  const tree = openingTree();
  const labels: { san: string; pathTo: string[] }[] = [];
  if (tree) {
    let current: OpeningTreeNode | undefined = tree;
    for (let i = 0; i < path.length; i++) {
      const child = current?.children.find(c => c.uci === path[i]);
      if (!child) break;
      labels.push({ san: child.san, pathTo: path.slice(0, i + 1) as string[] });
      current = child;
    }
  }

  return h('div.openings__path', [
    h('span.openings__path-start', {
      on: { click: () => { navigateToRoot(); syncOpeningsBoard(redraw); redraw(); } },
    }, 'Start'),
    ...labels.map((l, i) => {
      const moveNum = Math.floor(i / 2) + 1;
      const isWhite = i % 2 === 0;
      const prefix = isWhite ? `${moveNum}. ` : (i === 0 ? '1... ' : '');
      return h('span.openings__path-move', {
        on: { click: () => { navigateToPath(l.pathTo); syncOpeningsBoard(redraw); redraw(); } },
      }, `${prefix}${l.san}`);
    }),
  ]);
}

function renderPlayedLinesPanel(node: OpeningTreeNode, redraw: () => void): VNode {
  return h('div.openings__lines-panel', [
    // Position header: game count + result bar — visually separated from moves
    h('div.openings__pos-header', [
      h('div.openings__pos-summary', [
        h('span.openings__pos-total', `${node.total} game${node.total !== 1 ? 's' : ''}`),
        h('span.openings__pos-label', 'reached this position'),
      ]),
      renderResultBar(node),
    ]),
    // Played lines
    node.children.length === 0
      ? h('div.openings__moves-empty', 'No further moves in this collection.')
      : h('div.openings__moves',
          node.children.map(child => renderMoveRow(child, node.total, redraw)),
        ),
  ]);
}

function renderMoveRow(child: OpeningTreeNode, parentTotal: number, redraw: () => void): VNode {
  const pct = parentTotal > 0 ? ((child.total / parentTotal) * 100).toFixed(1) : '0';

  return h('div.openings__move-row', {
    key: child.uci,
    on: { click: () => { navigateToMove(child.uci); syncOpeningsBoard(redraw); redraw(); } },
  }, [
    h('span.openings__move-san', child.san),
    h('span.openings__move-count', `${child.total} (${pct}%)`),
    renderResultBar(child),
  ]);
}

/**
 * Lichess masters-database-style result bar.
 * Segments use display:inline-block with percentage width — the same
 * technique as lichess-org/lila ui/analyse/src/explorer/explorerView.ts.
 * Labels appear inside segments when wide enough.
 */
/**
 * Lichess masters-database-style result bar.
 * Segments use inline-block with percentage widths set via the style attribute.
 * Note: Snabbdom's styleModule is not loaded in this app, so we use
 * attrs.style (string) instead of the style object.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts
 */
function renderResultBar(node: { white: number; draws: number; black: number }): VNode {
  const sum = node.white + node.draws + node.black || 1;
  const wPct = (node.white * 100) / sum;
  const dPct = (node.draws * 100) / sum;
  const bPct = (node.black * 100) / sum;
  const wW = Math.round(wPct * 10) / 10;
  const dW = Math.round(dPct * 10) / 10;
  const bW = Math.round(bPct * 10) / 10;
  // Lichess convention: show label if segment > 12%, show '%' if > 20%
  const label = (p: number) => p > 12 ? `${Math.round(p)}${p > 20 ? '%' : ''}` : '';
  return h('div.openings__result-bar', [
    h('span.openings__bar-w', { attrs: { style: `width:${wW}%` } }, label(wPct)),
    h('span.openings__bar-d', { attrs: { style: `width:${dW}%` } }, label(dPct)),
    h('span.openings__bar-b', { attrs: { style: `width:${bW}%` } }, label(bPct)),
  ]);
}

// ========== Sample games panel ==========

function renderSampleGamesPanel(): VNode {
  const games = sampleGames(5);
  if (games.length === 0) {
    return h('div.openings__samples', [
      h('h3.openings__samples-title', 'Example Games'),
      h('div.openings__samples-empty', 'No games match this position.'),
    ]);
  }
  return h('div.openings__samples', [
    h('h3.openings__samples-title', `Example Games (${games.length})`),
    ...games.map(renderSampleGameRow),
  ]);
}

/** Extract game URL from PGN headers (Site for Lichess, Link for Chess.com). */
function extractGameUrl(pgn: string): string | null {
  // Try [Link "..."] first (Chess.com)
  const linkMatch = pgn.match(/\[Link\s+"([^"]+)"\]/);
  if (linkMatch?.[1]) return linkMatch[1];
  // Try [Site "..."] (Lichess — contains https://lichess.org/...)
  const siteMatch = pgn.match(/\[Site\s+"(https?:\/\/[^"]+)"\]/);
  if (siteMatch?.[1]) return siteMatch[1];
  return null;
}

function renderSampleGameRow(game: ResearchGame): VNode {
  const players = [game.white ?? '?', game.black ?? '?'].join(' vs ');
  const result = game.result ?? '*';
  const info: string[] = [];
  if (game.opening) info.push(game.opening);
  if (game.date) info.push(game.date);
  if (game.timeClass) info.push(game.timeClass);
  const ratings: string[] = [];
  if (game.whiteRating) ratings.push(`W:${game.whiteRating}`);
  if (game.blackRating) ratings.push(`B:${game.blackRating}`);
  const gameUrl = extractGameUrl(game.pgn);

  return h('div.openings__sample-row', {
    key: game.id,
    class: { 'openings__sample-row--clickable': !!gameUrl },
    on: gameUrl ? { click: () => window.open(gameUrl, '_blank') } : {},
  }, [
    h('div.openings__sample-players', [
      h('span', players),
      h('span.openings__sample-result', result),
    ]),
    info.length > 0
      ? h('div.openings__sample-info', [
          info.join(' \u00B7 '),
          ratings.length > 0 ? ` \u00B7 ${ratings.join(' ')}` : '',
        ])
      : null,
    h('div.openings__sample-actions', [
      h('button.openings__sample-copy', {
        attrs: { title: 'Copy PGN' },
        on: { click: (e: Event) => {
          e.stopPropagation();
          void navigator.clipboard.writeText(game.pgn).then(() => {
            const btn = e.target as HTMLButtonElement;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy PGN'; }, 1500);
          });
        } },
      }, 'Copy PGN'),
      game.source === 'lichess' && game.pgn
        ? h('a.openings__sample-link', {
            attrs: {
              href: extractLichessUrl(game.pgn),
              target: '_blank',
              rel: 'noopener',
              title: 'View on Lichess',
            },
          }, 'Lichess')
        : null,
    ]),
  ]);
}

function extractLichessUrl(pgn: string): string {
  const site = pgn.match(/\[Site\s+"([^"]+)"]/)?.[1];
  return site && site.includes('lichess.org') ? site : '#';
}

// ========== Lichess Explorer comparison ==========

/**
 * Render the appropriate error box for a failed explorer request.
 * 401 errors get a "Connect to Lichess" prompt instead of the generic message.
 */
function renderExplorerErrorBox(err: Error, fen: string, redraw: () => void): VNode {
  const isAuthError = err.message.includes('401') || err.message.includes('Unauthorized') || err.message.includes('Not connected');
  if (isAuthError) {
    return h('div.openings__explorer-box', { class: { reduced: true } }, [
      h('div.overlay'),
      h('div.openings__explorer-message', [
        h('strong', 'Lichess account required'),
        h('p.openings__explorer-explanation', 'The opening book requires a Lichess login.'),
        h('a.openings__explorer-connect-btn', {
          attrs: { href: '/api/lichess/connect' },
        }, 'Connect to Lichess'),
      ]),
    ]);
  }
  return h('div.openings__explorer-box', { class: { reduced: true } }, [
    h('div.overlay'),
    h('div.openings__explorer-message', [
      h('h3', 'Oops, sorry!'),
      h('p.openings__explorer-explanation', err.message),
      h('button.openings__explorer-retry', {
        on: { click: () => { explorerCtrl.reload(fen, redraw); redraw(); } },
      }, 'Retry'),
    ]),
  ]);
}

function renderExplorerToggle(node: OpeningTreeNode | null, redraw: () => void): VNode {
  const enabled = explorerCtrl.enabled;
  return h('div.openings__explorer', [
    h('div.openings__explorer-header', [
      h('label.openings__explorer-label', [
        h('input', {
          attrs: { type: 'checkbox', checked: enabled },
          on: {
            change: () => {
              explorerCtrl.toggle();
              if (explorerCtrl.enabled && node) explorerCtrl.setNode(node.fen, redraw);
              redraw();
            },
          },
        }),
        ' Opening Book',
      ]),
      enabled ? h('button.openings__explorer-gear', {
        attrs: { title: 'Configure explorer' },
        on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
      }, '\u2699\uFE0F') : null,
    ]),
    enabled ? renderExplorerDbTabs(node, redraw) : null,
    enabled
      ? (explorerCtrl.configOpen ? renderExplorerConfigPanel(redraw) : renderExplorerPanel(node, redraw))
      : null,
  ]);
}

function renderExplorerDbTabs(node: OpeningTreeNode | null, redraw: () => void): VNode {
  const db = explorerCtrl.config.db;
  const setDb = (d: ExplorerDb) => {
    explorerCtrl.setDb(d);
    if (node) explorerCtrl.setNode(node.fen, redraw);
    redraw();
  };
  return h('div.openings__explorer-tabs', [
    h(`button.openings__explorer-tab${db === 'masters' ? '.active' : ''}`, { on: { click: () => setDb('masters') } }, 'Masters'),
    h(`button.openings__explorer-tab${db === 'lichess' ? '.active' : ''}`, { on: { click: () => setDb('lichess') } }, 'Lichess'),
    h(`button.openings__explorer-tab${db === 'player' ? '.active' : ''}`, { on: { click: () => setDb('player') } }, 'Player'),
  ]);
}

/**
 * Config panel — DB-specific filter controls.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerConfig.ts view()
 */
function renderExplorerConfigPanel(redraw: () => void): VNode {
  const cfg = explorerCtrl.config;
  const db = cfg.db;

  const toggleBtn = <T>(label: string, active: boolean, onClick: () => void) =>
    h('button.openings__explorer-filter-btn', {
      class: { active },
      on: { click: () => { onClick(); redraw(); } },
    }, label);

  const speedSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Time control'),
    h('div.openings__explorer-filter-row',
      ALL_SPEEDS.map(s => toggleBtn(s, cfg.speeds.includes(s), () => cfg.toggleSpeed(s))),
    ),
  ]);

  const ratingSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Avg rating'),
    h('div.openings__explorer-filter-row',
      ALL_RATINGS.map(r => toggleBtn(String(r), cfg.ratings.includes(r), () => cfg.toggleRating(r))),
    ),
  ]);

  const modeSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Mode'),
    h('div.openings__explorer-filter-row',
      ALL_MODES.map(m => toggleBtn(m, cfg.modes.includes(m), () => cfg.toggleMode(m))),
    ),
  ]);

  const dateInput = (label: string, value: string, onChange: (v: string) => void, type: 'number' | 'month') =>
    h('label.openings__explorer-date-label', [
      label,
      h('input', {
        attrs: { type, value, placeholder: type === 'number' ? 'YYYY' : 'YYYY-MM', min: type === 'number' ? '1952' : '1952-01' },
        on: { change: (e: Event) => { onChange((e.target as HTMLInputElement).value); redraw(); } },
      }),
    ]);

  const dateSection = (type: 'number' | 'month') =>
    h('div.openings__explorer-config-section', [
      dateInput('Since', cfg.since(), v => cfg.setSince(v), type),
      dateInput('Until', cfg.until(), v => cfg.setUntil(v), type),
    ]);

  const playerSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Player'),
    h('input.openings__explorer-player-input', {
      attrs: { type: 'text', placeholder: 'Lichess username', value: cfg.playerName },
      on: {
        change: (e: Event) => {
          cfg.setPlayerName((e.target as HTMLInputElement).value.trim());
          redraw();
        },
      },
    }),
    cfg.playerPrevious.length ? h('div.openings__explorer-player-prev',
      cfg.playerPrevious.slice(0, 10).map(name =>
        h('button.openings__explorer-prev-btn', {
          on: { click: () => { cfg.setPlayerName(name); redraw(); } },
        }, name),
      ),
    ) : null,
    h('div.openings__explorer-color-row', [
      h('label', 'Color'),
      toggleBtn('White', cfg.color === 'white', () => { cfg.color = 'white'; }),
      toggleBtn('Black', cfg.color === 'black', () => { cfg.color = 'black'; }),
    ]),
  ]);

  const sections: VNode[] = [];
  if (db === 'masters') sections.push(dateSection('number'));
  if (db === 'lichess') { sections.push(speedSection(), ratingSection(), dateSection('month')); }
  if (db === 'player') { sections.push(playerSection(), speedSection(), modeSection(), dateSection('month')); }

  return h('div.openings__explorer-config', [
    ...sections,
    h('button.openings__explorer-config-close', {
      on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
    }, 'Done'),
  ]);
}

/**
 * Explorer panel — handles all four UI states: loading, error, empty, and data.
 * Mirrors lichess-org/lila: ui/analyse/src/explorer/explorerView.ts main() function.
 *
 * - Preserves stale cached data under a loading overlay (`.loading` class)
 * - `.reduced` class when movesAway > 2 (position moved far from book)
 * - "Max depth reached" when at or beyond MAX_EXPLORER_DEPTH
 * - Queue position message when player DB is indexing
 * - Error state with retry button
 */
function renderExplorerPanel(node: OpeningTreeNode | null, redraw: () => void): VNode {
  if (!node) return h('div.openings__explorer-empty', 'No position selected.');

  const data = explorerCtrl.current(node.fen);
  if (!data && !explorerCtrl.loading && !explorerCtrl.failing) {
    explorerCtrl.setNode(node.fen, redraw);
  }

  const loading = explorerCtrl.loading;
  const failing = explorerCtrl.failing;
  const movesAway = explorerCtrl.movesAway;
  const isMasters = explorerCtrl.config.db === 'masters';

  // Error state — 401 shows a connect prompt; other errors show retry
  if (failing && !data) return renderExplorerErrorBox(failing, node.fen, redraw);

  // Empty state — no data and no longer loading
  if (!loading && !data) {
    const tooDeep = movesAway >= MAX_EXPLORER_DEPTH;
    const queuePos = (data as import('./explorer').OpeningData | undefined)?.queuePosition;
    return h('div.openings__explorer-box', { class: { reduced: movesAway > 2 } }, [
      h('div.openings__explorer-message', [
        h('strong', tooDeep ? 'Max depth reached' : 'No game found'),
        queuePos
          ? h('p.openings__explorer-explanation', `Indexing ${queuePos} other players first\u2026`)
          : !tooDeep
            ? h('p.openings__explorer-explanation', 'Try adjusting the filters.')
            : null,
      ]),
    ]);
  }

  // Data available — show with loading overlay if refreshing
  if (data) {
    const hasContent = data.moves.length > 0 || (data.topGames?.length ?? 0) > 0 || (data.recentGames?.length ?? 0) > 0;
    const queuePos = data.queuePosition;

    const content = hasContent
      ? h('div.openings__explorer-data', [
          data.opening
            ? h('div.openings__explorer-opening', `${data.opening.eco} ${data.opening.name}`)
            : null,
          renderExplorerMovesTable(data, node.fen, redraw),
          renderExplorerGamesTable('Top games', data.topGames ?? [], isMasters),
          renderExplorerGamesTable('Recent games', data.recentGames ?? [], isMasters),
        ])
      : h('div.openings__explorer-message', [
          h('strong', movesAway >= MAX_EXPLORER_DEPTH ? 'Max depth reached' : 'No game found'),
          queuePos
            ? h('p.openings__explorer-explanation', `Indexing ${queuePos} other players first\u2026`)
            : null,
        ]);

    return h('div.openings__explorer-box', { class: { loading, reduced: movesAway > 2 && !hasContent } }, [
      h('div.overlay'),
      content,
    ]);
  }

  // Still waiting on first response
  return h('div.openings__explorer-box', { class: { loading: true } }, [
    h('div.overlay'),
    h('div.openings__explorer-message', h('p', 'Loading\u2026')),
  ]);
}

/**
 * Top/recent games table — adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts showGameTable()
 * Columns: ratings (stacked), player names (stacked), result badge, month/year, speed icon (non-masters).
 * Row click opens the game on Lichess in a new tab.
 */
function renderExplorerGamesTable(
  title: string,
  games: import('./explorer').OpeningGame[],
  isMasters: boolean,
): VNode | null {
  if (!games.length) return null;
  const colSpan = isMasters ? 4 : 5;

  const resultBadge = (winner?: 'white' | 'black') =>
    winner === 'white'
      ? h('result.white', '1-0')
      : winner === 'black'
        ? h('result.black', '0-1')
        : h('result.draws', '\u00BD-\u00BD');

  const openGame = (gameId: string) => {
    const url = isMasters
      ? `https://lichess.org/import/master/${gameId}`
      : `https://lichess.org/${gameId}`;
    window.open(url, '_blank', 'noopener');
  };

  return h('table.explorer-games', [
    h('thead', h('tr', h('th', { attrs: { colspan: colSpan } }, title))),
    h('tbody',
      games.map(game =>
        h('tr', {
          key: game.id,
          attrs: { 'data-id': game.id, 'data-uci': game.uci ?? '' },
          on: { click: () => openGame(game.id) },
        }, [
          h('td.ratings', [
            h('span', String(game.white.rating)),
            h('span', String(game.black.rating)),
          ]),
          h('td.players', [
            h('span', game.white.name),
            h('span', game.black.name),
          ]),
          h('td', resultBadge(game.winner)),
          h('td.date', game.month ?? game.year ?? ''),
          !isMasters
            ? h('td.speed', game.speed ? h('span', { attrs: { title: game.speed } }, speedGlyph(game.speed)) : '')
            : null,
        ]),
      ),
    ),
  ]);
}

/** Simple text glyph for speed — no icon font required. */
function speedGlyph(speed: string): string {
  const glyphs: Record<string, string> = {
    ultraBullet: '\u26a1\u26a1', bullet: '\u26a1', blitz: '\uD83D\uDD25',
    rapid: '\u23F1', classical: '\u231B', correspondence: '\u2709',
  };
  return glyphs[speed] ?? speed;
}

/** Compact number formatter: 12400 → "12.4k", 1200000 → "1.2M". */
function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Render a stacked W/D/B result bar — adapted from Lichess explorerView.ts resultBar(). */
function renderExplorerResultBar(move: OpeningMoveStats): VNode {
  const sum = move.white + move.draws + move.black || 1;
  const seg = (key: 'white' | 'draws' | 'black') => {
    const pct = (move[key] * 100) / sum;
    const width = Math.round((move[key] * 1000) / sum) / 10;
    return h(`span.${key}`, { attrs: { style: `width: ${width}%` } },
      pct > 12 ? `${Math.round(pct)}${pct > 20 ? '%' : ''}` : '');
  };
  return h('div.bar', [seg('white'), seg('draws'), seg('black')]);
}

/**
 * Lichess-style moves table with result bar, hover arrows, and click-to-play.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts showMoveTable()
 * and ui/analyse/src/explorer/explorerUtil.ts moveArrowAttributes().
 *
 * @param onMoveClick — optional; defaults to openings navigateToMove. Analysis board passes its own.
 * @param cgBoard     — optional; defaults to openings board. Analysis board passes its Chessground.
 */
function renderExplorerMovesTable(
  data: import('./explorer').OpeningData,
  fen: string,
  redraw: () => void,
  onMoveClick?: (uci: string) => void,
  cgBoard?: CgApi,
): VNode {
  const sumTotal = (data.white ?? 0) + (data.draws ?? 0) + (data.black ?? 0) || 1;

  type SumRow = { uci: ''; san: string; white: number; black: number; draws: number };
  type AnyRow = OpeningMoveStats | SumRow;
  const rows: AnyRow[] = data.moves.length > 1
    ? [...data.moves, { uci: '' as '', san: '\u03A3', white: data.white ?? 0, black: data.black ?? 0, draws: data.draws ?? 0 }]
    : [...data.moves];

  const board = cgBoard ?? _openingsCg;
  const defaultMoveClick = (uci: string) => {
    navigateToMove(uci);
    const newNode = sessionNode();
    if (newNode) explorerCtrl.setNode(newNode.fen, redraw);
    redraw();
  };
  const handleMoveClick = onMoveClick ?? defaultMoveClick;

  return h('table.explorer-moves', {
    hook: {
      insert(vnode: import('snabbdom').VNode) {
        const el = vnode.elm as HTMLElement;
        el.addEventListener('mouseover', (e: MouseEvent) => {
          const tr = (e.target as HTMLElement).closest('tr');
          const uci = tr?.getAttribute('data-uci');
          if (uci) {
            explorerCtrl.setHovering(fen, uci);
            const orig = uci.slice(0, 2);
            const dest = uci.slice(2, 4);
            board?.setAutoShapes([{ orig: orig as any, dest: dest as any, brush: 'blue' }]);
          }
        });
        el.addEventListener('mouseout', () => {
          explorerCtrl.setHovering(fen, null);
          board?.setAutoShapes([]);
        });
        el.addEventListener('click', (e: MouseEvent) => {
          const tr = (e.target as HTMLElement).closest('tr');
          const uci = tr?.getAttribute('data-uci');
          if (uci) handleMoveClick(uci);
        });
      },
    },
  }, [
    h('thead', h('tr', [
      h('th', 'Move'), h('th', '%'), h('th', 'Games'), h('th', 'W/D/B'),
    ])),
    h('tbody', rows.map(move => {
      const total = move.white + move.draws + move.black || 1;
      const isSum = move.uci === '';
      return h(isSum ? 'tr.sum' : 'tr', {
        key: move.uci || '\u03A3',
        attrs: move.uci ? { 'data-uci': move.uci } : {},
      }, [
        h('td', move.san),
        h('td', `${((total / sumTotal) * 100).toFixed(0)}%`),
        h('td', compactNum(total)),
        h('td', renderExplorerResultBar(move as OpeningMoveStats)),
      ]);
    })),
  ]);
}

// ========== Analysis board explorer integration ==========

/**
 * Explorer section for the analysis board tools column.
 * Uses the same ExplorerCtrl singleton as the openings page.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts default export.
 *
 * @param fen         — current board FEN (from ctrl.node.fen)
 * @param cg          — analysis board Chessground instance (for hover arrows)
 * @param onMoveClick — called when a move row is clicked; should advance the analysis tree
 * @param redraw      — analysis board redraw function
 */
export function renderAnalysisExplorerSection(
  fen: string,
  cg: CgApi | undefined,
  onMoveClick: (uci: string) => void,
  redraw: () => void,
): VNode {
  const enabled = explorerCtrl.enabled;
  const isMasters = explorerCtrl.config.db === 'masters';

  return h('div.openings__explorer', [
    h('div.openings__explorer-header', [
      h('label.openings__explorer-label', [
        h('input', {
          attrs: { type: 'checkbox', checked: enabled },
          on: {
            change: () => {
              explorerCtrl.toggle();
              if (explorerCtrl.enabled) explorerCtrl.setNode(fen, redraw);
              redraw();
            },
          },
        }),
        ' Opening Book',
      ]),
      enabled ? h('button.openings__explorer-gear', {
        attrs: { title: 'Configure explorer' },
        on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
      }, '\u2699\uFE0F') : null,
    ]),
    enabled ? renderExplorerDbTabs(null, redraw) : null,
    enabled
      ? (explorerCtrl.configOpen
          ? renderExplorerConfigPanel(redraw)
          : renderAnalysisExplorerPanel(fen, isMasters, cg, onMoveClick, redraw))
      : null,
  ]);
}

/**
 * FEN-based explorer panel for the analysis board (no OpeningTreeNode dependency).
 * Mirrors renderExplorerPanel() but uses a plain FEN and custom move/arrow callbacks.
 */
function renderAnalysisExplorerPanel(
  fen: string,
  isMasters: boolean,
  cg: CgApi | undefined,
  onMoveClick: (uci: string) => void,
  redraw: () => void,
): VNode {
  const data = explorerCtrl.current(fen);
  if (!data && !explorerCtrl.loading && !explorerCtrl.failing) {
    explorerCtrl.setNode(fen, redraw);
  }

  const loading = explorerCtrl.loading;
  const failing = explorerCtrl.failing;
  const movesAway = explorerCtrl.movesAway;

  if (failing && !data) return renderExplorerErrorBox(failing, fen, redraw);

  if (!loading && !data) {
    const tooDeep = movesAway >= MAX_EXPLORER_DEPTH;
    return h('div.openings__explorer-box', { class: { reduced: movesAway > 2 } }, [
      h('div.openings__explorer-message', [
        h('strong', tooDeep ? 'Max depth reached' : 'No game found'),
        !tooDeep ? h('p.openings__explorer-explanation', 'Try adjusting the filters.') : null,
      ]),
    ]);
  }

  if (data) {
    const hasContent = data.moves.length > 0 || (data.topGames?.length ?? 0) > 0 || (data.recentGames?.length ?? 0) > 0;
    const content = hasContent
      ? h('div.openings__explorer-data', [
          data.opening ? h('div.openings__explorer-opening', `${data.opening.eco} ${data.opening.name}`) : null,
          renderExplorerMovesTable(data, fen, redraw, onMoveClick, cg),
          renderExplorerGamesTable('Top games', data.topGames ?? [], isMasters),
          renderExplorerGamesTable('Recent games', data.recentGames ?? [], isMasters),
        ])
      : h('div.openings__explorer-message', [
          h('strong', movesAway >= MAX_EXPLORER_DEPTH ? 'Max depth reached' : 'No game found'),
        ]);
    return h('div.openings__explorer-box', { class: { loading, reduced: movesAway > 2 && !hasContent } }, [
      h('div.overlay'),
      content,
    ]);
  }

  return h('div.openings__explorer-box', { class: { loading: true } }, [
    h('div.overlay'),
    h('div.openings__explorer-message', h('p', 'Loading\u2026')),
  ]);
}
