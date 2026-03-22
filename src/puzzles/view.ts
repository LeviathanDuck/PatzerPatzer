import { h, type VNode } from 'snabbdom';
import { uciToSan } from '../board/index';
import type { PuzzleCtrl } from './ctrl';
import type { PuzzleRound, StoredPuzzleSession } from './types';

function formatLoss(loss: number): string {
  return `−${Math.round(loss * 100)}%`;
}

function formatMove(round: PuzzleRound): string {
  const moveNum = Math.ceil(round.source.ply / 2);
  const prefix = round.source.ply % 2 === 1 ? `${moveNum}.` : `${moveNum}…`;
  return `${prefix} ${round.source.san}`;
}

export function renderPuzzleLibrary(deps: {
  rounds: PuzzleRound[];
  session: StoredPuzzleSession;
  currentPuzzleKey: string | null;
  recentResultForKey: (key: string) => string | null;
  isResumeKey: (key: string) => boolean;
}): VNode {
  const { rounds, currentPuzzleKey, recentResultForKey, isResumeKey } = deps;
  if (rounds.length === 0) {
    return h('div.puzzle-library puzzle-library--empty', [
      h('h2', 'Saved Puzzles'),
      h('p', 'No saved puzzles yet.'),
      h('p', 'Review games, save missed tactics, and they will appear here as local training rounds.'),
      h('a', { attrs: { href: '#/games' } }, 'Go to My Games'),
    ]);
  }

  const resumeKey = currentPuzzleKey ?? deps.session.current?.key ?? null;

  return h('div.puzzle-library', [
    h('div.puzzle-library__header', [
      h('div', [
        h('h2', `Saved Puzzles (${rounds.length})`),
        h('p', 'Local tactics extracted from your reviewed games.'),
      ]),
      resumeKey
        ? h('a.button', { attrs: { href: `#/puzzles/${encodeURIComponent(resumeKey)}` } }, 'Resume Current Puzzle')
        : null,
    ]),
    h('ul.puzzle-library__list', rounds.map(round => {
      const result = recentResultForKey(round.key);
      const resume = isResumeKey(round.key);
      const source = round.sourceGame
        ? `${round.sourceGame.white ?? 'White'} vs ${round.sourceGame.black ?? 'Black'}`
        : 'Source game unavailable';
      return h('li.puzzle-library__item', [
        h('div.puzzle-library__main', [
          h('div.puzzle-library__move', formatMove(round)),
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
    })),
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

  const sourceGame = round.sourceGame;
  const sourceLabel = sourceGame
    ? `${sourceGame.white ?? 'White'} vs ${sourceGame.black ?? 'Black'}`
    : 'Source game unavailable';
  const metaRows: VNode[] = [
    h('dt', 'Source game'),
    h('dd', sourceLabel),
    h('dt', 'Mistake'),
    h('dd', formatMove(round)),
    h('dt', 'Loss'),
    h('dd', formatLoss(round.source.loss)),
    h('dt', 'Best move'),
    h('dd', uciToSan(round.startFen, round.source.bestMove)),
  ];
  if (sourceGame?.opening || sourceGame?.eco) {
    metaRows.push(h('dt', 'Opening'), h('dd', sourceGame.opening ?? sourceGame.eco ?? ''));
  }
  if (sourceGame?.date) {
    metaRows.push(h('dt', 'Date'), h('dd', sourceGame.date));
  }
  if (sourceGame?.timeClass) {
    metaRows.push(h('dt', 'Time control'), h('dd', sourceGame.timeClass));
  }

  return h('div.puzzle-round', [
    h('div.analyse__board.main-board.puzzle-round__board-shell', [
      deps.topStrip,
      h('div.analyse__board-inner', [deps.board, deps.promotionDialog]),
      deps.bottomStrip,
    ]),
    h('aside.puzzle-round__side', [
      h('section.puzzle-round__feedback', [
        h('div.puzzle-round__status', label),
        h('div.puzzle-round__progress', `${done} / ${total}`),
      ]),
      h('section.puzzle-round__controls', [
        h('button', { on: { click: deps.onBack } }, 'Back to library'),
        h('button', { on: { click: deps.onFlip } }, 'Flip'),
        feedback === 'fail'
          ? h('button', { on: { click: deps.onRetry } }, 'Retry')
          : null,
        (feedback === 'find' || feedback === 'good' || feedback === 'fail')
          ? h('button', { on: { click: deps.onViewSolution } }, 'View solution')
          : null,
        (result === 'solved' || result === 'viewed')
          ? h('button', { on: { click: deps.onNext } }, 'Next puzzle')
          : null,
      ]),
      h('section.puzzle-round__meta', [
        h('h3', 'Puzzle context'),
        h('dl', metaRows),
        round.sourceGame
          ? h('button', { on: { click: deps.onOpenSourceGame } }, 'Open source game')
          : null,
      ]),
    ]),
  ]);
}
