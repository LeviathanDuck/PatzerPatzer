// ---------------------------------------------------------------------------
// Puzzle V1 — Library view + round view with feedback and result states
// Adapted from lichess-org/lila: ui/puzzle/src/view/feedback.ts, after.ts
//
// Renders the top-level puzzle library surface and the puzzle round view
// with real-time feedback during play and result-state UI on solve/fail.
// ---------------------------------------------------------------------------

import { h, type VNode } from 'snabbdom';
import {
  getLibraryCounts, getPuzzleRoundState, getActiveRoundCtrl,
  mountPuzzleBoard, destroyPuzzleBoard, nextPuzzle, retryPuzzle,
  getOrCreateMeta, savePuzzleMeta, toggleFavorite,
  isRetrySessionActive, getRetryCount, getRetryIndex, getRetryQueue,
  startRetrySession, nextRetryPuzzle, loadRetryCount,
  getDueCount, loadDueCount, startDueSession,
  getPuzzleListState, openPuzzleList, closePuzzleList,
  filterPuzzleList, loadMorePuzzles, selectPuzzleFromList,
  type LibraryCounts, type PuzzleListFilters, type PuzzleListState,
} from './ctrl';
import type { PuzzleRoundCtrl } from './ctrl';
import type { PuzzleDefinition, PuzzleSourceKind, SolveResult, PuzzleMoveQuality, PuzzleUserMeta } from './types';

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

