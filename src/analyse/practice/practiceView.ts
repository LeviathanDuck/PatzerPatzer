





import { h, type VNode } from 'snabbdom';
import { renderPremoveQueueControls } from '../../board/premoves';
import { renderStrengthSelector } from '../../engine/strengthView';
import {
  isMyTurn,
  playCommentBest,
  practiceActive,
  practiceComment,
  practiceCommentShape,
  practiceEndState,
  practiceFeedbackEnabled,
  practiceHint,
  practiceHinting,
  practiceRailSettingsOpen,
  practiceReset,
  practiceResume,
  practiceRunning,
  practiceStrengthConfig,
  practiceStrengthLevel,
  setPracticeFeedbackEnabled,
  setPracticeRailSettingsOpen,
  setPracticeStrengthLevel,
  type PracticeComment,
  type PracticeEndState,
} from './practiceCtrl';

export interface PracticeViewDeps {
  turnColor(): 'white' | 'black';
  redraw(): void;
  onClose(): void;
}

const VERDICT_LABELS: Record<PracticeComment['verdict'], string> = {
  goodMove: 'Good move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

// "Best was X" / "Another was X" — clickable, hover previews the move arrow.
function commentBest(c: PracticeComment, redraw: () => void): (VNode | string)[] {
  if (!c.best) return [];
  const best = c.best;
  const label = c.verdict === 'goodMove' ? 'Another was ' : 'Best was ';
  return [
    label,
    h('move.practice-box__best', {
      hook: {
        insert: vnode => {
          const el = vnode.elm as HTMLElement;
          el.addEventListener('click', () => { playCommentBest(); redraw(); });
          el.addEventListener('mouseover', () => practiceCommentShape(true));
          el.addEventListener('mouseout', () => practiceCommentShape(false));
        },
        destroy: () => practiceCommentShape(false),
      },
    }, [h('san', best.san)]),
  ];
}

function renderOffTrack(deps: PracticeViewDeps): VNode {
  return h('div.practice-box__player.off', [
    h('div.practice-box__icon.off', '!'),
    h('div.practice-box__instruction', [
      h('strong', 'You browsed away'),
      h('div.practice-box__choices', [
        h('a', {
          on: { click: () => { practiceResume(); deps.redraw(); } },
        }, 'Resume practice'),
      ]),
    ]),
  ]);
}

function renderEnd(end: NonNullable<PracticeEndState>): VNode {
  const winner = end.kind === 'checkmate' ? end.winner : undefined;
  return h('div.practice-box__player', [
    winner
      ? h('div.practice-box__no-square', h(`piece.king.${winner}`))
      : h('div.practice-box__icon.off', '!'),
    h('div.practice-box__instruction', [
      h('strong', end.kind === 'checkmate' ? 'Checkmate' : 'Draw'),
      end.kind === 'checkmate'
        ? h('em', winner === 'white' ? 'White wins the game' : 'Black wins the game')
        : h('em',
            end.kind === 'fiftyMoves' ? 'Draw by the fifty-move rule'
            : end.kind === 'threefold' ? 'Draw by threefold repetition'
            : 'The game is a draw'),
    ]),
  ]);
}

function renderRunning(deps: PracticeViewDeps): VNode {
  const hint = practiceHinting();
  const myTurn = isMyTurn();
  return h('div.practice-box__player.running', [
    h('div.practice-box__no-square', h(`piece.king.${deps.turnColor()}`)),
    h('div.practice-box__instruction', [
      h('strong', myTurn ? 'Your turn' : 'The computer is thinking…'),
      h('div.practice-box__choices', [
        myTurn
          ? h('a', {
              on: { click: () => { practiceHint(); deps.redraw(); } },
            }, hint ? (hint.mode === 'piece' ? 'See best move' : 'Hide best move') : 'Get a hint')
          : null,
      ]),
    ]),
  ]);
}

/** The practice feedback panel. Renders only while a session is active. */
export function renderPracticeBox(deps: PracticeViewDeps): VNode {
  const comment = practiceComment();
  const running = practiceRunning();
  const end = practiceEndState();
  const strength = practiceStrengthConfig();
  return h(`div.practice-box.practice-box--${comment ? comment.verdict : 'no-verdict'}`, [
    h('div.practice-box__title', [
      h('span', 'Practice vs. Computer'),
      h('span.practice-box__strength', `Level ${strength.level}`),
      h('button.practice-box__close', {
        attrs: { type: 'button', title: 'Stop practice', 'aria-label': 'Stop practice' },
        on: { click: () => deps.onClose() },
      }, '×'),
    ]),
    h('div.practice-box__feedback',
      end ? renderEnd(end) : running ? renderRunning(deps) : renderOffTrack(deps),
    ),


    running && !end && practiceFeedbackEnabled()
      ? h('div.practice-box__comment',
          comment
            ? [
                h('span.practice-box__verdict', VERDICT_LABELS[comment.verdict]),
                ' ',
                ...commentBest(comment, deps.redraw),
              ]
            : [isMyTurn() ? '' : h('span.practice-box__wait', 'Evaluating your move…')],
        )
      : null,
  ]);
}

export interface PracticeRailDeps {
  redraw(): void;
}










export function renderPracticeRail(deps: PracticeRailDeps): VNode | null {
  const premoveControls = renderPremoveQueueControls(deps);
  if (!practiceActive()) {
    return premoveControls
      ? h('div.practice-rail', {
          class: { 'practice-rail--queue-visible': true },
        }, [premoveControls])
      : null;
  }
  const hint = practiceHinting();
  const feedbackOn = practiceFeedbackEnabled();
  const settingsOpen = practiceRailSettingsOpen();
  return h('div.practice-rail', {
    class: { 'practice-rail--queue-visible': premoveControls !== null },
  }, [
    h('div.practice-rail__row', [
      h('button.practice-rail__btn', {
        attrs: { type: 'button', title: 'Restart from the position this session started at' },
        on: { click: () => practiceReset() },
      }, 'Reset'),
      h('button.practice-rail__btn', {
        class: { active: feedbackOn },
        attrs: {
          type: 'button',
          title: feedbackOn ? 'Hide move feedback' : 'Show move feedback',
          'aria-pressed': String(feedbackOn),
        },
        on: { click: () => { setPracticeFeedbackEnabled(!feedbackOn); deps.redraw(); } },
      }, feedbackOn ? 'Feedback: On' : 'Feedback: Off'),
      h('button.practice-rail__btn', {
        attrs: { type: 'button', title: 'Get a hint' },
        on: { click: () => practiceHint() },
      }, hint ? (hint.mode === 'piece' ? 'See best move' : 'Hide best move') : 'Get a hint'),
      h('button.practice-rail__btn.practice-rail__btn--settings', {
        class: { active: settingsOpen },
        attrs: {
          type: 'button',
          title: 'Practice settings',
          'aria-label': 'Practice settings',
          'aria-expanded': String(settingsOpen),
        },
        on: { click: () => { setPracticeRailSettingsOpen(!settingsOpen); deps.redraw(); } },
      }, '⚙'),
    ]),
    premoveControls,
    settingsOpen
      ? h('div.practice-rail__settings', [
          renderStrengthSelector(practiceStrengthLevel(), level => {
            setPracticeStrengthLevel(level);
            deps.redraw();
          }),
        ])
      : null,
  ]);
}
