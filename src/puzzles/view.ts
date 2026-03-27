// ---------------------------------------------------------------------------
// Puzzle V1 — Library view
// Adapted from lichess-org/lila: ui/puzzle/src/view/side.ts (layout pattern)
//
// Renders the top-level puzzle library surface with two source sections:
// "Imported Puzzles" and "User Library". Each section displays a count of
// puzzles from that source and a placeholder browse action.
// ---------------------------------------------------------------------------

import { h, type VNode } from 'snabbdom';
import {
  getLibraryCounts, getPuzzleRoundState, mountPuzzleBoard, destroyPuzzleBoard,
  type LibraryCounts,
} from './ctrl';
import type { PuzzleDefinition } from './types';

function sourceCard(
  title: string,
  description: string,
  count: number | undefined,
  _redraw: () => void,
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
            console.log(`[puzzle-library] Browse ${title} — not yet implemented`);
          },
        },
      },
      'Browse',
    ),
  ]);
}

export function renderPuzzleLibrary(redraw: () => void): VNode {
  const counts = getLibraryCounts();

  return h('div.puzzle-page', [
    h('div.puzzle-library', [
      h('h2.puzzle-library__title', 'Puzzle Library'),
      h('div.puzzle-library__sources', [
        sourceCard(
          'Imported Puzzles',
          'Puzzles imported from the Lichess puzzle database.',
          counts?.imported,
          redraw,
        ),
        sourceCard(
          'User Library',
          'Puzzles created from your reviewed games.',
          counts?.user,
          redraw,
        ),
      ]),
    ]),
  ]);
}

// --- Puzzle round view ---

function puzzleInfoRows(def: PuzzleDefinition): VNode[] {
  const rows: VNode[] = [];

  // Source kind — always visible
  const sourceLabel = def.sourceKind === 'imported-lichess'
    ? 'Imported (Lichess)'
    : 'User Library';
  rows.push(h('tr', [h('td.puzzle-round__label', 'Source'), h('td', sourceLabel)]));

  // Start FEN
  rows.push(h('tr', [h('td.puzzle-round__label', 'Start FEN'), h('td.puzzle-round__fen', def.startFen)]));

  // Solution length
  rows.push(h('tr', [
    h('td.puzzle-round__label', 'Solution moves'),
    h('td', `${def.solutionLine.length}`),
  ]));

  // Source-specific fields
  if (def.sourceKind === 'imported-lichess') {
    rows.push(h('tr', [h('td.puzzle-round__label', 'Rating'), h('td', `${def.rating}`)]));
    if (def.themes.length > 0) {
      rows.push(h('tr', [h('td.puzzle-round__label', 'Themes'), h('td', def.themes.join(', '))]));
    }
    if (def.lichessPuzzleId) {
      rows.push(h('tr', [h('td.puzzle-round__label', 'Lichess ID'), h('td', def.lichessPuzzleId)]));
    }
  } else {
    if (def.title) {
      rows.push(h('tr', [h('td.puzzle-round__label', 'Title'), h('td', def.title)]));
    }
    if (def.sourceReason) {
      rows.push(h('tr', [h('td.puzzle-round__label', 'Reason'), h('td', def.sourceReason)]));
    }
    if (def.sourceGameId) {
      rows.push(h('tr', [h('td.puzzle-round__label', 'Source game'), h('td', def.sourceGameId)]));
    }
  }

  return rows;
}

export function renderPuzzleRound(_redraw: () => void): VNode {
  const rs = getPuzzleRoundState();

  // No round state yet (should not normally happen if openPuzzleRound was called)
  if (!rs) {
    return h('div.puzzle-page', h('div.puzzle-round', 'Initializing…'));
  }

  // Loading
  if (rs.status === 'loading') {
    return h('div.puzzle-page', h('div.puzzle-round', [
      h('span.puzzle-round__loading', 'Loading puzzle…'),
    ]));
  }

  // Error
  if (rs.status === 'error' || !rs.definition) {
    return h('div.puzzle-page', h('div.puzzle-round', [
      h('div.puzzle-round__error', rs.error ?? 'Unknown error'),
      h('a.puzzle-round__back', { attrs: { href: '#/puzzles' } }, '\u2190 Back to Library'),
    ]));
  }

  // Ready — show puzzle board + side panel
  // Layout mirrors lichess-org/lila: ui/puzzle/src/view/main.ts
  //   main.puzzle > [aside.puzzle__side, div.puzzle__board, div.puzzle__tools]
  // Simplified for V1: board + side info panel only, no eval gauge or tool panel yet.
  const def = rs.definition;
  return h('div.puzzle-page', [
    h('div.puzzle', [
      // Board area — mirrors div.puzzle__board.main-board from Lichess puzzle view
      h('div.puzzle__board.main-board', [
        h('div.cg-wrap', {
          key: 'puzzle-board',
          hook: {
            insert: vnode => {
              mountPuzzleBoard(vnode.elm as HTMLElement, _redraw);
            },
            destroy: () => {
              destroyPuzzleBoard();
            },
          },
        }),
      ]),
      // Side panel — puzzle info and navigation
      h('aside.puzzle__side', [
        h('div.puzzle-round__header', [
          h('a.puzzle-round__back', { attrs: { href: '#/puzzles' } }, '\u2190 Back to Library'),
          h('h2.puzzle-round__title', `Puzzle ${def.id}`),
        ]),
        h('table.puzzle-round__info', puzzleInfoRows(def)),
      ]),
    ]),
  ]);
}