export function renderPuzzleLibrary(redraw: () => void): VNode {
  // If the puzzle list is active, show that instead of the library overview
  const listState = getPuzzleListState();
  if (listState) {
    return renderPuzzleList(listState, redraw);
  }

  const counts = getLibraryCounts();
  const rCount = getRetryCount();
  const dCount = getDueCount();

  // Trigger retry count load if not yet loaded
  if (rCount === undefined) {
    loadRetryCount(redraw);
  }
  // Trigger due count load if not yet loaded
  if (dCount === undefined) {
    loadDueCount(redraw);
  }

  return h('div.puzzle-page', [
    h('div.puzzle-library', [
      h('h2.puzzle-library__title', 'Puzzle Library'),
      h('div.puzzle-library__sources', [
        sourceCard(
          'Imported Puzzles',
          'Puzzles imported from the Lichess puzzle database.',
          counts?.imported,
          'imported-lichess',
          redraw,
        ),
        sourceCard(
          'User Library',
          'Puzzles created from your reviewed games.',
          counts?.user,
          'user-library',
          redraw,
        ),
      ]),
      // Due for Review section — simple interval-based review scheduling
      h('div.puzzle-library__due', [
        h('div.puzzle-library__due-header', [
          h('h3.puzzle-library__due-title', 'Due for Review'),
          h(
            'span.puzzle-library__due-count',
            dCount !== undefined
              ? `${dCount} puzzle${dCount === 1 ? '' : 's'} due`
              : 'loading\u2026',
          ),
        ]),
        h('p.puzzle-library__due-desc',
          'Puzzles due for another attempt based on simple review intervals. Clean solves are due after 7 days, recovered solves after 3 days, and others after 1 day.',
        ),
        h(
          'button.button.puzzle-library__due-action',
          {
            attrs: { disabled: dCount === undefined || dCount === 0 },
            on: {
              click: () => { startDueSession(redraw); },
            },
          },
          'Review Due Puzzles',
        ),
      ]),
      // Retry Failed queue launcher
      h('div.puzzle-library__retry', [
        h('div.puzzle-library__retry-header', [
          h('h3.puzzle-library__retry-title', 'Retry Failed'),
          h(
            'span.puzzle-library__retry-count',
            rCount !== undefined
              ? `${rCount} puzzle${rCount === 1 ? '' : 's'} to retry`
              : 'loading\u2026',
          ),
        ]),
        h('p.puzzle-library__retry-desc',
          'Practice puzzles you previously failed, skipped, solved with assistance, or haven\u2019t tried yet.',
        ),
        h(
          'button.button.puzzle-library__retry-action',
          {
            attrs: { disabled: rCount === undefined || rCount === 0 },
            on: {
              click: () => { startRetrySession(redraw); },
            },
          },
          'Start Retry Session',
        ),
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
            newFilters.ratingMin = isNaN(val) ? undefined : val;
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
            newFilters.ratingMax = isNaN(val) ? undefined : val;
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
              newFilters.theme = val || undefined;
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

function renderPuzzleList(
  ls: PuzzleListState,
  redraw: () => void,
): VNode {
  if (ls.loading) {
    return h('div.puzzle-page', [
      h('div.puzzle-list', [
        h('span.puzzle-list__loading', 'Loading puzzles\u2026'),
      ]),
    ]);
  }

  const hasMore = ls.visible.length < ls.filtered.length;

  return h('div.puzzle-page', [
    h('div.puzzle-list', [
      h('div.puzzle-list__header', [
        h('a.puzzle-list__back', {
          on: { click: () => closePuzzleList(redraw) },
        }, '\u2190 Back to Library'),
        h('h2.puzzle-list__title', sourceLabel(ls.source)),
      ]),
      renderPuzzleListFilterBar(ls, redraw),
      ls.filtered.length === 0
        ? h('div.puzzle-list__empty', 'No puzzles match the current filters.')
        : h('div.puzzle-list__rows', [
            // Column headers
            h('div.puzzle-list__row.puzzle-list__row--header', [
              h('span.puzzle-list__row-id', 'Puzzle'),
              ...(ls.source === 'imported-lichess'
                ? [h('span.puzzle-list__row-rating', 'Rating')]
                : []),
              h('span.puzzle-list__row-themes',
                ls.source === 'imported-lichess' ? 'Themes' : 'Reason'),
              h('span.puzzle-list__row-moves', 'Length'),
            ]),
            ...ls.visible.map(def => renderPuzzleListRow(def, redraw)),
          ]),
      hasMore
        ? h('button.button.puzzle-list__load-more', {
            on: { click: () => loadMorePuzzles(redraw) },
          }, `Load More (${ls.visible.length} of ${ls.filtered.length})`)
        : null,
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
  // --- Playing state ---
  if (rc.status === 'playing') {
    return renderPlayingFeedback(rc, redraw);
  }

  // --- Solved state ---
  if (rc.status === 'solved') {
    return renderSolvedFeedback(rc, redraw);
  }

  // --- Failed state ---
  if (rc.status === 'failed') {
    return renderFailedFeedback(rc, redraw);
  }

  // --- Viewing state ---
  return h('div.puzzle__feedback.viewing', [
    h('div.puzzle__feedback__message', 'Viewing puzzle'),
  ]);
}

/**
 * Feedback during active play — "Your turn" prompt, correct/wrong transients.
 * Adapted from lichess-org/lila: ui/puzzle/src/view/feedback.ts initial/good/fail
 */
function renderPlayingFeedback(rc: PuzzleRoundCtrl, redraw: () => void): VNode {
  if (rc.feedback === 'good') {
    // Transient correct-move feedback
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
    h('div.puzzle__feedback__actions', [
      h('button.button.button-empty.puzzle__hint', {
        on: { click: () => { rc.useHint(redraw); } },
      }, rc.usedHint ? 'Hint used' : 'Hint'),
      h('button.button.button-empty.puzzle__reveal', {
        on: { click: () => { rc.revealSolution(redraw); } },
      }, 'Show Solution'),
      h('button.button.button-empty.puzzle__skip', {
        on: { click: () => { rc.skipPuzzle(); redraw(); } },
      }, 'Skip'),
    ]),
    // Show the expected move if solution was revealed
    rc.revealedSolution
      ? h('div.puzzle__feedback__revealed', [
          h('em', `Solution: ${rc.currentExpectedMove() ?? 'complete'}`),
        ])
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

function renderMoveQualityRow(mq: PuzzleMoveQuality): VNode {
  const color = QUALITY_COLORS[mq.quality];
  const label = QUALITY_LABELS[mq.quality];

  const cells: VNode[] = [];

  // Move label (UCI for now)
  cells.push(h('span.puzzle__mq-move', mq.playedUci));

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

function renderMoveQualitySummary(moveQualities: PuzzleMoveQuality[]): VNode | null {
  if (moveQualities.length === 0) return null;

  return h('div.puzzle__mq-summary', [
    h('div.puzzle__mq-header', 'Move Quality'),
    ...moveQualities.map(renderMoveQualityRow),
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
    renderMoveQualitySummary(rc.moveQualities),
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

  // Show the expected correct move
  const expectedMove = rc.solutionLine[rc.progressPly];
  const correctMoveNote = expectedMove
    ? `The correct move was ${expectedMove}.`
    : undefined;

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
    renderMoveQualitySummary(rc.moveQualities),
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
              meta.notes = val || undefined;
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
            meta.tags = tags.length > 0 ? tags : undefined;
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

  return h('div.puzzle-page', [
    h('div.puzzle', [
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
      // Side panel — feedback + puzzle info
      h('aside.puzzle__side', [
        h('div.puzzle-round__header', [
          h('a.puzzle-round__back', { attrs: { href: '#/puzzles' } }, '\u2190 Back to Library'),
          h('h2.puzzle-round__title', `Puzzle ${def.id}`),
        ]),
        // Feedback panel
        rc ? renderFeedbackPanel(rc, redraw) : null,
        h('table.puzzle-round__info', puzzleInfoRows(def)),
        // Metadata editing — favorites, notes, tags, collections
        renderMetaPanel(def.id, redraw),
      ]),
    ]),
  ]);
}
