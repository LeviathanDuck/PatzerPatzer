// ---------------------------------------------------------------------------
// Puzzle V1 — Library view + round view with feedback and result states
// Adapted from lichess-org/lila: ui/puzzle/src/view/feedback.ts, after.ts
//
// Renders the top-level puzzle library surface and the puzzle round view
// with real-time feedback during play and result-state UI on solve/fail.
// ---------------------------------------------------------------------------

import { h, type VNode } from 'snabbdom';
import { renderCeval, renderPvBox, renderEngineSettings, setCevalFenOverride } from '../ceval/view';
import { protocol as sharedProtocol, engineEnabled, engineReady as sharedEngineReady, multiPv, analysisDepth,
  showEngineArrows, setShowEngineArrows, showArrowLabels, setShowArrowLabels, syncArrow,
} from '../engine/ctrl';
import { explorerCtrl } from '../openings/explorerCtrl';
import { renderToggleRow } from '../ui';
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
  retryFailedPuzzles,
  getAutoNext, setAutoNext,
  getResumePuzzleId, getPuzzleCg,
  getPreviewPuzzleId, getPreviewRoundCtrl, selectPuzzleForPreview, clearPreview, mountPreviewBoard,
  type LibraryCounts, type PuzzleListFilters, type PuzzleListState,
  type ActiveSession,
} from './ctrl';
import type { PuzzleRoundCtrl } from './ctrl';
import type { PuzzleDefinition, PuzzleSourceKind, SolveResult, PuzzleMoveQuality, PuzzleUserMeta, PuzzleDifficulty } from './types';
import { PUZZLE_DIFFICULTY_OFFSETS } from './types';
import { parseFen, makeFen } from 'chessops/fen';
import { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';
import { makeSan } from 'chessops/san';
import { renderMoveList, renderContextMoves } from '../analyse/moveList';
import { renderMoveNavBar } from '../analyse/analysisControls';
import { syncPuzzleBoard, peekPuzzleContext, getCurrentSessionMode, setSessionMode, getCurrentDifficulty, setDifficulty, getCurrentUserPerf, startRatedSession, stopRatedStream, isRatedStreamActive, getRatedStreamCount, isEmptyRatedStream } from './ctrl';
import { mainlineNodeList, promoteAt, pathInit } from '../tree/ops';
import { isMainlinePath } from '../analyse/pgnExport';
import type { Role } from '@lichess-org/chessground/types';
import { savePuzzleToLibrary } from '../study/saveAction';

// ---------------------------------------------------------------------------
// Puzzle player strips
// Adapted from lichess-org/lila: ui/analyse/src/view/components.ts renderPlayerStrips
// Material diff helpers adapted from ui/lib/src/game/material.ts
// ---------------------------------------------------------------------------

type MaterialDiffSide = Record<Role, number>;
interface MaterialDiff { white: MaterialDiffSide; black: MaterialDiffSide; }
const ROLE_ORDER: Role[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];
const ROLE_POINTS: Record<Role, number> = { queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1, king: 0 };

function puzzleMaterialDiff(fen: string): MaterialDiff {
  const diff: MaterialDiff = {
    white: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
    black: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
  };
  const fenBoard = fen.split(' ')[0] ?? '';
  const charToRole: Record<string, Role> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  for (const ch of fenBoard) {
    const lower = ch.toLowerCase();
    const role = charToRole[lower];
    if (!role) continue;
    const color: 'white' | 'black' = ch === lower ? 'black' : 'white';
    const opp = color === 'white' ? 'black' : 'white';
    if (diff[opp][role] > 0) diff[opp][role]--;
    else diff[color][role]++;
  }
  return diff;
}

function puzzleMaterialScore(diff: MaterialDiff): number {
  return ROLE_ORDER.reduce((sum, role) => sum + (diff.white[role] - diff.black[role]) * ROLE_POINTS[role], 0);
}

function renderPuzzleMaterialPieces(diff: MaterialDiff, color: 'white' | 'black', score: number): VNode {
  const groups: VNode[] = [];
  for (const role of ROLE_ORDER) {
    const count = diff[color][role];
    if (count <= 0) continue;
    const pieces: VNode[] = [];
    for (let i = 0; i < count; i++) pieces.push(h('mpiece.' + role));
    groups.push(h('div', pieces));
  }
  return h('div.material', [
    ...groups,
    score > 0 ? h('score', '+' + score) : null,
  ]);
}

function formatPuzzleClock(centis: number): string {
  const totalSecs = Math.floor(centis / 100);
  const hh = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad = (n: number) => n < 10 ? '0' + n : String(n);
  return hh > 0 ? `${hh}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Render the two player identity strips for the puzzle board.
 * Returns [topStrip, bottomStrip]. The solver (Hero) is always at the bottom
 * since the puzzle board is oriented to their pov.
 * Adapted from lichess-org/lila: ui/puzzle/src/view/main.ts
 */
function renderPuzzlePlayerStrips(rc: PuzzleRoundCtrl): [VNode, VNode] {
  const pov = rc.pov; // Hero (solver) color
  const opp: 'white' | 'black' = pov === 'white' ? 'black' : 'white';

  const headers = rc.pgnHeaders;
  const result = headers?.result ?? '*';
  const clocks = rc.puzzleClocks;
  const diff = puzzleMaterialDiff(rc.treeNode.fen);
  const score = puzzleMaterialScore(diff);

  const nameFor = (color: 'white' | 'black'): string => {
    const pgn = color === 'white' ? headers?.white : headers?.black;
    if (pgn && pgn.trim() && pgn !== '?') return pgn;
    return color === pov ? 'Hero' : 'Opponent';
  };

  const strip = (color: 'white' | 'black'): VNode => {
    const name = nameFor(color);
    const winner = (color === 'white' && result === '1-0') || (color === 'black' && result === '0-1');
    const loser  = (color === 'white' && result === '0-1') || (color === 'black' && result === '1-0');
    const matScore = color === 'white' ? score : -score;
    const centis = color === 'white' ? clocks.white : clocks.black;
    return h('div.analyse__player_strip', [
      h('div.player-strip__identity', {
        class: {
          'player-strip__identity--winner': winner,
          'player-strip__identity--loser': loser,
          'player-strip__identity--draw': result !== '*' && !winner && !loser,
        },
      }, [
        h('span.player-strip__color-icon', {
          class: {
            'player-strip__color-icon--white': color === 'white',
            'player-strip__color-icon--black': color === 'black',
          },
        }),
        h('span.player-strip__name', name),
      ]),
      renderPuzzleMaterialPieces(diff, color, matScore > 0 ? matScore : 0),
      centis !== undefined ? h('div.analyse__clock', formatPuzzleClock(centis)) : null,
    ]);
  };

  // Solver is at the bottom; opponent is at the top.
  return [strip(opp), strip(pov)];
}

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

  // Check for a persisted session to resume
  const session = getActiveSession();
  const resumeId = getResumePuzzleId();

  return h('aside.puzzle__side.puzzle-library__sidebar', [
    h('h2.puzzle-library__title', 'Puzzle Library'),

    // Resume session card
    session && resumeId
      ? h('div.puzzle-library__resume', [
          h('div.puzzle-library__resume-header', [
            h('span', 'Session in progress'),
            h('span.puzzle-library__resume-count',
              `${session.history.length} puzzle${session.history.length === 1 ? '' : 's'}`),
          ]),
          h('div.puzzle-library__resume-actions', [
            h('button.puzzle-library__resume-btn', {
              on: { click: () => {
                window.location.hash = `#/puzzles/${encodeURIComponent(resumeId)}`;
              }},
            }, 'Resume Session'),
            h('button.puzzle-library__resume-end', {
              on: { click: () => { clearActiveSession(); redraw(); }},
            }, 'Discard'),
          ]),
        ])
      : null,

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
  const previewRc = getPreviewRoundCtrl();
  const isPreview = !!previewRc;

  // Board-centered layout: sidebar on left, board always visible
  // When a preview is active: preview panel replaces sidebar on right side of board.
  return h('div.puzzle-page', [
    h('div.puzzle.puzzle--library', {
      class: { 'puzzle--library-preview': isPreview },
    }, [
      // Left panel — shows browse pane when active, otherwise source cards
      listState
        ? renderInlineBrowsePane(listState, redraw)
        : renderLibrarySidebar(redraw),
      // Board area — idle board when no preview; preview board when puzzle selected
      h('div.puzzle__board.main-board', [
        isPreview
          ? h('div.cg-wrap', {
              key: `puzzle-preview-board-${getPreviewPuzzleId()}`,
              hook: {
                insert: vnode => { mountPreviewBoard(vnode.elm as HTMLElement, redraw); },
                destroy: () => { destroyPuzzleBoard(); },
              },
            })
          : h('div.cg-wrap', {
              key: 'puzzle-idle-board',
              hook: {
                insert: vnode => { mountIdleBoard(vnode.elm as HTMLElement); },
                destroy: () => { destroyPuzzleBoard(); },
              },
            }),
      ]),
      // Right panel — preview details when active, otherwise absent
      isPreview ? renderLibraryPreviewPanel(redraw) : null,
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
    class: { 'puzzle-list__row--selected': getPreviewPuzzleId() === def.id },
    on: {
      click: () => {
        void selectPuzzleForPreview(def.id, redraw);
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
let _puzzleContextMenuPath: string | null = null;

function openPuzzleContextMenu(path: string, e: MouseEvent): void {
  e.preventDefault();
  _puzzleContextMenuPath = path;
}

function closePuzzleContextMenu(): void {
  _puzzleContextMenuPath = null;
}

function renderPuzzleContextMenu(rc: PuzzleRoundCtrl, redraw: () => void): VNode | null {
  if (!_puzzleContextMenuPath) return null;
  const path = _puzzleContextMenuPath;
  const node = rc.treeRoot.children.length > 0 ? (() => {
    // Walk the tree to find the node at path
    let n: import('../tree/types').TreeNode = rc.treeRoot;
    for (let i = 0; i < path.length; i += 2) {
      const id = path.slice(i, i + 2);
      const child = n.children.find(c => c.id === id);
      if (!child) return undefined;
      n = child;
    }
    return n;
  })() : undefined;
  const title = node?.san ?? path;
  const onMainline = isMainlinePath(rc.treeRoot, path);
  return h('div#move-ctx-menu.visible', {
    on: { contextmenu: (e: Event) => e.preventDefault() },
  }, [
    h('p.title', title),
    h('a', { on: { click: () => {
      const p = _puzzleContextMenuPath!;
      closePuzzleContextMenu();
      puzzleDeleteVariation(rc, p, redraw);
    }}}, 'Delete from here'),
    !onMainline ? h('a', { on: { click: () => {
      promoteAt(rc.treeRoot, path, false);
      rc.treeMainline = mainlineNodeList(rc.treeRoot);
      closePuzzleContextMenu();
      syncPuzzleBoard();
      redraw();
    }}}, 'Promote variation') : null,
    !onMainline ? h('a', { on: { click: () => {
      promoteAt(rc.treeRoot, path, true);
      rc.treeMainline = mainlineNodeList(rc.treeRoot);
      if (rc.treePath.startsWith(path)) rc.setTreePath(path);
      closePuzzleContextMenu();
      syncPuzzleBoard();
      redraw();
    }}}, 'Make main line') : null,
  ]);
}

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
let _puzzleSaveLibFeedback: string | null = null;
let _puzzleSaveLibTimer: ReturnType<typeof setTimeout> | null = null;

function handlePuzzleSaveToLibrary(rc: PuzzleRoundCtrl, redraw: () => void): void {
  const fen = rc.definition.startFen;
  const moves = rc.definition.solutionLine;
  void savePuzzleToLibrary(fen, moves).then(() => {
    _puzzleSaveLibFeedback = 'Saved to Library!';
    if (_puzzleSaveLibTimer) clearTimeout(_puzzleSaveLibTimer);
    _puzzleSaveLibTimer = setTimeout(() => { _puzzleSaveLibFeedback = null; redraw(); }, 1800);
    redraw();
  }).catch(() => {
    _puzzleSaveLibFeedback = 'Save failed';
    if (_puzzleSaveLibTimer) clearTimeout(_puzzleSaveLibTimer);
    _puzzleSaveLibTimer = setTimeout(() => { _puzzleSaveLibFeedback = null; redraw(); }, 1800);
    redraw();
  });
}

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

// ---------------------------------------------------------------------------
// Rated ladder UI — mode badge, difficulty selector, rating display
// Adapted from lichess-org/lila: ui/puzzle/src/view/main.ts (session controls)
// ---------------------------------------------------------------------------

/** Difficulty level display labels. */
const DIFFICULTY_LABELS: Record<PuzzleDifficulty, string> = {
  easiest: 'Easiest',
  easier:  'Easier',
  normal:  'Normal',
  harder:  'Harder',
  hardest: 'Hardest',
};

/**
 * Rated stream left-panel entry card.
 * Shows the user's current rating, difficulty selector, and Start/Stop controls.
 * Mirrors the Lichess puzzle dashboard entry point (PuzzleSession concept).
 * Adapted from lichess-org/lila: ui/puzzle/src/view/main.ts
 */
export function renderRatedStreamEntry(redraw: () => void): VNode {
  const perf = getCurrentUserPerf();
  const intRating = Math.round(perf.glicko.rating);
  const intDeviation = Math.round(perf.glicko.deviation);
  const streamActive = isRatedStreamActive();
  const streamCount = getRatedStreamCount();
  const empty = isEmptyRatedStream();
  const difficulty = getCurrentDifficulty();

  const difficultyOptions: Array<[string, string]> = [
    ['easiest', 'Easiest'],
    ['easier', 'Easier'],
    ['normal', 'Normal'],
    ['harder', 'Harder'],
    ['hardest', 'Hardest'],
  ];

  return h('div.puzzle__rated-stream-entry', [
    // Rating display
    h('div.puzzle__rated-stream-entry__rating', [
      h('span.puzzle__rated-stream-entry__rating-label', 'Your Rating'),
      h('span.puzzle__rated-stream-entry__rating-value', String(intRating)),
      h('span.puzzle__rated-stream-entry__rating-dev', `\u00b1${intDeviation}`),
    ]),

    // Difficulty selector
    h('div.puzzle__rated-stream-entry__difficulty', [
      h('label.puzzle__rated-stream-entry__difficulty-label', { attrs: { for: 'rated-stream-difficulty' } }, 'Difficulty'),
      h('select.puzzle__rated-stream-entry__difficulty-select', {
        attrs: { id: 'rated-stream-difficulty', value: difficulty },
        props: { value: difficulty },
        on: {
          change: (e: Event) => {
            setDifficulty((e.target as HTMLSelectElement).value as typeof difficulty);
            redraw();
          },
        },
      }, difficultyOptions.map(([val, label]) =>
        h('option', { attrs: { value: val, selected: val === difficulty } }, label),
      )),
    ]),

    // Stream counter (visible when active)
    streamActive
      ? h('div.puzzle__rated-stream-entry__count', `Puzzle ${streamCount}`)
      : null,

    // Empty state
    empty
      ? h('div.puzzle__rated-stream-entry__empty',
          'No rated puzzles available \u2014 import Lichess puzzles to begin.')
      : null,

    // Start / Stop button
    streamActive
      ? h('button.puzzle__rated-stream-entry__stop', {
          on: { click: () => { stopRatedStream(); redraw(); } },
        }, 'Stop')
      : h('button.puzzle__rated-stream-entry__start', {
          on: { click: () => { void startRatedSession(redraw); } },
        }, 'Start Rated'),
  ]);
}

/**
 * Rated session badge + difficulty selector.
 * Only shown for imported-lichess puzzles. User-library puzzles show a
 * "Practice only" label so the distinction is clear.
 * Adapted from Lichess puzzle mode controls.
 */
function renderRatedBadge(rc: PuzzleRoundCtrl, redraw: () => void): VNode {
  const isImported = rc.definition.sourceKind === 'imported-lichess';
  const sessionMode = getCurrentSessionMode();
  const perf = getCurrentUserPerf();
  const intRating = Math.round(perf.glicko.rating);

  if (!isImported) {
    return h('div.puzzle__rated-badge.puzzle__rated-badge--practice-only', [
      h('span.puzzle__rated-badge__label', 'Practice only'),
    ]);
  }

  const difficulties: PuzzleDifficulty[] = ['easiest', 'easier', 'normal', 'harder', 'hardest'];
  const currentDiff = getCurrentDifficulty();

  return h('div.puzzle__rated-badge', [
    h('div.puzzle__rated-badge__mode', [
      h('button.puzzle__rated-badge__btn', {
        class: { active: sessionMode === 'practice' },
        on: { click: () => { setSessionMode('practice'); redraw(); } },
      }, 'Practice'),
      h('button.puzzle__rated-badge__btn', {
        class: { active: sessionMode === 'rated' },
        on: { click: () => { setSessionMode('rated'); redraw(); } },
      }, 'Rated'),
    ]),
    sessionMode === 'rated'
      ? h('div.puzzle__rated-badge__controls', [
          h('span.puzzle__rated-badge__rating', `${intRating}`),
          h('select.puzzle__rated-badge__difficulty', {
            props: { value: currentDiff },
            on: {
              change: (e: Event) => {
                const sel = e.target as HTMLSelectElement;
                setDifficulty(sel.value as PuzzleDifficulty);
                redraw();
              },
            },
          }, difficulties.map(d =>
            h('option', { props: { value: d, selected: d === currentDiff } },
              `${DIFFICULTY_LABELS[d]} (${PUZZLE_DIFFICULTY_OFFSETS[d] >= 0 ? '+' : ''}${PUZZLE_DIFFICULTY_OFFSETS[d]})`),
          )),
        ])
      : null,
  ]);
}

/**
 * Rated assistance warning modal.
 * Shown when the user triggers a restricted tool during a rated round.
 * Three choices: cancel (stay rated, don't use tool), switch-to-casual, stay-rated (immediate fail).
 */
function renderAssistanceWarning(rc: PuzzleRoundCtrl, redraw: () => void): VNode | null {
  if (!rc.showAssistanceWarning) return null;
  return h('div.puzzle__assistance-warning', [
    h('div.puzzle__assistance-warning__modal', [
      h('h3.puzzle__assistance-warning__title', 'Using assistance in rated mode'),
      h('p.puzzle__assistance-warning__body',
        'Using hints or solutions affects your rated score. How would you like to proceed?'),
      h('label.puzzle__assistance-warning__remember', [
        h('input', {
          attrs: { type: 'checkbox', checked: rc.rememberAssistanceChoice },
          on: { change: (e: Event) => {
            rc.rememberAssistanceChoice = (e.target as HTMLInputElement).checked;
          }},
        }),
        'Remember choice for this session',
      ]),
      h('div.puzzle__assistance-warning__buttons', [
        h('button.button.button-red', {
          on: { click: () => { rc.dismissAssistanceWarning(); redraw(); } },
        }, 'Cancel'),
        h('button.button', {
          on: { click: () => { rc.chooseAssistanceSwitchToCasual(); redraw(); } },
        }, 'Switch to practice'),
        h('button.button.button-red', {
          on: { click: () => { rc.chooseStayRatedAndProceed(); redraw(); } },
        }, 'Stay rated (lose points)'),
      ]),
    ]),
  ]);
}

/**
 * Messaging shown when a previously correctly solved puzzle appears in a rated session.
 * Makes explicit that this round cannot score rated again.
 */
function renderSolvedRepeatNotice(rc: PuzzleRoundCtrl): VNode | null {
  // Only show for rated imported-lichess puzzles with already-solved outcome.
  if (rc.currentSessionMode !== 'rated') return null;
  if (rc.definition.sourceKind !== 'imported-lichess') return null;
  if (rc.ratedOutcomeResolved !== 'already-solved') return null;
  return h('div.puzzle__solved-repeat-notice', [
    h('span.puzzle__solved-repeat-notice__icon', '\u2139'),
    'You\'ve solved this puzzle before — this round is for practice only.',
  ]);
}

/**
 * Current user rating and last-round delta display.
 * Shown after a rated round completes so results are immediately visible.
 */
function renderRatingDisplay(rc: PuzzleRoundCtrl): VNode | null {
  if (rc.currentSessionMode !== 'rated') return null;
  if (rc.definition.sourceKind !== 'imported-lichess') return null;
  const perf = getCurrentUserPerf();
  const intRating = Math.round(perf.glicko.rating);
  const delta = rc.lastRatingDelta;

  return h('div.puzzle__rating-display', [
    h('span.puzzle__rating-display__label', 'Rating'),
    h('span.puzzle__rating-display__value', `${intRating}`),
    delta !== undefined && delta !== 0
      ? h('span.puzzle__rating-display__delta', {
          class: { positive: delta > 0, negative: delta < 0 },
        }, delta > 0 ? `+${delta}` : `${delta}`)
      : null,
  ]);
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
    renderAnalysisToggle(rc, redraw),
  ]);
}

/** Analysis mode toggle — eyeglasses icon to switch to full game tree. */
function renderAnalysisToggle(rc: PuzzleRoundCtrl, redraw: () => void): VNode | null {
  // Only show if game PGN is available (or loading)
  if (!rc.gamePgn && !rc.gameTree) return null;
  return h('button.puzzle__analyse', {
    class: { active: rc.analysisMode },
    attrs: { title: rc.analysisMode ? 'Back to puzzle' : 'Analyse full game' },
    on: { click: () => { rc.toggleAnalysisMode(redraw); } },
  }, [
    h('svg.puzzle__analyse-icon', {
      attrs: { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 64 64', width: '18', height: '18', fill: 'none' },
    }, [
      h('circle', { attrs: { cx: '28', cy: '28', r: '14', stroke: 'currentColor', 'stroke-width': '4' } }),
      h('line',   { attrs: { x1: '38', y1: '38', x2: '54', y2: '54', stroke: 'currentColor', 'stroke-width': '4', 'stroke-linecap': 'round' } }),
      h('circle', { attrs: { cx: '28', cy: '28', r: '6',  stroke: 'currentColor', 'stroke-width': '2' } }),
      h('line',   { attrs: { x1: '28', y1: '28', x2: '28', y2: '24', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' } }),
      h('line',   { attrs: { x1: '28', y1: '28', x2: '32', y2: '28', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' } }),
    ]),
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
      renderAnalysisToggle(rc, redraw),
      _puzzleSaveLibFeedback
        ? h('span.puzzle__save-lib-feedback', _puzzleSaveLibFeedback)
        : h('button.button.button-empty.puzzle__save-lib', {
            attrs: { title: 'Save this puzzle to the Study Library' },
            on: { click: () => { handlePuzzleSaveToLibrary(rc, redraw); } },
          }, '\uD83D\uDCDA Save to Library'),
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
      renderAnalysisToggle(rc, redraw),
      _puzzleSaveLibFeedback
        ? h('span.puzzle__save-lib-feedback', _puzzleSaveLibFeedback)
        : h('button.button.button-empty.puzzle__save-lib', {
            attrs: { title: 'Save this puzzle to the Study Library' },
            on: { click: () => { handlePuzzleSaveToLibrary(rc, redraw); } },
          }, '\uD83D\uDCDA Save to Library'),
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

// --- Puzzle round action-menu state ---
// Mirrors the analysis action-menu pattern in src/analyse/analysisControls.ts
let _puzzleMenuOpen = false;

// Icon codepoints reused from analysisControls.ts conventions.
// Adapted from lichess-org/lila: ui/lib/src/licon.ts
const PUZZLE_ICON_HAMBURGER = '\ue039'; // licon.Hamburger
const PUZZLE_ICON_FLIP      = '\ue020'; // licon.ChasingArrows — flip board

/**
 * Puzzle-round action menu overlay.
 * Renders inside .puzzle__side with position: absolute; inset: 0.
 * Returns null when the menu is closed so the side panel renders normally.
 * Adapted from lichess-org/lila: ui/analyse/src/view/actionMenu.ts structure
 */
function renderPuzzleRoundActionMenu(rc: PuzzleRoundCtrl, redraw: () => void): VNode | null {
  if (!_puzzleMenuOpen) return null;
  const close = () => { _puzzleMenuOpen = false; redraw(); };

  return h('div.action-menu', [
    h('button.action-menu__close-btn', {
      attrs: { title: 'Close menu' },
      on:    { click: close },
    }, '×'),

    h('h2', 'Tools'),
    h('div.action-menu__tools', [
      // Flip board
      h('button', {
        attrs: { 'data-icon': PUZZLE_ICON_FLIP, title: 'Flip board' },
        on: { click: () => {
          const cg = getPuzzleCg();
          if (cg) {
            const cur = cg.state.orientation;
            cg.set({ orientation: cur === 'white' ? 'black' : 'white' });
          }
          close();
        } },
      }, 'Flip board'),
    ]),

    // Auto-next is a per-session setting that triggers after each solve.
    // Adapted from lichess-org/lila: ui/puzzle/src/autoScroll.ts auto-advance
    h('h2', 'Behaviour'),
    h('div.action-menu__display', [
      renderToggleRow('pz-auto-next', 'Auto next', getAutoNext(), (v) => { setAutoNext(v); redraw(); }),
    ]),

    h('h2', 'Display'),
    h('div.action-menu__display', [
      renderToggleRow('pz-engine-arrows', 'Engine arrows', showEngineArrows, (v) => { setShowEngineArrows(v); syncArrow(); redraw(); }),
      renderToggleRow('pz-arrow-labels',  'Arrow labels',  showArrowLabels,  (v) => { setShowArrowLabels(v);  syncArrow(); redraw(); }),
    ]),
  ]);
}

/**
 * Render the shared three-zone move-nav bar for the puzzle round.
 * Wires first/prev/next/last into puzzleNavigate, book to explorerCtrl, hamburger to local menu.
 * Adapted from lichess-org/lila: ui/puzzle/src/view/main.ts navigation pattern.
 */
function renderPuzzleRoundNavBar(rc: PuzzleRoundCtrl, redraw: () => void): VNode {
  const canPrev = rc.treePath !== '';
  const canNext = rc.treeNode.children.length > 0;
  const lastPath = rc.treeMainline.slice(1).map(n => n.id).join('');

  return renderMoveNavBar([], {
    canPrev,
    canNext,
    first: () => puzzleNavigate(rc, '',                                 redraw),
    prev:  () => puzzleNavigate(rc, pathInit(rc.treePath),              redraw),
    next:  () => {
      if (rc.treeNode.children[0]) puzzleNavigate(rc, rc.treePath + rc.treeNode.children[0].id, redraw);
    },
    last:  () => puzzleNavigate(rc, lastPath,                           redraw),
    bookActive: explorerCtrl.enabled,
    onBook: () => {
      explorerCtrl.toggle();
      if (explorerCtrl.enabled) explorerCtrl.setNode(rc.treeNode.fen, redraw);
      redraw();
    },
    rightSlot: h('button.fbt', {
      class: { active: _puzzleMenuOpen },
      attrs: { 'data-icon': PUZZLE_ICON_HAMBURGER, title: 'Puzzle menu' },
      on:    { click: () => { _puzzleMenuOpen = !_puzzleMenuOpen; redraw(); } },
    }),
  });
}

function puzzleNavigate(rc: PuzzleRoundCtrl, path: string, redraw: () => void): void {
  if (path === rc.treePath) return;
  rc.setTreePath(path);
  syncPuzzleBoard();
  redraw();
}

function previewNavigate(rc: PuzzleRoundCtrl, path: string, redraw: () => void): void {
  if (path === rc.treePath) return;
  rc.setTreePath(path);
  syncPuzzleBoard(rc);
  redraw();
}

// --- Library preview action-menu state (CCP-256) ---
let _libraryMenuOpen = false;

const LIBRARY_ICON_HAMBURGER = '\ue039'; // licon.Hamburger
const LIBRARY_ICON_FLIP      = '\ue020'; // licon.ChasingArrows — flip board

/**
 * Library preview action menu overlay.
 * Renders inside .puzzle-library__preview-side with position: absolute; inset: 0.
 * Returns null when the menu is closed so the panel renders normally.
 * Adapted from lichess-org/lila: ui/analyse/src/view/actionMenu.ts structure
 */
function renderLibraryPreviewActionMenu(redraw: () => void): VNode | null {
  if (!_libraryMenuOpen) return null;
  const close = () => { _libraryMenuOpen = false; redraw(); };

  return h('div.action-menu', [
    h('button.action-menu__close-btn', {
      attrs: { title: 'Close menu' },
      on:    { click: close },
    }, '×'),

    h('h2', 'Tools'),
    h('div.action-menu__tools', [
      h('button', {
        attrs: { 'data-icon': LIBRARY_ICON_FLIP, title: 'Flip board' },
        on: { click: () => {
          const cg = getPuzzleCg();
          if (cg) {
            const cur = cg.state.orientation;
            cg.set({ orientation: cur === 'white' ? 'black' : 'white' });
          }
          close();
        } },
      }, 'Flip board'),
    ]),

    h('h2', 'Display'),
    h('div.action-menu__display', [
      renderToggleRow('lib-engine-arrows', 'Engine arrows', showEngineArrows, (v) => { setShowEngineArrows(v); syncArrow(); redraw(); }),
      renderToggleRow('lib-arrow-labels',  'Arrow labels',  showArrowLabels,  (v) => { setShowArrowLabels(v);  syncArrow(); redraw(); }),
    ]),
  ]);
}

/**
 * Render the preview panel that replaces the puzzle side when a library puzzle is selected.
 * Shows move list, nav bar (with book + hamburger), and a "Play this puzzle" button.
 * Adapted from lichess-org/lila: ui/puzzle/src/view/main.ts aside panel shape.
 * CCP-255: initial panel + nav bar. CCP-256: adds book + hamburger.
 */
function renderLibraryPreviewPanel(redraw: () => void): VNode | null {
  const rc = getPreviewRoundCtrl();
  if (!rc) return null;
  const nav = (path: string) => previewNavigate(rc, path, redraw);
  const canPrev = rc.treePath !== '';
  const canNext = rc.treeNode.children.length > 0;
  const lastPath = rc.treeMainline.slice(1).map(n => n.id).join('');

  return h('aside.puzzle__side.puzzle-library__preview-side', [
    renderLibraryPreviewActionMenu(redraw),
    h('div.puzzle-library__preview-header', [
      h('h2', `Puzzle ${rc.definition.id}`),
      h('button.button.button-green.puzzle-library__preview-play', {
        on: { click: () => void selectPuzzleFromList(rc.definition.id, redraw) },
      }, 'Play this puzzle'),
      h('button.puzzle-library__preview-close', {
        attrs: { title: 'Close preview' },
        on: { click: () => { clearPreview(); redraw(); } },
      }, '×'),
    ]),
    h('div.analyse__moves.areplay', [
      renderMoveList(rc.treeRoot, rc.treePath, () => undefined, nav, rc.pov, false),
    ]),
    renderMoveNavBar([], {
      canPrev,
      canNext,
      first: () => previewNavigate(rc, '',                                     redraw),
      prev:  () => previewNavigate(rc, pathInit(rc.treePath),                  redraw),
      next:  () => {
        if (rc.treeNode.children[0]) previewNavigate(rc, rc.treePath + rc.treeNode.children[0].id, redraw);
      },
      last:  () => previewNavigate(rc, lastPath,                               redraw),
      bookActive: explorerCtrl.enabled,
      onBook: () => {
        explorerCtrl.toggle();
        if (explorerCtrl.enabled) explorerCtrl.setNode(rc.treeNode.fen, redraw);
        redraw();
      },
      rightSlot: h('button.fbt', {
        class: { active: _libraryMenuOpen },
        attrs: { 'data-icon': LIBRARY_ICON_HAMBURGER, title: 'Preview menu' },
        on:    { click: () => { _libraryMenuOpen = !_libraryMenuOpen; redraw(); } },
      }),
    }),
  ]);
}

function puzzleDeleteVariation(rc: PuzzleRoundCtrl, path: string, redraw: () => void): void {
  rc.deleteVariation(path);
  syncPuzzleBoard();
  redraw();
}

function renderPuzzleMoveList(_def: PuzzleDefinition, rc: PuzzleRoundCtrl | null, redraw?: () => void): VNode {
  if (!rc || !redraw) {
    return h('div.analyse__moves.areplay', []);
  }
  const nav     = (path: string) => puzzleNavigate(rc, path, redraw);
  const delVar  = (path: string) => puzzleDeleteVariation(rc, path, redraw);
  const ctxMenu = (path: string, e: MouseEvent) => { openPuzzleContextMenu(path, e); redraw(); };

  const children: (VNode | null)[] = [];

  // Pre-solve: show game context moves (from full PGN) above the puzzle tree.
  // Only when not in analysis/browse mode (which uses the full game tree via rc.treeRoot).
  if (rc.mode === 'play' && !rc.analysisMode && rc.gameTree && rc.gameTreePuzzlePath !== null) {
    const gameMainline = mainlineNodeList(rc.gameTree);
    const pathDepth = rc.gameTreePuzzlePath.length / 2;
    const contextNodes = gameMainline.slice(1, pathDepth + 1);
    if (contextNodes.length > 0) {
      let nodePath = '';
      const pathNodes = contextNodes.map(node => {
        nodePath += node.id;
        return { node, path: nodePath };
      });
      children.push(h('div.move-list-inner.puzzle-game-context', [
        renderContextMoves(
          pathNodes,
          (p) => peekPuzzleContext(p, redraw),
          rc.contextPeekPath ?? '',
        ),
      ]));
      children.push(h('div.puzzle-game-context__sep'));
    }
  }

  children.push(renderMoveList(
    rc.treeRoot,
    rc.treePath,
    () => undefined,
    nav,
    rc.pov,
    false,
    delVar,
    _puzzleContextMenuPath,
    ctxMenu,
  ));
  children.push(renderPuzzleContextMenu(rc, redraw));

  return h('div.analyse__moves.areplay', {
    on: { click: (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#move-ctx-menu') && _puzzleContextMenuPath) {
        closePuzzleContextMenu();
        redraw();
      }
    }},
  }, children);
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
  // Use the current tree node's FEN — this tracks navigation and variations
  const puzzleFen = rc.treeNode.fen;

  // Set FEN override so the shared ceval view renders for the puzzle position
  setCevalFenOverride(puzzleFen);

  // If the shared engine is on during an active solve, mark this round as assisted.
  if (engineEnabled && rc.mode !== 'view') rc.notifyEngineUsedDuringSolve();

  // If engine is on, ensure it's evaluating the puzzle position (not the analysis board's).
  // Re-send on every render when engine is active — evalCurrentPosition() from the analysis
  // board may overwrite the position, so we need to keep reasserting the puzzle FEN.
  if (rc.puzzleEngineEnabled && sharedEngineReady) {
    // Use requestAnimationFrame to send AFTER any evalCurrentPosition() from toggle
    if (puzzleFen !== _lastPuzzleEngineFen) {
      _lastPuzzleEngineFen = puzzleFen;
      requestAnimationFrame(() => {
        sharedProtocol.setPosition(puzzleFen);
        sharedProtocol.go(analysisDepth, multiPv);
      });
    }
  } else if (!rc.puzzleEngineEnabled) {
    _lastPuzzleEngineFen = '';
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

/** Check if the user is viewing a previously completed puzzle (not the latest in-progress one). */
function isReviewingPastPuzzle(session: ActiveSession): boolean {
  const currentId = getPuzzleRoundState()?.definition?.id;
  if (!currentId) return false;
  // Find the last in-progress entry — that's the "current" session puzzle
  const lastInProgress = [...session.history].reverse().find(e => e.result === 'in-progress');
  if (lastInProgress && lastInProgress.puzzleId === currentId) return false;
  // The current puzzle is a completed one the user navigated back to
  return session.history.some(e => e.puzzleId === currentId && e.result !== 'in-progress');
}

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
  const completed = clean + assisted + failed;
  const total = session.history.length;

  return h('aside.puzzle__session-sidebar', [
    // Session info
    h('div.session-info', [
      h('div.session-info__header', [
        h('span.session-info__label', 'Current Session'),
        h('div.session-info__actions', [
          failed > 0
            ? h('button.session-info__retry', {
                on: { click: () => { retryFailedPuzzles(redraw); }},
                attrs: { title: 'Retry failed and assisted puzzles' },
              }, `Retry (${failed + assisted})`)
            : null,
          h('button.session-info__end', {
            on: { click: () => { clearActiveSession(); window.location.hash = '#/puzzles'; }},
            attrs: { title: 'End session' },
          }, 'End'),
        ]),
      ]),
      h('div.session-info__themes', labels.join(', ')),
      h('div.session-info__rating',
        `Rating ${session.ratingMin}\u2013${session.ratingMax}`),
      h('div.session-info__stats', [
        h('span.session-info__stat.session-info__stat--clean', `${clean} clean`),
        h('span.session-info__stat.session-info__stat--assisted', `${assisted} assisted`),
        h('span.session-info__stat.session-info__stat--failed', `${failed} failed`),
        h('span.session-info__stat', `${completed}/${total}`),
      ]),
      h('div.session-info__auto-next', [
        h('span', 'Auto-next'),
        h('div.toggle-switch', {
          class: { 'toggle-switch--on': getAutoNext() },
          on: { click: () => {
            setAutoNext(!getAutoNext());
            redraw();
          }},
        }, [
          h('div.toggle-switch__knob'),
        ]),
      ]),
    ]),

    // History chicklet grid
    h('div.session-history', [
      h('div.session-history__label', 'Puzzle History'),
      h('div.session-history__grid',
        session.history.map((entry, i) => {
          const isCurrent = entry.puzzleId === getPuzzleRoundState()?.definition?.id;
          const isCompleted = entry.result !== 'in-progress';
          return h('div.session-history__cell', {
            class: {
              'session-history__cell--clean': entry.result === 'clean',
              'session-history__cell--assisted': entry.result === 'assisted',
              'session-history__cell--failed': entry.result === 'failed',
              'session-history__cell--active': entry.result === 'in-progress',
              'session-history__cell--current': isCurrent,
            },
            attrs: { title: `#${i + 1}: ${entry.result}` },
            on: isCompleted && !isCurrent ? {
              click: () => {
                window.location.hash = `#/puzzles/${encodeURIComponent(entry.puzzleId)}`;
              },
            } : {},
            style: isCompleted && !isCurrent ? { cursor: 'pointer' } : {},
          });
        }),
      ),
      // "Continue" button — shown when reviewing a past puzzle.
      // If there is still an in-progress puzzle in the session (e.g. the user
      // navigated away from it to review an earlier one), go back to that puzzle.
      // Otherwise all session puzzles are done — advance to the next unplayed one.
      isReviewingPastPuzzle(session)
        ? h('button.session-history__continue', {
            on: { click: () => {
              const currentId = getPuzzleRoundState()?.definition?.id;
              const inProgress = session.history.find(e => e.result === 'in-progress');
              if (inProgress && inProgress.puzzleId !== currentId) {
                window.location.hash = `#/puzzles/${encodeURIComponent(inProgress.puzzleId)}`;
              } else {
                void nextPuzzle(redraw);
              }
            }},
          }, 'Continue Session \u2192')
        : null,
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
            renderRatedStreamEntry(redraw),
            renderPuzzleInfo(def, redraw),
            renderMetaPanel(def.id, redraw),
          ]),
      // Board area with player strips
      (() => {
        const [topStrip, bottomStrip] = rc ? renderPuzzlePlayerStrips(rc) : [null, null];
        return h('div.puzzle__board.main-board', [
          topStrip,
          h('div.puzzle__board-inner', [
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
          bottomStrip,
        ]);
      })(),
      // Side panel — flat flex column: ceval → move list → nav bar → feedback.
      // .puzzle__side has position: relative so the .action-menu overlay can cover it.
      // Mirrors lichess-org/lila: ui/puzzle/css/_tools.scss puzzle__tools structure.
      // All children are direct flex items so analyse__moves can flex-grow correctly.
      h('aside.puzzle__side', [
        rc ? renderAssistanceWarning(rc, redraw) : null,
        rc ? renderPuzzleRoundActionMenu(rc, redraw) : null,
        rc ? renderRatedBadge(rc, redraw) : null,
        rc ? renderPuzzleEnginePanel(rc, redraw) : null,
        renderPuzzleMoveList(def, rc, redraw),
        rc ? renderPuzzleRoundNavBar(rc, redraw) : null,
        rc ? renderSolvedRepeatNotice(rc) : null,
        rc ? renderRatingDisplay(rc) : null,
        rc ? renderFeedbackPanel(rc, redraw) : null,
      ]),
    ]),
  ]);
}
