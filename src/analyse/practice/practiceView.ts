





import { h, type VNode } from 'snabbdom';
import { renderPremoveQueueControls } from '../../board/premoves';
import { renderStrengthSelector } from '../../engine/strengthView';
import { controlExplainerAttrs, iconControlExplainerAttrs } from '../../ui/controlExplainer';

function activateOnKeyboard(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}
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
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({
        label: `Play ${best.san}`,
        description: 'Play the suggested move and continue practice from that position.',
      }) },
      hook: {
        insert: vnode => {
          const el = vnode.elm as HTMLElement;
          const activate = () => { playCommentBest(); redraw(); };
          el.addEventListener('click', activate);
          el.addEventListener('keydown', (event: KeyboardEvent) => activateOnKeyboard(event, activate));
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
          attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({
            label: 'Resume practice',
            description: 'Return to the position where the practice session left its line.',
          }) },
          on: {
            click: () => { practiceResume(); deps.redraw(); },
            keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => { practiceResume(); deps.redraw(); }),
          },
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
              attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({
                label: hint ? (hint.mode === 'piece' ? 'See best move' : 'Hide best move') : 'Get a hint',
                description: !hint
                  ? 'Reveal which piece can make the best move.'
                  : hint.mode === 'piece'
                    ? 'Reveal the destination square for the best move.'
                    : 'Hide the best-move hint.',
              }) },
              on: {
                click: () => { practiceHint(); deps.redraw(); },
                keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => { practiceHint(); deps.redraw(); }),
              },
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
        attrs: { type: 'button', ...iconControlExplainerAttrs({
          label: 'Stop practice',
          description: 'End the current Practice vs. Computer session.',
        }) },
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


  drillReadout?: VNode | null;
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
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Reset practice',
          description: 'Restart from the position where this practice session began.',
        }) },
        on: { click: () => practiceReset() },
      }, 'Reset'),
      h('button.practice-rail__btn', {
        class: { active: feedbackOn },
        attrs: {
          type: 'button',
          'aria-pressed': String(feedbackOn),
          ...controlExplainerAttrs({
            label: feedbackOn ? 'Hide move feedback' : 'Show move feedback',
            description: 'Toggle verdicts and best-move suggestions after each practice move.',
          }),
        },
        on: { click: () => { setPracticeFeedbackEnabled(!feedbackOn); deps.redraw(); } },
      }, feedbackOn ? 'Feedback: On' : 'Feedback: Off'),
      h('button.practice-rail__btn', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: hint ? (hint.mode === 'piece' ? 'See best move' : 'Hide best move') : 'Get a hint',
          description: hint
            ? hint.mode === 'piece'
              ? 'Reveal the destination square for the suggested piece.'
              : 'Hide the displayed best-move guidance.'
            : 'Reveal the candidate piece for the best move in this position.',
        }) },
        on: { click: () => practiceHint() },
      }, hint ? (hint.mode === 'piece' ? 'See best move' : 'Hide best move') : 'Get a hint'),
      h('button.practice-rail__btn.practice-rail__btn--settings', {
        class: { active: settingsOpen },
        attrs: {
          type: 'button',
          'aria-expanded': String(settingsOpen),
          ...iconControlExplainerAttrs({
            label: 'Practice settings',
            description: `${settingsOpen ? 'Close' : 'Open'} computer-strength settings.`,
          }),
        },
        on: { click: () => { setPracticeRailSettingsOpen(!settingsOpen); deps.redraw(); } },
      }, '⚙'),
    ]),
    premoveControls,
    deps.drillReadout ?? null,
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
