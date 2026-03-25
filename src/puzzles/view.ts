import { h, type VNode } from 'snabbdom';
import { uciToSan } from '../board/index';
import type { PuzzleCtrl } from './ctrl';
import type {
  ImportedPuzzleLibraryState,
  ImportedPuzzleRecord,
  PuzzleLibrarySource,
  PuzzleRound,
  SavedPuzzleRound,
  StoredPuzzleSession,
} from './types';

function formatLoss(loss: number): string {
  return `−${Math.round(loss * 100)}%`;
}

function formatSavedMove(round: SavedPuzzleRound): string {
  const moveNum = Math.ceil(round.source.ply / 2);
  const prefix = round.source.ply % 2 === 1 ? `${moveNum}.` : `${moveNum}…`;
  return `${prefix} ${round.source.san}`;
}

function formatImportedOpening(record: ImportedPuzzleRecord): string {
  return record.openingTags[0] ?? 'No opening tag';
}

function renderSourceSwitch(current: PuzzleLibrarySource, onChange: (source: PuzzleLibrarySource) => void): VNode {
  return h('div.puzzle-library__sources', [
    h('button', {
      class: { active: current === 'saved' },
      on: { click: () => onChange('saved') },
    }, 'Saved Puzzles'),
    h('button', {
      class: { active: current === 'lichess' },
      on: { click: () => onChange('lichess') },
    }, 'Imported Lichess'),
  ]);
}

function renderSavedPuzzleLibrary(deps: {
  rounds: SavedPuzzleRound[];
  currentPuzzleKey: string | null;
  recentResultForKey: (key: string) => string | null;
  isResumeKey: (key: string) => boolean;
}): VNode {
  const { rounds, currentPuzzleKey, recentResultForKey, isResumeKey } = deps;
  if (rounds.length === 0) {
    return h('div.puzzle-library__empty-body', [
      h('p', 'No saved puzzles yet.'),
      h('p', 'Review games, save missed tactics, and they will appear here as local training rounds.'),
      h('a', { attrs: { href: '#/games' } }, 'Go to My Games'),
    ]);
  }

  return h('ul.puzzle-library__list', rounds.map(round => {
    const result = recentResultForKey(round.key);
    const resume = isResumeKey(round.key) || currentPuzzleKey === round.key;
    const source = round.sourceGame
      ? `${round.sourceGame.white ?? 'White'} vs ${round.sourceGame.black ?? 'Black'}`
      : 'Source game unavailable';
    return h('li.puzzle-library__item', [
      h('div.puzzle-library__main', [
        h('div.puzzle-library__move', formatSavedMove(round)),
        h('div.puzzle-library__meta', [
          h('span', formatLoss(round.source.loss)),
          h('span', `Best: ${uciToSan(round.startFen, round.source.bestMove)}`),
          h('span', source),
        ]),
      ]),
      h('div.puzzle-library__actions', [
        result ? h('span.puzzle-library__badge', result) : null,
        round.sourceGame
          ? h('a.button', { attrs: { href: `#/puzzles/${round.routeId}` } }, resume ? 'Resume' : 'Solve')
          : h('span.puzzle-library__badge', 'Unavailable'),
      ]),
    ]);
  }));
}

