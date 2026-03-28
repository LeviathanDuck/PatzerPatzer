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
import {
  collections, collectionsLoaded, loadSavedCollections,
  openingsPage, activeCollection, sessionNode, sessionPath, openingTree, sampleGames,
  boardOrientation, flipBoard,
  openCollection, closeSession, navigateToMove, navigateBack, navigateToRoot, navigateToPath,
  removeCollection, renameCollection,
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
import {
  explorerEnabled, explorerLoading, explorerError, explorerData,
  toggleExplorer, fetchExplorer, type ExplorerMove,
} from './explorer';

let _openingsCg: CgApi | undefined;

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
        on: { click: () => { openCollection(c); redraw(); } },
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
      h('h2', 'New Opponent Research'),
      h('button.openings__cancel-btn', {
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
    h('h3', 'Select Source'),
    h('div.openings__source-options', sources.map(s =>
      h('button.openings__source-btn', {
        class: { active: src === s.value },
        on: { click: () => { setImportSource(s.value); redraw(); } },
      }, s.label),
    )),
    h('button.openings__next-btn', {
      on: { click: () => { setImportStep('details'); redraw(); } },
    }, 'Next'),
  ]);
}

function renderDetailsStep(redraw: () => void): VNode {
  const src = importSource();
  const color = importColor();
  const err = importError();
  const speeds = importSpeeds();
  const dateRange = importDateRange();

  return h('div.openings__step', [
    h('h3', src === 'pgn' ? 'PGN Upload' : 'Opponent Details'),

    // --- Username / PGN input ---
    src !== 'pgn' ? h('div.openings__field', [
      h('label', 'Username'),
      h('input.openings__input', {
        attrs: { type: 'text', placeholder: `${src === 'lichess' ? 'Lichess' : 'Chess.com'} username` },
        props: { value: importUsername() },
        on: { input: (e: Event) => { setImportUsername((e.target as HTMLInputElement).value); redraw(); } },
      }),
    ]) : h('div.openings__field', [
      h('label', 'Paste PGN or upload a file'),
      h('textarea.openings__textarea', {
        attrs: { placeholder: 'Paste PGN text here\u2026', rows: '6' },
        on: { input: (e: Event) => { setImportUsername((e.target as HTMLTextAreaElement).value); redraw(); } },
      }),
    ]),

    // --- Perspective ---
    h('div.openings__field', [
      h('label', 'Perspective'),
      h('div.openings__color-options', (['white', 'black', 'both'] as const).map(c =>
        h('button.openings__color-btn', {
          class: { active: color === c },
          on: { click: () => { setImportColor(c); redraw(); } },
        }, c.charAt(0).toUpperCase() + c.slice(1)),
      )),
    ]),

    // --- Time control (not shown for PGN) ---
    src !== 'pgn' ? h('div.openings__field', [
      h('label', 'Time control'),
      h('div.openings__filter-row', [
        h('button.openings__filter-pill', {
          class: { active: speeds.size === 0 },
          on: { click: () => { setImportSpeeds(new Set()); redraw(); } },
        }, 'All'),
        ...SPEED_OPTIONS.map(({ value, label, icon }) =>
          h('button.openings__filter-pill', {
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
    ]) : null,

    // --- Period (not shown for PGN) ---
    src !== 'pgn' ? h('div.openings__field', [
      h('label', 'Period'),
      h('div.openings__filter-row', [
        ...DATE_RANGE_OPTIONS.map(({ value, label }) =>
          h('button.openings__filter-pill', {
            class: { active: dateRange === value },
            on: { click: () => { setImportDateRange(value as ImportDateRange); redraw(); } },
          }, label),
        ),
      ]),
      dateRange === 'custom' ? h('div.openings__custom-dates', [
        h('span', 'From'),
        h('input.openings__date-input', {
          attrs: { type: 'date' },
          props: { value: importCustomFrom() },
          on: { change: (e: Event) => { setImportCustomFrom((e.target as HTMLInputElement).value); redraw(); } },
        }),
        h('span', 'To'),
        h('input.openings__date-input', {
          attrs: { type: 'date' },
          props: { value: importCustomTo() },
          on: { change: (e: Event) => { setImportCustomTo((e.target as HTMLInputElement).value); redraw(); } },
        }),
      ]) : null,
    ]) : null,

    // --- Rated only (not shown for PGN) ---
    src !== 'pgn' ? h('div.openings__field', [
      h('label.openings__check-label', [
        h('input', {
          attrs: { type: 'checkbox' },
          props: { checked: importRated() },
          on: { change: (e: Event) => { setImportRated((e.target as HTMLInputElement).checked); redraw(); } },
        }),
        ' Rated only',
      ]),
    ]) : null,

    // --- Max games (not shown for PGN) ---
    src !== 'pgn' ? h('div.openings__field', [
      h('label', 'Max games'),
      h('input.openings__input.openings__input--short', {
        attrs: { type: 'number', min: '1', max: '200' },
        props: { value: importMaxGames() },
        on: { change: (e: Event) => { setImportMaxGames(parseInt((e.target as HTMLInputElement).value, 10) || 50); redraw(); } },
      }),
    ]) : null,

    err ? h('div.openings__error', err) : null,
    h('div.openings__actions', [
      h('button.openings__back-btn', {
        on: { click: () => { setImportStep('source'); redraw(); } },
      }, 'Back'),
      h('button.openings__import-btn', {
        attrs: { disabled: src !== 'pgn' && importUsername().trim() === '' },
        on: { click: () => { void executeResearchImport(redraw); } },
      }, 'Import'),
    ]),
  ]);
}

function renderImportingStep(redraw: () => void): VNode {
  const progress = importProgress();
  return h('div.openings__step', [
    h('h3', 'Importing\u2026'),
    h('div.openings__progress', progress > 0
      ? `Found ${progress} game${progress !== 1 ? 's' : ''} so far\u2026`
      : 'Fetching opponent games\u2026',
    ),
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

function renderSessionPage(redraw: () => void): VNode {
  const collection = activeCollection();
  const node = sessionNode();
  const path = sessionPath();

  return h('div.openings.openings--session', [
    h('div.openings__session-header', [
      h('button.openings__back-lib-btn', {
        on: { click: () => { _openingsCg = undefined; closeSession(); redraw(); } },
      }, '\u2190 Library'),
      h('h2.openings__session-title', collection?.name ?? 'Opening Research'),
      h('span.openings__session-meta', node
        ? `${node.total} game${node.total !== 1 ? 's' : ''} reached this position`
        : ''),
      h('button.openings__flip-btn', {
        attrs: { title: `Flip board (viewing as ${boardOrientation()})` },
        on: { click: () => {
          flipBoard();
          if (_openingsCg) _openingsCg.set({ orientation: boardOrientation() });
          redraw();
        } },
      }, '\u21C5'),
    ]),
    h('div.openings__session-body', [
      h('div.openings__board-wrap', [
        renderOpeningsBoard(node, redraw),
      ]),
      h('div.openings__session-panel', [
        renderMovePath(path, redraw),
        renderMoveNav(path, redraw),
        node ? renderPlayedLinesPanel(node, redraw) : null,
        renderSampleGamesPanel(),
        renderExplorerToggle(node, redraw),
      ]),
    ]),
  ]);
}

function renderOpeningsBoard(node: OpeningTreeNode | null, redraw: () => void): VNode {
  const fen = node?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  return h('div.cg-wrap.openings__board', {
    key: 'openings-board',
    hook: {
      insert: (vnode) => {
        const setup = parseFen(fen);
        const pos = setup.isOk ? Chess.fromSetup(setup.value) : undefined;
        const dests = pos?.isOk ? chessgroundDests(pos.value) : new Map();
        _openingsCg = makeChessground(vnode.elm as HTMLElement, {
          fen,
          orientation: boardOrientation(),
          viewOnly: false,
          movable: {
            free: false,
            color: 'both',
            dests,
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
      },
      postpatch: () => {
        if (_openingsCg) {
          const setup = parseFen(fen);
          const pos = setup.isOk ? Chess.fromSetup(setup.value) : undefined;
          const dests = pos?.isOk ? chessgroundDests(pos.value) : new Map();
          _openingsCg.set({ fen, movable: { dests } });
        }
      },
      destroy: () => {
        if (_openingsCg) {
          _openingsCg.destroy();
          _openingsCg = undefined;
        }
      },
    },
  });
}

function syncOpeningsBoard(redraw: () => void): void {
  const node = sessionNode();
  if (!_openingsCg || !node) return;
  const setup = parseFen(node.fen);
  const pos = setup.isOk ? Chess.fromSetup(setup.value) : undefined;
  const dests = pos?.isOk ? chessgroundDests(pos.value) : new Map();
  _openingsCg.set({
    fen: node.fen,
    movable: { dests },
    lastMove: node.uci ? [node.uci.slice(0, 2), node.uci.slice(2, 4)] : undefined,
  });
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
  const total = node.total || 1;
  const wPct = ((node.white / total) * 100).toFixed(0);
  const dPct = ((node.draws / total) * 100).toFixed(0);
  const bPct = ((node.black / total) * 100).toFixed(0);

  return h('div.openings__lines-panel', [
    // Position summary header
    h('div.openings__pos-summary', [
      h('span.openings__pos-total', `${node.total} game${node.total !== 1 ? 's' : ''}`),
      h('span.openings__pos-results', [
        h('span.openings__pos-w', `W ${wPct}%`),
        h('span.openings__pos-d', `D ${dPct}%`),
        h('span.openings__pos-b', `B ${bPct}%`),
      ]),
      renderResultBar(node),
    ]),
    // Played lines
    node.children.length === 0
      ? h('div.openings__moves-empty', 'No further moves in this collection.')
      : h('div.openings__moves', [
          h('div.openings__moves-header', [
            h('span.openings__mh-move', 'Move'),
            h('span.openings__mh-games', 'Games'),
            h('span.openings__mh-result', 'Result'),
          ]),
          ...node.children.map(child => renderMoveRow(child, node.total, redraw)),
        ]),
  ]);
}

function renderMoveRow(child: OpeningTreeNode, parentTotal: number, redraw: () => void): VNode {
  const pct = parentTotal > 0 ? ((child.total / parentTotal) * 100).toFixed(1) : '0';
  const total = child.total || 1;
  const wPct = ((child.white / total) * 100).toFixed(0);
  const dPct = ((child.draws / total) * 100).toFixed(0);
  const bPct = ((child.black / total) * 100).toFixed(0);

  return h('div.openings__move-row', {
    key: child.uci,
    on: { click: () => { navigateToMove(child.uci); syncOpeningsBoard(redraw); redraw(); } },
  }, [
    h('span.openings__move-san', child.san),
    h('span.openings__move-count', `${child.total} (${pct}%)`),
    h('span.openings__move-results', [
      h('span.openings__mr-w', `${wPct}%`),
      h('span.openings__mr-d', `${dPct}%`),
      h('span.openings__mr-b', `${bPct}%`),
    ]),
    renderResultBar(child),
  ]);
}

function renderResultBar(node: OpeningTreeNode): VNode {
  const total = node.total || 1;
  const wPct = (node.white / total) * 100;
  const dPct = (node.draws / total) * 100;
  const bPct = (node.black / total) * 100;
  return h('div.openings__result-bar', [
    h('div.openings__result-w', { style: { width: `${wPct}%` } }),
    h('div.openings__result-d', { style: { width: `${dPct}%` } }),
    h('div.openings__result-b', { style: { width: `${bPct}%` } }),
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

  return h('div.openings__sample-row', { key: game.id }, [
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

function renderExplorerToggle(node: OpeningTreeNode | null, redraw: () => void): VNode {
  const enabled = explorerEnabled();
  return h('div.openings__explorer', [
    h('div.openings__explorer-toggle', [
      h('label.openings__explorer-label', [
        h('input', {
          attrs: { type: 'checkbox', checked: enabled },
          on: {
            change: () => {
              toggleExplorer();
              if (explorerEnabled() && node) {
                void fetchExplorer(node.fen, redraw);
              }
              redraw();
            },
          },
        }),
        ' Lichess Opening Book',
      ]),
    ]),
    enabled ? renderExplorerPanel(node, redraw) : null,
  ]);
}

function renderExplorerPanel(node: OpeningTreeNode | null, redraw: () => void): VNode {
  if (!node) return h('div.openings__explorer-empty', 'No position selected.');

  // Trigger fetch if needed
  const data = explorerData();
  if (!data || data.fen !== node.fen) {
    if (!explorerLoading()) {
      void fetchExplorer(node.fen, redraw);
    }
  }

  const loading = explorerLoading();
  const err = explorerError();

  if (loading) return h('div.openings__explorer-loading', 'Loading book data\u2026');
  if (err) return h('div.openings__explorer-error', err);
  if (!data || data.moves.length === 0) {
    return h('div.openings__explorer-empty', 'No book data for this position.');
  }

  const total = data.white + data.draws + data.black;
  return h('div.openings__explorer-data', [
    data.opening
      ? h('div.openings__explorer-opening', `${data.opening.eco} ${data.opening.name}`)
      : null,
    h('div.openings__explorer-summary', `${total.toLocaleString()} games in database`),
    h('div.openings__explorer-moves', data.moves.slice(0, 8).map(m =>
      renderExplorerMoveRow(m),
    )),
  ]);
}

function renderExplorerMoveRow(move: ExplorerMove): VNode {
  const total = move.white + move.draws + move.black || 1;
  const wPct = ((move.white / total) * 100).toFixed(0);
  const dPct = ((move.draws / total) * 100).toFixed(0);
  const bPct = ((move.black / total) * 100).toFixed(0);

  return h('div.openings__explorer-row', { key: move.uci }, [
    h('span.openings__explorer-san', move.san),
    h('span.openings__explorer-count', `${(move.white + move.draws + move.black).toLocaleString()}`),
    h('span.openings__explorer-results', [
      h('span.openings__mr-w', `${wPct}%`),
      h('span.openings__mr-d', `${dPct}%`),
      h('span.openings__mr-b', `${bPct}%`),
    ]),
  ]);
}