function renderImportedPuzzleLibrary(deps: {
  state: ImportedPuzzleLibraryState;
  onRatingMin: (value: string) => void;
  onRatingMax: (value: string) => void;
  onTheme: (value: string) => void;
  onOpening: (value: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}): VNode {
  const { state } = deps;

  if (state.status === 'missing') {
    return h('div.puzzle-library__empty-body', [
      h('p', 'No generated Lichess puzzle dataset was found in `public/generated/lichess-puzzles/`.'),
      h('p', 'Run the local download and shard scripts first, then reload this page.'),
    ]);
  }

  if (state.status === 'error') {
    return h('div.puzzle-library__empty-body', [
      h('p', 'The imported puzzle dataset could not be loaded.'),
      state.error ? h('p', state.error) : null,
    ]);
  }

  const manifest = state.manifest;
  const pageLabel = `Page ${state.query.page + 1}`;
  const loadedLabel = manifest
    ? `Loaded ${state.loadedShardCount} / ${manifest.shards.length} shards for this view`
    : 'Loading manifest…';

  const filters = h('div.puzzle-library__filters', [
    h('label', [
      h('span', 'Min rating'),
      h('input', {
        attrs: { type: 'number', value: state.query.filters.ratingMin, placeholder: 'All' },
        on: { input: (e: Event) => deps.onRatingMin((e.target as HTMLInputElement).value) },
      }),
    ]),
    h('label', [
      h('span', 'Max rating'),
      h('input', {
        attrs: { type: 'number', value: state.query.filters.ratingMax, placeholder: 'All' },
        on: { input: (e: Event) => deps.onRatingMax((e.target as HTMLInputElement).value) },
      }),
    ]),
    h('label', [
      h('span', 'Theme'),
      h('select', {
        on: { change: (e: Event) => deps.onTheme((e.target as HTMLSelectElement).value) },
      }, [
        h('option', { attrs: { value: '' }, props: { selected: state.query.filters.theme === '' } }, 'All themes'),
        ...(manifest?.themes ?? []).map(theme =>
          h('option', {
            attrs: { value: theme },
            props: { selected: state.query.filters.theme === theme },
          }, theme),
        ),
      ]),
    ]),
    h('label', [
      h('span', 'Opening'),
      h('select', {
        on: { change: (e: Event) => deps.onOpening((e.target as HTMLSelectElement).value) },
      }, [
        h('option', { attrs: { value: '' }, props: { selected: state.query.filters.opening === '' } }, 'All openings'),
        ...(manifest?.openings ?? []).map(opening =>
          h('option', {
            attrs: { value: opening },
            props: { selected: state.query.filters.opening === opening },
          }, opening),
        ),
      ]),
    ]),
  ]);

  if (state.status === 'loading') {
    return h('div', [
      filters,
      h('div.puzzle-library__empty-body', [
        h('p', 'Loading imported Lichess puzzles…'),
        h('p', loadedLabel),
      ]),
    ]);
  }

  return h('div.puzzle-library__imported', [
    filters,
    h('div.puzzle-library__paging', [
      h('span', loadedLabel),
      h('div.puzzle-library__paging-actions', [
        h('button', { attrs: { disabled: !state.hasPrev }, on: { click: deps.onPrevPage } }, '← Prev'),
        h('span', pageLabel),
        h('button', { attrs: { disabled: !state.hasNext }, on: { click: deps.onNextPage } }, 'Next →'),
      ]),
    ]),
    state.items.length === 0
      ? h('div.puzzle-library__empty-body', [
          h('p', 'No imported puzzles matched the current filters.'),
        ])
      : h('ul.puzzle-library__list', state.items.map(item => {
          const themeLabel = item.themes.slice(0, 3).join(', ') || 'No themes';
          return h('li.puzzle-library__item', [
            h('div.puzzle-library__main', [
              h('div.puzzle-library__move', `Lichess Puzzle ${item.id}`),
              h('div.puzzle-library__meta', [
                h('span', `Rating ${item.rating}`),
                item.plays !== undefined ? h('span', `${item.plays.toLocaleString()} plays`) : null,
                h('span', formatImportedOpening(item)),
                h('span', themeLabel),
              ]),
            ]),
            h('div.puzzle-library__actions', [
              h('span.puzzle-library__badge', 'imported'),
              h('a.button', { attrs: { href: `#/puzzles/${item.routeId}` } }, 'Solve'),
            ]),
          ]);
        })),
  ]);
}

export function renderPuzzleLibrary(deps: {
  source: PuzzleLibrarySource;
  onSourceChange: (source: PuzzleLibrarySource) => void;
  savedRounds: SavedPuzzleRound[];
  importedState: ImportedPuzzleLibraryState;
  session: StoredPuzzleSession;
  currentPuzzleKey: string | null;
  recentResultForKey: (key: string) => string | null;
  isResumeKey: (key: string) => boolean;
  onImportedRatingMin: (value: string) => void;
  onImportedRatingMax: (value: string) => void;
  onImportedTheme: (value: string) => void;
  onImportedOpening: (value: string) => void;
  onImportedPrevPage: () => void;
  onImportedNextPage: () => void;
}): VNode {
  const resumeKey = deps.currentPuzzleKey ?? deps.session.current?.key ?? null;
  const title = deps.source === 'saved'
    ? `Saved Puzzles (${deps.savedRounds.length})`
    : `Imported Lichess Puzzles (${deps.importedState.manifest?.totalCount ?? '…'})`;
  const subtitle = deps.source === 'saved'
    ? 'Local tactics extracted from your reviewed games.'
    : 'Official Lichess puzzle export, preprocessed into local browser-ready shards.';

  return h('div.puzzle-library', [
    h('div.puzzle-library__header', [
      h('div', [
        h('h2', title),
        h('p', subtitle),
      ]),
      resumeKey
        ? h('a.button', { attrs: { href: `#/puzzles/${encodeURIComponent(resumeKey)}` } }, 'Resume Current Puzzle')
        : null,
    ]),
    renderSourceSwitch(deps.source, deps.onSourceChange),
    deps.source === 'saved'
      ? renderSavedPuzzleLibrary({
          rounds: deps.savedRounds,
          currentPuzzleKey: deps.currentPuzzleKey,
          recentResultForKey: deps.recentResultForKey,
          isResumeKey: deps.isResumeKey,
        })
      : renderImportedPuzzleLibrary({
          state: deps.importedState,
          onRatingMin: deps.onImportedRatingMin,
          onRatingMax: deps.onImportedRatingMax,
          onTheme: deps.onImportedTheme,
          onOpening: deps.onImportedOpening,
          onPrevPage: deps.onImportedPrevPage,
          onNextPage: deps.onImportedNextPage,
        }),
  ]);
}

export function renderPuzzleRound(deps: {
  ctrl: PuzzleCtrl;
  onBack: () => void;
  onFlip: () => void;
  onRetry: () => void;
  onViewSolution: () => void;
  onNext: () => void;
  onOpenSourceGame: () => void;
  board: VNode;
  promotionDialog: VNode | null;
  topStrip: VNode;
  bottomStrip: VNode;
}): VNode {
  const round = deps.ctrl.round();
  const [done, total] = deps.ctrl.progress();
  const feedback = deps.ctrl.feedback();
  const result = deps.ctrl.result();

  let label = `Find the best move for ${round.toMove === 'white' ? 'White' : 'Black'}`;
  if (feedback === 'good') label = 'Correct. Keep going.';
  else if (feedback === 'fail') label = 'Not the move. Try again or reveal the line.';
  else if (feedback === 'win') label = 'Solved.';
  else if (feedback === 'view') label = 'Solution shown.';

  const metaRows: VNode[] = [];

  if (round.sourceKind === 'saved') {
    const sourceGame = round.sourceGame;
    const sourceLabel = sourceGame
      ? `${sourceGame.white ?? 'White'} vs ${sourceGame.black ?? 'Black'}`
      : 'Source game unavailable';
    metaRows.push(
      h('dt', 'Source game'),
      h('dd', sourceLabel),
      h('dt', 'Mistake'),
      h('dd', formatSavedMove(round)),
      h('dt', 'Loss'),
      h('dd', formatLoss(round.source.loss)),
      h('dt', 'Best move'),
      h('dd', uciToSan(round.startFen, round.source.bestMove)),
    );
    if (sourceGame?.opening || sourceGame?.eco) {
      metaRows.push(h('dt', 'Opening'), h('dd', sourceGame.opening ?? sourceGame.eco ?? ''));
    }
    if (sourceGame?.date) {
      metaRows.push(h('dt', 'Date'), h('dd', sourceGame.date));
    }
    if (sourceGame?.timeClass) {
      metaRows.push(h('dt', 'Time control'), h('dd', sourceGame.timeClass));
    }
  } else {
    const imported = round.imported;
    metaRows.push(
      h('dt', 'Source'),
      h('dd', 'Imported Lichess puzzle'),
      h('dt', 'Puzzle ID'),
      h('dd', imported.id),
      h('dt', 'Rating'),
      h('dd', String(imported.rating)),
      h('dt', 'Themes'),
      h('dd', imported.themes.join(', ') || 'None'),
      h('dt', 'Opening'),
      h('dd', formatImportedOpening(imported)),
    );
    if (imported.plays !== undefined) {
      metaRows.push(h('dt', 'Plays'), h('dd', imported.plays.toLocaleString()));
    }
    if (imported.popularity !== undefined) {
      metaRows.push(h('dt', 'Popularity'), h('dd', String(imported.popularity)));
    }
  }

  return h('div.puzzle-round', [
    h('div.analyse__board.main-board.puzzle-round__board-shell', [
      deps.topStrip,
      h('div.analyse__board-inner', [deps.board, deps.promotionDialog]),
      deps.bottomStrip,
    ]),
    h('aside.puzzle-round__side', [
      h(`section.puzzle-round__feedback.${feedback}`, [
        (result === 'solved' || result === 'viewed')
          ? h('div.puzzle-round__after', [
              h('div.puzzle-round__complete',
                result === 'solved' ? 'Puzzle solved!' : 'Puzzle complete.',
              ),
              h('button.puzzle-round__next', { on: { click: deps.onNext } }, 'Continue training →'),
            ])
          : [
              (feedback === 'good' || feedback === 'win')
                ? h('div.puzzle-round__feedback-icon', '✓')
                : feedback === 'fail'
                  ? h('div.puzzle-round__feedback-icon', '✗')
                  : null,
              h('div.puzzle-round__status', label),
              h('div.puzzle-round__progress', `${done} / ${total}`),
            ],
      ]),
      h('section.puzzle-round__controls', [
        h('button', { on: { click: deps.onBack } }, 'Back to library'),
        h('button', { on: { click: deps.onFlip } }, 'Flip'),
        (result !== 'solved' && result !== 'viewed' && feedback === 'fail')
          ? h('button', { on: { click: deps.onRetry } }, 'Retry')
          : null,
        (result !== 'solved' && result !== 'viewed' && (feedback === 'find' || feedback === 'good' || feedback === 'fail'))
          ? h('button', { on: { click: deps.onViewSolution } }, 'View solution')
          : null,
      ]),
      h('section.puzzle-round__meta', [
        h('h3', 'Puzzle context'),
        h('dl', metaRows),
        round.sourceKind === 'saved' && round.sourceGame
          ? h('button', { on: { click: deps.onOpenSourceGame } }, 'Open source game')
          : null,
        round.sourceKind === 'imported' && round.imported.gameUrl
          ? h('a.button', {
              attrs: {
                href: round.imported.gameUrl,
                target: '_blank',
                rel: 'noreferrer',
              },
            }, 'Open source on Lichess')
          : null,
      ]),
    ]),
  ]);
}
